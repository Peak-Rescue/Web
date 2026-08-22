'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminSetInstructorSectors } from './[id]/actions'

export const SECTORS = [
  { key: 'military', label: 'Military', hint: 'Cleared and comfortable working military and tactical clients' },
  { key: 'civilian', label: 'Civilian', hint: 'SAR, industrial and commercial clients' },
] as const

// Which client sectors an instructor can work — a separate question from what
// they're skilled in. Kept above Expertise because it's the coarser filter:
// sector decides whether they're eligible for the job at all, expertise
// decides what they can run once they are.
export default function SectorPanel({
  instructorId,
  initialSectors,
}: {
  instructorId: string
  initialSectors: string[]
}) {
  const router = useRouter()
  const [sectors, setSectors] = useState<string[]>(initialSectors)
  const [busy, setBusy] = useState(false)

  async function toggle(key: string) {
    if (busy) return
    const next = sectors.includes(key) ? sectors.filter((s) => s !== key) : [...sectors, key]
    setSectors(next)
    setBusy(true)
    try {
      await adminSetInstructorSectors(instructorId, next)
      router.refresh()
    } catch {
      setSectors(sectors) // put it back if the save failed
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {SECTORS.map((s) => {
          const on = sectors.includes(s.key)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              disabled={busy}
              title={s.hint}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
                on ? 'bg-teal-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      {/* Which sectors are on is already legible from the buttons. The only
          thing worth saying is what an empty selection means. */}
      {sectors.length === 0 && (
        <p className="text-xs text-zinc-500 mt-2">Not set — no sector filtering yet.</p>
      )}
    </div>
  )
}
