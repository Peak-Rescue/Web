'use client'

import { useState } from 'react'
import { retirePayFieldRate } from '@/app/admin/courses/actuals-actions'
import TrashIcon from '@/components/TrashIcon'

/** Takes an hourly rate out of the list people can be put on. Retires rather
    than deletes: somebody worked a course on it, and the pay lines that came
    out of that must not depend on this list still holding the number. */
export default function RetirePayRateButton({ hourly }: { hourly: number }) {
  const [busy, setBusy] = useState(false)
  const label = `$${hourly}/h`
  return (
    <button
      onClick={async () => {
        if (busy || !confirm(`Stop offering ${label}? Anyone already on it stays on it.`)) return
        setBusy(true)
        try {
          await retirePayFieldRate(hourly)
        } finally {
          setBusy(false)
        }
      }}
      disabled={busy}
      title={`Stop offering ${label} — anyone already on it stays on it`}
      aria-label={`Stop offering ${label}`}
      className="text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-50"
    >
      <TrashIcon className="w-4 h-4" />
    </button>
  )
}
