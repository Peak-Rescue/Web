'use client'

import { useState } from 'react'
import { adminDeleteRate } from '../actions'

export default function DeleteRateButton({ rateId }: { rateId: string }) {
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (busy) return
    if (!confirm('Delete this rate? Expenses dated on or after its effective date will fall back to the previous rate.')) return
    setBusy(true)
    try {
      await adminDeleteRate(rateId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="text-xs text-zinc-500 hover:text-pr-red-light transition-colors disabled:opacity-50"
    >
      Delete
    </button>
  )
}
