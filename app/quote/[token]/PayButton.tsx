'use client'

import { useState } from 'react'
import { startQuotePayment } from './actions'

// On an accepted quote: card checkout for the accepted total, for a client who
// accepted first or who left the card page before finishing.
export default function PayButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    setBusy(true)
    setError(null)
    const result = await startQuotePayment(token)
    if (result.ok) {
      window.location.href = result.url
      return
    }
    setError(result.error)
    setBusy(false)
  }

  return (
    <div>
      <button
        onClick={pay}
        disabled={busy}
        className="px-6 py-3 bg-pr-red hover:bg-pr-red-dark text-white rounded font-semibold transition-colors disabled:opacity-40"
      >
        {busy ? 'Opening checkout…' : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
