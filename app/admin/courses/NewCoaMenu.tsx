'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createEstimateCoa, duplicateEstimateCoa, copyEstimatesFrom, copyEstimateCoaFrom } from './finance-actions'

// The one entry point for adding a COA, with its three starting points:
// seeded default lines, a copy of an existing COA on this course, or a COA
// copied from another course (which opens the grouped course picker inline).

export type CopySource = {
  id: string
  name: string
  typeKey: string
  typeLabel: string
  client: string | null
  month: string | null
  sameType: boolean
  sameClient: boolean
  coas: { id: string; title: string; price: number }[]
}

function fmtPrice(p: number) {
  return `$${p.toLocaleString('en-US')}`
}

const rowCls =
  'w-full text-left px-3 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50'

export default function NewCoaMenu({
  instanceId,
  coas,
  sources,
}: {
  instanceId: string
  coas: { id: string; title: string }[] // persisted COAs on this course
  sources: CopySource[]
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'sources'>('menu')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
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

  const done = () => {
    setOpen(false)
    setView('menu')
    setQuery('')
    setTypeFilter(null)
    setExpanded(null)
  }

  const run = (action: () => Promise<unknown>) => {
    startTransition(async () => {
      await action()
      done()
    })
  }

  // Category chips: one per course type present, busiest first.
  const typeChips = [...sources.reduce((m, s) => {
    const c = m.get(s.typeKey)
    m.set(s.typeKey, { label: s.typeLabel, count: (c?.count ?? 0) + 1 })
    return m
  }, new Map<string, { label: string; count: number }>()).entries()].sort((a, b) => b[1].count - a[1].count)

  const q = query.trim().toLowerCase()
  const filtered = sources.filter(
    (s) => (!typeFilter || s.typeKey === typeFilter) && (!q || `${s.name} ${s.client ?? ''}`.toLowerCase().includes(q))
  )
  const groups = [
    { title: 'Same course type', items: filtered.filter((s) => s.sameType) },
    { title: 'Same client', items: filtered.filter((s) => !s.sameType && s.sameClient) },
    { title: 'Other courses', items: filtered.filter((s) => !s.sameType && !s.sameClient) },
  ].filter((g) => g.items.length > 0)
  const showHeaders = groups.length > 1 || groups[0]?.title !== 'Other courses'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors disabled:opacity-50"
      >
        {pending ? 'Adding…' : '+ New COA'}
      </button>

      {open && view === 'menu' && (
        <div className="absolute left-0 top-full mt-2 z-20 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2">
          <button type="button" disabled={pending} onClick={() => run(() => createEstimateCoa(instanceId))} className={rowCls}>
            <span className="block">With default lines</span>
            <span className="block text-xs text-zinc-500">The standard recurring costs, quantities guessed from this course</span>
          </button>
          {coas.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending}
              onClick={() => run(() => duplicateEstimateCoa(instanceId, c.id))}
              className={rowCls}
            >
              <span className="block truncate">Copy of &ldquo;{c.title}&rdquo;</span>
              <span className="block text-xs text-zinc-500">Same lines and margin, tweak from there</span>
            </button>
          ))}
          {coas.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-600">
              The estimate above is still the untouched defaults — once it saves (edit any field), it&rsquo;ll show
              here as a copy source too.
            </p>
          )}
          {sources.length > 0 && (
            <button type="button" disabled={pending} onClick={() => setView('sources')} className={rowCls}>
              <span className="block">From another course…</span>
              <span className="block text-xs text-zinc-500">Copy a priced COA from a similar course</span>
            </button>
          )}
        </div>
      )}

      {open && view === 'sources' && (
        <div className="absolute left-0 top-full mt-2 z-20 w-[26rem] max-w-[90vw] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2">
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => setView('menu')}
              className="shrink-0 px-2 py-2 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              ←
            </button>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search course or client…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
          </div>
          {typeChips.length > 1 && (
            <div className="flex flex-wrap gap-1 px-1 py-1.5">
              <button
                type="button"
                onClick={() => setTypeFilter(null)}
                className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${typeFilter === null ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              >
                All
              </button>
              {typeChips.map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(typeFilter === key ? null : key)}
                  className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${typeFilter === key ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                >
                  {t.label} <span className="text-zinc-600">{t.count}</span>
                </button>
              ))}
            </div>
          )}
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
                        onClick={() =>
                          s.coas.length === 1
                            ? run(() => copyEstimateCoaFrom(instanceId, s.coas[0].id))
                            : setExpanded(expanded === s.id ? null : s.id)
                        }
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
                                onClick={() => run(() => copyEstimateCoaFrom(instanceId, c.id))}
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
                              onClick={() =>
                                run(() => {
                                  const fd = new FormData()
                                  fd.set('source_instance_id', s.id)
                                  return copyEstimatesFrom(instanceId, fd)
                                })
                              }
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
