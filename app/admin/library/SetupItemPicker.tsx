'use client'

import { useEffect, useRef, useState } from 'react'
import { searchLibraryForSetup } from './actions'
import { KIND_META } from '@/lib/library'
import { CAPABILITY_META } from '@/lib/capabilities'

type Candidate = {
  id: string
  title: string
  kind: string
  bucket: string | null
  audience: string
  disciplines: string[]
  source_class: string | null
}

// Putting library material into a course setup.
//
// Searched rather than listed: the shelf is 822 rows and the question at this
// point is always "where is that one document", never "show me everything".
// The Classroom class each result came from is shown beside it because that is
// how this material is still remembered — "the rigging one from Taiwan" — and
// it is the only way to tell two rows with the same title apart.
export default function SetupItemPicker({
  sectionTitle,
  already,
  onAdd,
}: {
  sectionTitle: string
  already: string[]
  onAdd: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) box.current?.focus()
  }, [open])

  // Typing is faster than the round trip, so the last letter wins and anything
  // still in flight for an older term is dropped rather than painted.
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    // Too short to search on. The results already held are simply not shown —
    // clearing them here would be state set during render, and `shown` below
    // is the honest way to say "nothing to show for what is typed".
    if (term.length < 2) return
    let live = true
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const rows = (await searchLibraryForSetup(term)) as Candidate[]
        if (live) setResults(rows)
      } finally {
        if (live) setSearching(false)
      }
    }, 200)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, open])

  const typed = q.trim().length >= 2
  const shown = typed ? results : []

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-zinc-500 hover:text-white transition-colors"
      >
        + Add material to {sectionTitle}
      </button>
    )
  }

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900/80 p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={box}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the library by title…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={() => { setOpen(false); setQ(''); setResults([]) }}
          className="text-[11px] text-zinc-500 hover:text-white transition-colors"
        >
          Done
        </button>
      </div>

      {typed && (
        <div className="max-h-56 overflow-y-auto divide-y divide-zinc-800">
          {shown.map((r) => {
            const have = already.includes(r.id)
            return (
              <button
                key={r.id}
                disabled={have}
                onClick={() => onAdd([r.id])}
                className="w-full text-left px-1.5 py-1.5 hover:bg-zinc-800/70 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-200">{r.title}</span>
                  {KIND_META[r.kind as keyof typeof KIND_META] && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {KIND_META[r.kind as keyof typeof KIND_META]}
                    </span>
                  )}
                  {have && <span className="text-[10px] text-zinc-600">already here</span>}
                </span>
                <span className="block text-[10px] text-zinc-600 mt-0.5 truncate">
                  {r.disciplines
                    .map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d)
                    .join(', ') || 'no expertise tag'}
                  {r.source_class && ` · from ${r.source_class}`}
                </span>
              </button>
            )
          })}
          {!searching && shown.length === 0 && (
            <p className="px-1.5 py-2 text-[11px] text-zinc-600">Nothing on the shelf matches that.</p>
          )}
        </div>
      )}
    </div>
  )
}
