'use client'

import { useState } from 'react'
import Link from 'next/link'
import { adminSetExpertise, adminSetInstructorSectors } from '../[id]/actions'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory, type CapabilityRole } from '@/lib/capabilities'

export type GridRow = {
  id: string
  name: string
  sectors: string[]
  caps: Record<string, CapabilityRole>
}

// Every instructor × every skill in one grid. Click a cell to cycle
// none → assist → lead → none; each click saves on its own, so a whole roster
// pass is just clicking across rows.
const CYCLE: (CapabilityRole | null)[] = [null, 'assist', 'lead']

export default function ExpertiseGrid({ rows }: { rows: GridRow[] }) {
  const [state, setState] = useState<GridRow[]>(rows)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'military' | 'civilian'>('all')

  const visible = state.filter((r) =>
    filter === 'all' ? true : r.sectors.includes(filter)
  )

  async function cycle(row: GridRow, cat: CapabilityCategory) {
    const key = `${row.id}:${cat}`
    if (pending.has(key)) return
    const current = row.caps[cat] ?? null
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]

    // Optimistic — the grid should feel like a spreadsheet, not a form.
    setState((prev) =>
      prev.map((r) => {
        if (r.id !== row.id) return r
        const caps = { ...r.caps }
        if (next === null) delete caps[cat]
        else caps[cat] = next
        return { ...r, caps }
      })
    )
    setPending((p) => new Set(p).add(key))
    setError('')
    try {
      await adminSetExpertise(row.id, cat, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setState(rows) // fall back to the server's view
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(key)
        return n
      })
    }
  }

  async function toggleSector(row: GridRow, sector: string) {
    const next = row.sectors.includes(sector)
      ? row.sectors.filter((s) => s !== sector)
      : [...row.sectors, sector]
    setState((prev) => prev.map((r) => (r.id === row.id ? { ...r, sectors: next } : r)))
    try {
      await adminSetInstructorSectors(row.id, next)
    } catch {
      setState(rows)
    }
  }

  const cellClass = (role: CapabilityRole | null) =>
    role === 'lead'
      ? 'bg-teal-700 text-white'
      : role === 'assist'
        ? 'bg-blue-700 text-white'
        : 'bg-zinc-800/60 text-zinc-700 hover:bg-zinc-700 hover:text-zinc-400'

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          {(['all', 'military', 'civilian'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm capitalize transition-colors ${
                filter === f ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f === 'all' ? 'Everyone' : `${f}-cleared`}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">
          Click a cell to cycle — blank → <span className="text-blue-400">assist</span> →{' '}
          <span className="text-teal-400">lead</span>. Saves as you go.
        </span>
      </div>

      {error && <p className="text-sm text-pr-red mb-3">{error}</p>}

      <div className="overflow-x-auto border border-zinc-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900">
              <th className="text-left font-medium text-zinc-400 px-3 py-2 sticky left-0 bg-zinc-900 z-10">
                Instructor
              </th>
              <th className="px-2 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Sector</th>
              {CAPABILITY_ORDER.map((c) => (
                <th key={c} className="px-1.5 py-2 text-[10px] font-medium text-zinc-500 align-bottom">
                  <span className="block leading-tight">{CAPABILITY_META[c].label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-zinc-950 z-10">
                  <Link href={`/admin/instructors/${r.id}`} className="hover:text-pr-red-light transition-colors">
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    {(['military', 'civilian'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleSector(r, s)}
                        title={`${r.sectors.includes(s) ? 'Cleared' : 'Not cleared'} for ${s} work`}
                        className={`w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                          r.sectors.includes(s)
                            ? 'bg-zinc-600 text-white'
                            : 'bg-zinc-800/60 text-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {s === 'military' ? 'M' : 'C'}
                      </button>
                    ))}
                  </div>
                </td>
                {CAPABILITY_ORDER.map((c) => {
                  const role = r.caps[c] ?? null
                  return (
                    <td key={c} className="px-1 py-1.5 text-center">
                      <button
                        onClick={() => cycle(r, c)}
                        title={`${r.name} — ${CAPABILITY_META[c].label}: ${role ?? 'none'}`}
                        className={`w-7 h-6 rounded text-[10px] font-bold transition-colors ${cellClass(role)}`}
                      >
                        {role === 'lead' ? 'L' : role === 'assist' ? 'A' : '·'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 mt-3">
        {visible.length} instructor{visible.length === 1 ? '' : 's'} shown.
      </p>
    </div>
  )
}
