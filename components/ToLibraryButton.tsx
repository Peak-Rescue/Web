'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { errorFrom, type ActionResult } from '@/lib/action-result'

// "Keep this" — on a file that arrived through a course.
//
// One button and one question. The question is the same one the library asks
// of everything else, because what it is decides which shelf it lands on and
// what will offer it later; asked here, where the person knows the answer,
// rather than left for whoever opens the sorting pile next week.
//
// The kinds offered are the ones a course file actually turns out to be. The
// long list lives on the library row, where something can be re-typed once
// somebody has read it.
const KINDS: { value: string; label: string }[] = [
  { value: 'medevac', label: 'MEDEVAC plan' },
  { value: 'permit', label: 'Permit' },
  { value: 'map', label: 'Map' },
  { value: 'route', label: 'Beta' },
  { value: 'kit_list', label: 'Gear list' },
  { value: 'skill_sheet', label: 'Skill sheet' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'manual', label: 'Manual' },
  { value: 'form', label: 'Form' },
  { value: 'reference', label: 'Something else' },
]

export default function ToLibraryButton({
  onAdd,
  label = 'To library',
}: {
  onAdd: (kind: string) => Promise<ActionResult>
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) return <span className="text-xs text-zinc-600 shrink-0">In the library</span>

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Keep this in the library, so another course can reach for it"
        className="text-xs text-zinc-500 hover:text-white transition-colors shrink-0"
      >
        {label}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <select
        autoFocus
        disabled={busy}
        defaultValue=""
        onChange={async (e) => {
          const kind = e.target.value
          if (!kind) return
          setBusy(true)
          setError(null)
          try {
            const r = await onAdd(kind)
            if (r?.error) setError(r.error)
            else { setDone(true); router.refresh() }
          } catch (err) {
            setError(errorFrom(err, 'That didn’t save'))
          } finally {
            setBusy(false)
          }
        }}
        className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
      >
        <option value="">{busy ? 'Filing…' : 'What is it?'}</option>
        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <button
        onClick={() => { setOpen(false); setError(null) }}
        disabled={busy}
        className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-pr-red">{error}</span>}
    </span>
  )
}
