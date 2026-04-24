'use client'

import { useState } from 'react'
import { updateProfile } from './actions'

type Props = {
  initialEmail: string | null
  initialPhone: string | null
}

export default function ProfileForm({ initialEmail, initialPhone }: Props) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = email !== (initialEmail ?? '') || phone !== (initialPhone ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile({ email, phone })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(`Save failed: ${err}`)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
        />
      </div>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
        />
      </div>
      <button
        type="submit"
        disabled={saving || !dirty}
        className="px-4 py-2 bg-pr-red hover:bg-pr-red-light disabled:opacity-50 text-white rounded font-medium transition-colors"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </form>
  )
}
