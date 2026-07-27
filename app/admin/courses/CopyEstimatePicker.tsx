'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { copyEstimatesFrom } from './finance-actions'

type Source = { id: string; label: string }

export default function CopyEstimatePicker({ instanceId, sources }: { instanceId: string; sources: Source[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
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
  const filtered = q ? sources.filter((s) => s.label.toLowerCase().includes(q)) : sources

  const pick = (sourceId: string) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('source_instance_id', sourceId)
      await copyEstimatesFrom(instanceId, fd)
      setOpen(false)
      setQuery('')
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
        <div className="absolute left-0 top-full mt-2 z-20 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter courses…"
            className="w-full mb-2 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <ul className="max-h-64 overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pick(s.id)}
                  disabled={pending}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {s.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No matching courses</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
