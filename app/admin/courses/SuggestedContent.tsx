'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyLibrarySelection } from './actions'
import { KIND_META, AUDIENCE_META, type LibraryAudience } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory } from '@/lib/capabilities'
import { type PickerItem } from './LibraryPicker'

// Library material offered for a course, grouped by the topic it came from —
// each group becomes a section. Suggested material (this course's expertise or
// venue) leads, but everything is reachable: a jungle course often wants the
// canyon set, and there's no reason to make that the hard path.
//
// Audience is set per section and can be overridden per item, which is how one
// instructor-only file lives inside a section students can see.
type Group = { title: string; items: PickerItem[] }

export default function SuggestedContent({
  instanceId,
  items,
  existingItemIds,
  courseDisciplines,
}: {
  instanceId: string
  items: PickerItem[]
  existingItemIds: string[]
  courseDisciplines: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<string>('suggested')
  const [q, setQ] = useState('')

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [groupAudience, setGroupAudience] = useState<Record<string, LibraryAudience>>({})
  const [itemAudience, setItemAudience] = useState<Record<string, LibraryAudience>>({})

  const groups: Group[] = useMemo(() => {
    const have = new Set(existingItemIds)
    const needle = q.trim().toLowerCase()
    const map = new Map<string, PickerItem[]>()
    for (const i of items) {
      if (have.has(i.id)) continue
      if (scope === 'suggested' && !i.suggested && !needle) continue
      if (scope !== 'suggested' && scope !== 'all' && !i.disciplines.includes(scope)) continue
      if (needle && !i.title.toLowerCase().includes(needle) && !i.topics.some((t) => t.toLowerCase().includes(needle))) continue
      const key = i.topics.find((t) => t !== 'needs-link-check') ?? 'Other material'
      map.set(key, [...(map.get(key) ?? []), i])
    }
    return [...map.entries()]
      .map(([title, its]) => ({ title, items: its.sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [items, existingItemIds, scope, q])

  // A section defaults to what its items already say, not to a guess from the
  // section's name. Mixed groups default to the stricter level.
  const defaultGroupAudience = (g: Group): LibraryAudience =>
    g.items.every((i) => i.audience === 'shared') ? 'shared' : 'internal'
  const audienceOf = (g: Group): LibraryAudience => groupAudience[g.title] ?? defaultGroupAudience(g)
  const audienceOfItem = (g: Group, i: PickerItem): LibraryAudience =>
    itemAudience[i.id] ?? i.audience ?? audienceOf(g)

  const selected = groups.flatMap((g) => g.items.filter((i) => checked.has(i.id)))

  function setGroup(g: Group, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const i of g.items) {
        if (on) next.add(i.id)
        else next.delete(i.id)
      }
      return next
    })
  }

  function toggleItem(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setAll(on: boolean) {
    setChecked(on ? new Set(groups.flatMap((g) => g.items.map((i) => i.id))) : new Set())
  }

  async function apply() {
    setBusy(true)
    setError(null)
    try {
      const payload = groups
        .map((g) => ({
          title: g.title,
          audience: audienceOf(g),
          items: g.items
            .filter((i) => checked.has(i.id))
            .map((i) => ({ id: i.id, audience: audienceOfItem(g, i) })),
        }))
        .filter((g) => g.items.length > 0)
      const res = await applyLibrarySelection(instanceId, payload)
      setDone(`Added ${res.items} item${res.items === 1 ? '' : 's'}.`)
      setOpen(false)
      setChecked(new Set())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the content — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const totalSuggested = items.filter((i) => i.suggested && !existingItemIds.includes(i.id)).length

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={() => { setOpen(true); setChecked(new Set()) }}
          className="text-xs px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors"
        >
          Add content from library{totalSuggested > 0 ? ` (${totalSuggested} suggested)` : ''}
        </button>
        {done && <p className="text-xs text-teal-400 mt-2">{done}</p>}
      </div>
    )
  }

  const select = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-zinc-500'

  return (
    <div className="mb-6 p-4 bg-zinc-900 border border-zinc-700 rounded-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold">Add content from the library</h3>
          <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">
            Each group becomes a section. Tick what this delivery needs, set who sees each section, and override
            individual items where they differ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className={`w-36 ${select}`}
          />
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={select}>
            <option value="suggested">
              Suggested for this course{courseDisciplines.length ? ` (${courseDisciplines.map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d).join(', ')})` : ''}
            </option>
            <option value="all">Everything in the library</option>
            {CAPABILITY_ORDER.map((c) => (
              <option key={c} value={c}>{CAPABILITY_META[c].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs mb-2">
        <button onClick={() => setAll(true)} className="text-zinc-400 hover:text-white transition-colors">Check all</button>
        <span className="text-zinc-700">·</span>
        <button onClick={() => setAll(false)} className="text-zinc-400 hover:text-white transition-colors">Uncheck all</button>
        <span className="text-zinc-600 ml-2">{selected.length} selected</span>
      </div>

      <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
        {groups.map((g) => {
          const on = g.items.filter((i) => checked.has(i.id)).length
          const all = on === g.items.length
          const gAud = audienceOf(g)
          return (
            <div key={g.title} className="border border-zinc-800 rounded">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950/60 flex-wrap">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => { if (el) el.indeterminate = on > 0 && !all }}
                  onChange={() => setGroup(g, !all)}
                  className="accent-red-600"
                />
                <span className="text-sm font-medium">{g.title}</span>
                <span className="text-[11px] text-zinc-600">{on}/{g.items.length}</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-zinc-600">Section:</span>
                  <select
                    value={gAud}
                    onChange={(e) => setGroupAudience({ ...groupAudience, [g.title]: e.target.value as LibraryAudience })}
                    className={select}
                  >
                    <option value="shared">{AUDIENCE_META.shared.choice}</option>
                    <option value="internal">{AUDIENCE_META.internal.choice}</option>
                  </select>
                </div>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {g.items.map((i) => {
                  const iAud = audienceOfItem(g, i)
                  const off = courseDisciplines.length > 0 && !i.disciplines.some((d) => courseDisciplines.includes(d))
                  return (
                    <div key={i.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-zinc-800/40">
                      <input
                        type="checkbox"
                        checked={checked.has(i.id)}
                        onChange={() => toggleItem(i.id)}
                        className="accent-red-600 shrink-0"
                      />
                      <span className="truncate">{i.title}</span>
                      <span className="text-[10px] text-zinc-600 shrink-0">
                        {KIND_META[i.kind as keyof typeof KIND_META] ?? i.kind}
                      </span>
                      {i.venueName && <span className="text-[10px] text-blue-400/70 shrink-0">{i.venueName}</span>}
                      {off && (
                        <span className="text-[10px] text-yellow-500/80 shrink-0" title="From another discipline">
                          {i.disciplines.map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d).join(', ')}
                        </span>
                      )}
                      <button
                        onClick={() => setItemAudience({ ...itemAudience, [i.id]: iAud === 'shared' ? 'internal' : 'shared' })}
                        title="Who sees this item — click to change"
                        className={`ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          iAud === 'shared'
                            ? 'bg-teal-900/50 text-teal-300 hover:bg-teal-900'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {AUDIENCE_META[iAud].badge}
                      </button>
                      {i.url && (
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-zinc-700 hover:text-zinc-300 transition-colors"
                          title="Open"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                          </svg>
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {groups.length === 0 && (
          <p className="text-xs text-zinc-500 py-4">
            {scope === 'suggested'
              ? 'Nothing suggested for this course — try “Everything in the library”.'
              : 'Nothing matches.'}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-pr-red mt-3">{error}</p>}

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={apply}
          disabled={busy || selected.length === 0}
          className="px-4 py-2 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Adding…' : `Add ${selected.length} item${selected.length === 1 ? '' : 's'}`}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
