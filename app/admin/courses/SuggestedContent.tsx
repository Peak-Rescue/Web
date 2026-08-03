'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyLibrarySelection } from './actions'
import { KIND_META, AUDIENCE_META, type LibraryAudience } from '@/lib/library'
import { type PickerItem } from './LibraryPicker'

// The suggested content set for a course, grouped the way it was grouped in
// Classroom — one group per topic tag, which becomes a section. Everything is
// pre-ticked; you untick what this delivery doesn't need. Groups that are
// normally instructor-only (venue, permits, instructor info) default that way
// and can be flipped per course, because who sees the venue pack changes with
// the client.
const INTERNAL_BY_DEFAULT = /instructor|do not post|venue|permit|logistic|debrief|roster|bid|confidential/i

type Group = { title: string; items: PickerItem[] }

export default function SuggestedContent({
  instanceId,
  items,
  existingItemIds,
}: {
  instanceId: string
  items: PickerItem[]
  existingItemIds: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  // Only suggested material, and only what isn't already on the course.
  const groups: Group[] = useMemo(() => {
    const have = new Set(existingItemIds)
    const map = new Map<string, PickerItem[]>()
    for (const i of items) {
      if (!i.suggested || have.has(i.id)) continue
      const key = i.topics.find((t) => t !== 'needs-link-check') ?? 'Other material'
      map.set(key, [...(map.get(key) ?? []), i])
    }
    return [...map.entries()]
      .map(([title, its]) => ({ title, items: its.sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [items, existingItemIds])

  const [checked, setChecked] = useState<Set<string>>(() => new Set(items.map((i) => i.id)))
  const [audience, setAudience] = useState<Record<string, LibraryAudience>>({})

  const audienceOf = (title: string): LibraryAudience =>
    audience[title] ?? (INTERNAL_BY_DEFAULT.test(title) ? 'internal' : 'shared')

  const selectedCount = groups.reduce(
    (n, g) => n + g.items.filter((i) => checked.has(i.id)).length, 0
  )

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
    try {
      const payload = groups
        .map((g) => ({
          title: g.title,
          audience: audienceOf(g.title),
          itemIds: g.items.filter((i) => checked.has(i.id)).map((i) => i.id),
        }))
        .filter((g) => g.itemIds.length > 0)
      const res = await applyLibrarySelection(instanceId, payload)
      setDone(`Added ${res.items} item${res.items === 1 ? '' : 's'} across ${res.sections || 'existing'} section${res.sections === 1 ? '' : 's'}.`)
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (groups.length === 0) {
    return done ? <p className="text-xs text-teal-400 mb-3">{done}</p> : null
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setOpen(true)}
          className="text-xs px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors"
        >
          Add suggested content ({groups.reduce((n, g) => n + g.items.length, 0)} items)
        </button>
        {done && <p className="text-xs text-teal-400 mt-2">{done}</p>}
      </div>
    )
  }

  return (
    <div className="mb-6 p-4 bg-zinc-900 border border-zinc-700 rounded-lg">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold">Suggested content</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Matched to this course&rsquo;s discipline and venue. Untick anything this delivery doesn&rsquo;t need —
            each group becomes a section.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setAll(true)} className="text-zinc-400 hover:text-white transition-colors">Check all</button>
          <span className="text-zinc-700">·</span>
          <button onClick={() => setAll(false)} className="text-zinc-400 hover:text-white transition-colors">Uncheck all</button>
        </div>
      </div>

      <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
        {groups.map((g) => {
          const on = g.items.filter((i) => checked.has(i.id)).length
          const all = on === g.items.length
          const aud = audienceOf(g.title)
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
                <select
                  value={aud}
                  onChange={(e) => setAudience({ ...audience, [g.title]: e.target.value as LibraryAudience })}
                  className="ml-auto bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
                >
                  <option value="shared">{AUDIENCE_META.shared.choice}</option>
                  <option value="internal">{AUDIENCE_META.internal.choice}</option>
                </select>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {g.items.map((i) => (
                  <label key={i.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-zinc-800/40">
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
                    {i.venueName && (
                      <span className="text-[10px] text-blue-400/70 shrink-0">{i.venueName}</span>
                    )}
                    {i.url && (
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto shrink-0 text-zinc-700 hover:text-zinc-300 transition-colors"
                        title="Open"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                        </svg>
                      </a>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={apply}
          disabled={busy || selectedCount === 0}
          className="px-4 py-2 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Adding…' : `Add ${selectedCount} item${selectedCount === 1 ? '' : 's'}`}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
