'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToInvite } from './actions'

export default function ResponseForm({
  token,
  currentInterested,
  currentNote,
}: {
  token: string
  currentInterested: boolean | null
  currentNote: string | null
}) {
  const [note, setNote] = useState(currentNote ?? '')
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function submit(interested: boolean) {
    if (busy) return
    setBusy(interested ? 'yes' : 'no')
    setError(null)
    try {
      const result = await respondToInvite(token, { interested, note })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Note for the ops team (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Availability caveats, travel needs, role preference…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => submit(true)}
          disabled={busy !== null}
          className="px-6 py-3 bg-pr-red hover:bg-pr-red-dark text-white rounded font-semibold transition-colors disabled:opacity-40"
        >
          {busy === 'yes' ? 'Sending…' : currentInterested === true ? 'Update — still interested' : "I'm interested"}
        </button>
        <button
          onClick={() => submit(false)}
          disabled={busy !== null}
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded font-semibold transition-colors disabled:opacity-40"
        >
          {busy === 'no' ? 'Sending…' : "Can't make it"}
        </button>
      </div>
    </div>
  )
}
