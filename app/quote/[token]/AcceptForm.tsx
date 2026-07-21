'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptQuote } from './actions'

export default function AcceptForm({ token, clientName }: { token: string; clientName: string | null }) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function submit() {
    if (busy || !name.trim() || !authorized) return
    setBusy(true)
    setError(null)
    try {
      const result = await acceptQuote(token, { name, title })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500'

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Title / role (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Operations SNCOIC" className={inputCls} />
      </div>
      <label className="sm:col-span-2 flex items-start gap-2.5 text-sm text-zinc-300 cursor-pointer">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
          className="accent-red-600 mt-0.5"
        />
        <span>
          I am authorized to accept this quote{clientName ? ` on behalf of ${clientName}` : ''} and would like to
          proceed with this training.
        </span>
      </label>
      {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
      <div className="sm:col-span-2">
        <button
          onClick={submit}
          disabled={busy || !name.trim() || !authorized}
          className="px-6 py-3 bg-pr-red hover:bg-pr-red-dark text-white rounded font-semibold transition-colors disabled:opacity-40"
        >
          {busy ? 'Submitting…' : 'Accept this quote'}
        </button>
      </div>
    </div>
  )
}
