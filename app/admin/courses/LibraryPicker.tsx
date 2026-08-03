'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addLibraryItems } from './actions'
import { KIND_META, AUDIENCE_META, type LibraryAudience } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory } from '@/lib/capabilities'

export type PickerItem = {
  id: string
  title: string
  url: string | null
  kind: string
  audience: LibraryAudience
  disciplines: string[]
  topics: string[]
  venue_id: string | null
  venueName: string | null
  suggested: boolean // this course's discipline, or its venue
}

// Adds library material to a section. Material for this course's discipline
// (or venue) leads; everything else is one filter away, because canyon content
// on a backcountry course is a legitimate call — just one worth seeing you
// make. Each row shows what it is before you add it, and every item can be
// opened first.
export default function LibraryPicker({
  instanceId,
  moduleId,
  moduleAudience,
  courseDisciplines,
  items,
}: {
  instanceId: string
  moduleId: string
  moduleAudience: LibraryAudience
  courseDisciplines: string[]
  items: PickerItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<string>('suggested') // 'suggested' | 'all' | a discipline
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items
      .filter((i) => {
        if (scope === 'suggested' && !i.suggested && !needle) return false
        if (scope !== 'suggested' && scope !== 'all' && !i.disciplines.includes(scope)) return false
        if (!needle) return true
        return (
          i.title.toLowerCase().includes(needle) ||
          i.topics.some((t) => t.toLowerCase().includes(needle)) ||
          (i.venueName ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title))
      .slice(0, 80)
  }, [items, q, scope])

  const chosen = [...selected].map((id) => items.find((i) => i.id === id)).filter(Boolean) as PickerItem[]
  const offDiscipline = chosen.filter(
    (i) => courseDisciplines.length > 0 && !i.disciplines.some((d) => courseDisciplines.includes(d))
  )
  const heldBack = chosen.filter((i) => moduleAudience === 'shared' && i.audience === 'internal')

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await addLibraryItems(instanceId, moduleId, [...selected])
      setSelected(new Set())
      setOpen(false)
      setQ('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
      >
        + Add from library
      </button>
    )
  }

  const select = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="p-3 bg-zinc-950/60 border border-zinc-700 rounded-lg">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, tag or venue…"
          className={`flex-1 min-w-40 ${select}`}
        />
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={select}>
          <option value="suggested">Suggested for this course</option>
          <option value="all">Everything</option>
          {CAPABILITY_ORDER.map((c) => (
            <option key={c} value={c}>{CAPABILITY_META[c].label}</option>
          ))}
        </select>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/60 border border-zinc-800 rounded">
        {visible.map((i) => {
          const off = courseDisciplines.length > 0 && !i.disciplines.some((d) => courseDisciplines.includes(d))
          return (
            <label key={i.id} className="flex items-start gap-2.5 px-2.5 py-2 text-sm cursor-pointer hover:bg-zinc-800/50">
              <input
                type="checkbox"
                checked={selected.has(i.id)}
                onChange={() => toggle(i.id)}
                className="accent-red-600 mt-1 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="truncate">{i.title}</span>
                  <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-500 shrink-0">
                    {KIND_META[i.kind as keyof typeof KIND_META] ?? i.kind}
                  </span>
                  {i.audience === 'internal' && (
                    <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
                      {AUDIENCE_META.internal.badge}
                    </span>
                  )}
                  {i.venueName && (
                    <span className="text-[10px] px-1 rounded bg-blue-900/40 text-blue-300 shrink-0">{i.venueName}</span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
                  <span className={off ? 'text-yellow-500/80' : 'text-zinc-500'}>
                    {i.disciplines.map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d).join(' · ') || 'untagged'}
                  </span>
                  {i.topics.filter((t) => t !== 'needs-link-check').length > 0 &&
                    ` — ${i.topics.filter((t) => t !== 'needs-link-check').join(', ')}`}
                </p>
              </div>
              {i.url && (
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open before adding"
                  className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                  </svg>
                </a>
              )}
            </label>
          )
        })}
        {visible.length === 0 && (
          <p className="text-xs text-zinc-500 px-2.5 py-4">
            {q ? 'Nothing matches — try Everything in the filter.' : 'Nothing suggested for this course yet.'}
          </p>
        )}
      </div>

      {(offDiscipline.length > 0 || heldBack.length > 0) && (
        <div className="mt-2 space-y-1">
          {offDiscipline.length > 0 && (
            <p className="text-[11px] text-yellow-300/90">
              {offDiscipline.length} item{offDiscipline.length === 1 ? '' : 's'} from another discipline
              {' '}({[...new Set(offDiscipline.flatMap((i) => i.disciplines))]
                .map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d).join(', ')}) — fine, just flagging it.
            </p>
          )}
          {heldBack.length > 0 && (
            <p className="text-[11px] text-zinc-400">
              {heldBack.length} marked {AUDIENCE_META.internal.choice.toLowerCase()} — stays hidden from students
              even in this section.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={add}
          disabled={busy || selected.size === 0}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Adding…' : selected.size ? `Add ${selected.size}` : 'Add'}
        </button>
        <span className="text-[11px] text-zinc-600">
          {visible.length} shown{scope === 'suggested' ? ' · suggested by this course’s discipline and venue' : ''}
        </span>
      </div>
    </div>
  )
}
