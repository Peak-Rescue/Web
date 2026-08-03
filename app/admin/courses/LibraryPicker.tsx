'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addLibraryItems } from './actions'
import { KIND_META, AUDIENCE_META, type LibraryAudience } from '@/lib/library'

export type PickerItem = {
  id: string
  title: string
  kind: string
  audience: LibraryAudience
  disciplines: string[]
  topics: string[]
  venue_id: string | null
  venueName: string | null
  suggested: boolean // matches this course's discipline or venue
}

// Adds library material to a section. Items relevant to this course — same
// discipline, or attached to its venue — surface first, so the common case is
// a couple of clicks rather than a search.
export default function LibraryPicker({
  instanceId,
  moduleId,
  moduleAudience,
  items,
}: {
  instanceId: string
  moduleId: string
  moduleAudience: LibraryAudience
  items: PickerItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items
      .filter((i) => (showAll || i.suggested || needle) && (
        !needle ||
        i.title.toLowerCase().includes(needle) ||
        i.topics.some((t) => t.toLowerCase().includes(needle)) ||
        (i.venueName ?? '').toLowerCase().includes(needle)
      ))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title))
      .slice(0, 60)
  }, [items, q, showAll])

  // Internal material dropped into a section students can see stays hidden by
  // the item's own level, but the mismatch is worth surfacing before it looks
  // like a publishing bug.
  const mismatches = [...selected]
    .map((id) => items.find((i) => i.id === id))
    .filter((i) => i && moduleAudience === 'shared' && i.audience === 'internal')

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

  return (
    <div className="p-3 bg-zinc-950/60 border border-zinc-700 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the library…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
        />
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
        {visible.map((i) => (
          <label
            key={i.id}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-zinc-800/60"
          >
            <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="accent-red-600" />
            <span className="truncate">{i.title}</span>
            <span className="text-[10px] text-zinc-600 shrink-0">{KIND_META[i.kind as keyof typeof KIND_META] ?? i.kind}</span>
            {i.audience === 'internal' && (
              <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-500 shrink-0">{AUDIENCE_META.internal.badge}</span>
            )}
            {i.venueName && <span className="text-[10px] text-blue-400/70 shrink-0">{i.venueName}</span>}
            {i.suggested && <span className="text-[10px] text-teal-500/80 shrink-0 ml-auto">suggested</span>}
          </label>
        ))}
        {visible.length === 0 && (
          <p className="text-xs text-zinc-500 px-2 py-3">
            {q ? 'Nothing matches.' : 'No suggestions for this course — search, or show everything.'}
          </p>
        )}
      </div>

      {mismatches.length > 0 && (
        <p className="mt-2 text-[11px] text-yellow-300/90">
          {mismatches.length} selected item{mismatches.length === 1 ? ' is' : 's are'} marked{' '}
          {AUDIENCE_META.internal.choice.toLowerCase()} — {mismatches.length === 1 ? 'it' : 'they'} will stay hidden from
          students even in this section.
        </p>
      )}

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={add}
          disabled={busy || selected.size === 0}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
        </button>
        {!showAll && !q && (
          <button onClick={() => setShowAll(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Show everything
          </button>
        )}
      </div>
    </div>
  )
}
