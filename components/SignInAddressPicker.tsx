// The address that signs you in, picked from the ones we already hold.
//
// Radios rather than a text field on purpose — see lib/sign-in-address.ts.
// Saving moves the account, so it asks first: the next sign-in uses the new
// address and the old one stops working, which is not something to discover.
'use client'

import { useState } from 'react'
import { errorFrom } from '@/lib/action-result'
import type { AddressOption } from '@/lib/sign-in-address'

export default function SignInAddressPicker({
  options,
  onChoose,
  subject = 'You',
}: {
  options: AddressOption[]
  onChoose: (address: string) => Promise<{ error: string } | void>
  /** 'You' on your own profile, a first name when an admin is doing it for somebody. */
  subject?: string
}) {
  const current = options.find((o) => o.current)?.address ?? ''
  const [picked, setPicked] = useState(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (options.length < 2) {
    return (
      <p className="text-sm text-zinc-500">
        {current || 'No address on this account.'}
        {current && <span className="text-zinc-600"> — the only address on file.</span>}
      </p>
    )
  }

  async function save() {
    const mine = subject === 'You'
    const ok = window.confirm(
      `${mine ? 'You' : subject} will sign in with ${picked} from now on. ` +
        `${mine ? 'Your' : 'Their'} old address will stop working. Continue?`
    )
    if (!ok) return

    setSaving(true)
    setError(null)
    try {
      const result = await onChoose(picked)
      if (result?.error) setError(result.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (e) {
      setError(errorFrom(e))
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.address}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              picked === o.address
                ? 'border-pr-red/60 bg-pr-red/10'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <input
              type="radio"
              name="sign_in_address"
              value={o.address}
              checked={picked === o.address}
              onChange={() => setPicked(o.address)}
              className="mt-1 accent-pr-red"
            />
            <span className="min-w-0">
              <span className="block text-sm text-white break-all">{o.address}</span>
              <span className="block text-xs text-zinc-500">{o.role}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving || picked === current}
        className="px-3 py-2 bg-pr-red hover:bg-pr-red-dark disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded text-sm font-medium transition-colors"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Use this address'}
      </button>
    </div>
  )
}
