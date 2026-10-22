'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { errorFrom, type ActionResult } from '@/lib/action-result'
import { KIND_META, type LibraryKind } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'

// Adding something that already exists.
//
// The other half of filing. Every screen that takes a file or a link should
// take one off the shelves too, or the library is a place things go and never
// come back from — and the second copy somebody uploads instead is the thing
// the shelves were built to stop.
//
// Suggestions first and said why: what this course's place and expertise
// match, then the rest, searchable. The ranking is the picker's, not this
// component's, so every door reaches for the same row.

export type LibraryChoice = {
  id: string
  title: string
  url: string | null
  kind: string
  audience: 'internal' | 'shared'
  venueName: string | null
  regionLabel: string | null
  suggested: boolean
  matchedOn: 'client' | 'offering' | 'venue' | 'region' | 'discipline' | null
  disciplineLabel: string | null
  alreadyAdded: boolean
}

export default function FromLibraryPicker({
  onOpen,
  onAdd,
  onPick,
  title = 'Add from the library',
}: {
  onOpen: () => Promise<LibraryChoice[]>
  /** Where the thing being added is a row somewhere — a course file. */
  onAdd?: (ids: string[]) => Promise<ActionResult>
  /** Where it is a draft being composed in the browser — an update's links,
      a meeting point's. Nothing is saved until the composer is. */
  onPick?: (rows: LibraryChoice[]) => void
  title?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<LibraryChoice[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function show() {
    setOpen(true)
    setBusy(true)
    setError(null)
    try {
      setRows(await onOpen())
    } catch (e) {
      setError(errorFrom(e, 'Could not read the library'))
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    setBusy(true)
    setError(null)
    try {
      if (onPick) {
        onPick((rows ?? []).filter((r) => picked.has(r.id)))
      } else if (onAdd) {
        const r = await onAdd([...picked])
        if (r?.error) { setError(r.error); return }
        router.refresh()
      }
      setOpen(false)
      setPicked(new Set())
      setRows(null)
    } catch (e) {
      setError(errorFrom(e, 'That didn’t add'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={show}
        title={title}
        aria-label={title}
        className="inline-flex items-center justify-center w-8 h-8 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
      </button>
    )
  }

  const needle = q.trim().toLowerCase()
  const shown = (rows ?? [])
    .filter((r) => !r.alreadyAdded)
    .filter((r) => !needle || r.title.toLowerCase().includes(needle))
    // Suggested first: what the course's place and expertise match is the
    // answer nine times out of ten, and the tenth is why there is a search box.
    .sort((a, b) => Number(b.suggested) - Number(a.suggested))

  return (
    <div className="basis-full mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded space-y-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the library…"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-zinc-500"
      />

      <div className="max-h-64 overflow-y-auto space-y-1">
        {busy && !rows && <p className="text-xs text-zinc-500">Reading the library…</p>}
        {rows && shown.length === 0 && (
          <p className="text-xs text-zinc-600">Nothing on the shelves matches that.</p>
        )}
        {shown.map((r) => (
          <label
            key={r.id}
            className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-900 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={picked.has(r.id)}
              onChange={() =>
                setPicked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id)
                  else next.add(r.id)
                  return next
                })
              }
              className="accent-pr-red shrink-0"
            />
            <span className="text-xs text-zinc-200 truncate">{r.title}</span>
            <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
              {KIND_META[r.kind as LibraryKind] || 'No type yet'}
            </span>
            {/* Why it is near the top, in the word that put it there. */}
            {r.matchedOn === 'client' && <span className="text-[10px] text-zinc-500 shrink-0">this client</span>}
            {r.matchedOn === 'offering' && <span className="text-[10px] text-zinc-500 shrink-0">this course</span>}
            {r.matchedOn === 'venue' && r.venueName && <span className="text-[10px] text-zinc-500 shrink-0">{r.venueName}</span>}
            {r.matchedOn === 'region' && r.regionLabel && <span className="text-[10px] text-zinc-500 shrink-0">{r.regionLabel}</span>}
            {r.matchedOn === 'discipline' && r.disciplineLabel && (
              <span className="text-[10px] text-zinc-500 shrink-0">{r.disciplineLabel}</span>
            )}
            {r.audience === 'internal' && <AudiencePills audience="internal" className="ml-auto shrink-0" />}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || picked.size === 0}
          onClick={add}
          className="px-3 py-1 bg-pr-red hover:bg-pr-red-dark text-white rounded text-xs font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Adding…' : `Add ${picked.size || ''}`.trim()}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setOpen(false); setPicked(new Set()); setError(null) }}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-pr-red">{error}</span>}
      </div>
    </div>
  )
}
