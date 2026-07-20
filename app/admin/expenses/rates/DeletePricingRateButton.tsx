'use client'

import { useState } from 'react'
import { deletePricingRate } from '@/app/admin/courses/finance-actions'

export default function DeletePricingRateButton({ rateId, label }: { rateId: string; label: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async () => {
        if (busy || !confirm(`Remove "${label}" from the rates library? Existing estimates keep their values.`)) return
        setBusy(true)
        try {
          await deletePricingRate(rateId)
        } finally {
          setBusy(false)
        }
      }}
      disabled={busy}
      className="text-xs text-zinc-500 hover:text-pr-red-light transition-colors disabled:opacity-50"
    >
      Remove
    </button>
  )
}
