'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import { adminSetExempt } from './[id]/actions'

/** FLSA exempt: the overtime premium is not theirs, and they can claim
    covered meals without receipts.

    Its own question, not a consequence of the salary — three of the salaried
    crew are paid time and a half past forty hours, and one is not. */
export default function ExemptToggle({
  profileId,
  initialValue,
}: {
  profileId: string
  initialValue: boolean
}) {
  const [exempt, setExempt] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleToggle() {
    if (saving) return
    setSaving(true)
    const next = !exempt
    try {
      await adminSetExempt(profileId, next)
      setExempt(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg flex-wrap">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">FLSA exempt</p>
        <InfoHint text="Exempt: no overtime premium on course hours, and covered meals claimable without receipts. Non-exempt staff earn time and a half past 40 hours in a Sunday-to-Saturday week — including the salaried ones, which is most of them." />
      </div>
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
          exempt ? 'bg-teal-700 hover:bg-teal-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
        }`}
      >
        {exempt ? 'Exempt' : 'Non-exempt'}
      </button>
    </div>
  )
}
