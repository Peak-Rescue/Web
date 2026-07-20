'use client'

import { useState } from 'react'
import { setPricingRateDefault } from '@/app/admin/courses/finance-actions'

export default function DefaultLineToggle({ rateId, initialValue }: { rateId: string; initialValue: boolean }) {
  const [on, setOn] = useState(initialValue)
  const [busy, setBusy] = useState(false)

  return (
    <button
      onClick={async () => {
        if (busy) return
        setBusy(true)
        const next = !on
        try {
          await setPricingRateDefault(rateId, next)
          setOn(next)
        } finally {
          setBusy(false)
        }
      }}
      disabled={busy}
      title="Default lines are pre-added to every new course estimate"
      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-50 ${
        on ? 'bg-teal-900/60 text-teal-300' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {on ? 'Default line ✓' : 'Make default'}
    </button>
  )
}
