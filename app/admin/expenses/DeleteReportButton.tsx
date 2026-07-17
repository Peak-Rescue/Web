'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminDeleteReport } from './actions'

export default function DeleteReportButton({ reportId, label }: { reportId: string; label: string }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (busy) return
    if (!confirm(`Delete the report "${label}" and its receipts? This cannot be undone.`)) return
    setBusy(true)
    try {
      await adminDeleteReport(reportId)
      router.refresh()
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
