'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setReimbursed } from './actions'

export default function ReimbursedToggle({
  reportId,
  reimbursedOn,
}: {
  reportId: string
  reimbursedOn: string | null
}) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const done = Boolean(reimbursedOn)

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      await setReimbursed(reportId, !done)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // Dates come back as plain YYYY-MM-DD; parsing that with Date() would read it
  // as UTC midnight and render the day before in Mountain time.
  const label = reimbursedOn
    ? new Date(`${reimbursedOn}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={done ? 'Reimbursed — click to undo' : 'Mark this reimbursement as paid out to you'}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors disabled:opacity-50 ${
        done ? 'text-teal-300 hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      <span
        className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center text-[9px] leading-none ${
          done ? 'bg-teal-500/20 border-teal-500 text-teal-300' : 'border-zinc-600'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      {done ? `Reimbursed ${label}` : 'Mark reimbursed'}
    </button>
  )
}
