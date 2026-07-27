'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { copyEstimatesFrom, copyEstimateCoaFrom } from './finance-actions'

// Course picker for "copy estimate from course", organized around how the
// choice is actually made: same-type courses first, then the same client,
// then everything else — with each course's COA prices visible up front.
// One-COA courses copy on click; multi-COA courses expand to pick.

export type CopySource = {
  id: string
  name: string
  client: string | null
  month: string | null
  sameType: boolean
  sameClient: boolean
  coas: { id: string; title: string; price: number }[]
}

function fmtPrice(p: number) {
  return `$${p.toLocaleString('en-US')}`
}

export default function CopyEstimatePicker({ instanceId, sources }: { instanceId: string; sources: CopySource[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = (s: CopySource) => !q || `${s.name} ${s.client ?? ''}`.toLowerCase().includes(q)
  const filtered = sources.filter(matches)
  const groups = [
    { title: 'Same course type', items: filtered.filter((s) => s.sameType) },
    { title: 'Same client', items: filtered.filter((s) => !s.sameType && s.sameClient) },
    { title: 'Other courses', items: filtered.filter((s) => !s.sameType && !s.sameClient) },
  ].filter((g) => g.items.length > 0)
  const showHeaders = groups.length > 1 || groups[0]?.title !== 'Other courses'

  const done = () => {
    setOpen(false)
    setQuery('')
    setExpanded(null)
  }

  const copyCoa = (estimateId: string) => {
    startTransition(async () => {
      await copyEstimateCoaFrom(instanceId, estimateId)
      done()
    })
  }

  const copyAll = (sourceId: string) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('source_instance_id', sourceId)
      await copyEstimatesFrom(instanceId, fd)
      done()
    })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors disabled:opacity-50"
      >
        {pending ? 'Copying…' : 'Copy estimate from course'}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-20 w-[26rem] max-w-[90vw] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search course or client…"
            className="w-full mb-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <div className="max-h-80 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.title}>
                {showHeaders && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{g.title}</p>
                )}
                <ul>
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => (s.coas.length === 1 ? copyCoa(s.coas[0].id) : setExpanded(expanded === s.id ? null : s.id))}
                        disabled={pending}
                        title={s.coas.length === 1 ? 'Copy this estimate into the course' : 'Show this course’s COAs'}
                        className="w-full text-left px-3 py-1.5 rounded text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                      >
                        <span className="block truncate">
                          {s.name}
                          {s.client && <span className="text-zinc-500"> · {s.client}</span>}
                        </span>
                        <span className="block text-xs text-zinc-500 truncate">
                          {s.month ? `${s.month} · ` : ''}
                          {s.coas.length === 1
                            ? `1 COA · ${fmtPrice(s.coas[0].price)}`
                            : `${s.coas.length} COAs · ${s.coas.map((c) => fmtPrice(c.price)).join(' / ')}`}
                          {s.coas.length > 1 && <span className="ml-1">{expanded === s.id ? '▾' : '▸'}</span>}
                        </span>
                      </button>
                      {expanded === s.id && (
                        <ul className="ml-3 mb-1 border-l border-zinc-800">
                          {s.coas.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => copyCoa(c.id)}
                                disabled={pending}
                                className="w-full text-left pl-3 pr-3 py-1.5 rounded-r text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
                              >
                                <span className="truncate">{c.title}</span>
                                <span className="shrink-0 text-zinc-500">{fmtPrice(c.price)}</span>
                              </button>
                            </li>
                          ))}
                          <li>
                            <button
                              type="button"
                              onClick={() => copyAll(s.id)}
                              disabled={pending}
                              className="w-full text-left pl-3 pr-3 py-1.5 rounded-r text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-50"
                            >
                              Copy all {s.coas.length} COAs
                            </button>
                          </li>
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-zinc-500">No matching courses</p>}
          </div>
        </div>
      )}
    </div>
  )
}
