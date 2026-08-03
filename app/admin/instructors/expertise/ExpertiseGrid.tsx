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

// Every instructor × every skill in one grid. Lead/assist toggles behave the
// same as on an instructor's own profile — click to set, click the active one
// to clear — so there's nothing new to learn. Each click saves on its own.
export default function ExpertiseGrid({ rows }: { rows: GridRow[] }) {
  const [state, setState] = useState<GridRow[]>(rows)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'military' | 'civilian'>('all')

  const visible = state.filter((r) => (filter === 'all' ? true : r.sectors.includes(filter)))

  async function set(row: GridRow, cat: CapabilityCategory, role: CapabilityRole) {
    const key = `${row.id}:${cat}`
    if (pending.has(key)) return
    const next = (row.caps[cat] ?? null) === role ? null : role

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

  const roleBtn = (active: boolean, role: CapabilityRole) =>
    `w-6 h-6 rounded text-[10px] font-bold transition-colors ${
      active
        ? role === 'lead'
          ? 'bg-teal-700 text-white'
          : 'bg-blue-700 text-white'
        : 'bg-zinc-800/70 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300'
    }`

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap shrink-0">
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
          <span className="text-teal-400 font-bold">L</span>ead ·{' '}
          <span className="text-blue-400 font-bold">A</span>ssist — click the active one to clear. Saves as you go.
        </span>
      </div>

      {error && <p className="text-sm text-pr-red mb-2 shrink-0">{error}</p>}

      {/* The only scrolling element on the page, so the pinned header and name
          column stay put and never travel under the site nav. */}
      <div className="flex-1 min-h-0 overflow-auto border border-zinc-800 rounded-lg">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-zinc-900 text-left font-medium text-zinc-400 px-3 py-2 border-b border-zinc-800">
                Instructor
              </th>
              <th className="sticky top-0 z-20 bg-zinc-900 px-2 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                Sector
              </th>
              {CAPABILITY_ORDER.map((c) => (
                <th
                  key={c}
                  className="sticky top-0 z-20 bg-zinc-900 px-1.5 py-2 text-[10px] font-medium text-zinc-500 align-bottom border-b border-zinc-800"
                >
                  <span className="block leading-tight">{CAPABILITY_META[c].label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="group">
                <td className="sticky left-0 z-10 bg-zinc-950 group-hover:bg-zinc-900 px-3 py-1.5 whitespace-nowrap border-b border-zinc-900">
                  <Link href={`/admin/instructors/${r.id}`} className="hover:text-pr-red-light transition-colors">
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap border-b border-zinc-900 group-hover:bg-zinc-900/40">
                  <div className="flex gap-1">
                    {(['military', 'civilian'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleSector(r, s)}
                        title={`${r.sectors.includes(s) ? 'Cleared' : 'Not cleared'} for ${s} work`}
                        className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
                          r.sectors.includes(s)
                            ? 'bg-zinc-600 text-white'
                            : 'bg-zinc-800/70 text-zinc-600 hover:bg-zinc-700'
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
                    <td key={c} className="px-1 py-1.5 border-b border-zinc-900 group-hover:bg-zinc-900/40">
                      <div className="flex gap-0.5 justify-center">
                        {(['lead', 'assist'] as CapabilityRole[]).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => set(r, c, opt)}
                            title={`${r.name} — ${CAPABILITY_META[c].label}: ${opt}`}
                            className={roleBtn(role === opt, opt)}
                          >
                            {opt === 'lead' ? 'L' : 'A'}
                          </button>
                        ))}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 mt-2 shrink-0">
        {visible.length} instructor{visible.length === 1 ? '' : 's'} shown.
      </p>
    </div>
  )
}
