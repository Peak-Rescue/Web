'use client'

import { useState } from 'react'
import { adminSetExempt } from './[id]/actions'

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
    await adminSetExempt(profileId, next)
    setExempt(next)
    setSaving(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div>
        <p className="text-sm font-medium">FLSA exempt</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          Exempt employees can claim per diem on expense reports. Non-exempt (overtime-eligible) employees cannot.
        </p>
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
