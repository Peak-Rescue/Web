'use client'

import { useState } from 'react'
import { deletePricingRate } from '@/app/admin/courses/finance-actions'
import TrashIcon from '@/components/TrashIcon'

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
      title={`Remove ${label} — existing estimates keep their values`}
      aria-label={`Remove ${label}`}
      className="text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-50"
    >
      <TrashIcon className="w-4 h-4" />
    </button>
  )
}
