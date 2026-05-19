'use client'

import { useState } from 'react'
import { adminSetShowOnTeamPage } from './[id]/actions'

export default function TeamPageToggle({
  instructorId,
  initialValue,
}: {
  instructorId: string
  initialValue: boolean
}) {
  const [visible, setVisible] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleToggle() {
    if (saving) return
    setSaving(true)
    const next = !visible
    await adminSetShowOnTeamPage(instructorId, next)
    setVisible(next)
    setSaving(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div>
        <p className="text-sm font-medium">Show on public team page</p>
        <p className="text-xs text-zinc-500 mt-0.5">Controls whether this instructor appears at /instructors</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
          visible ? 'bg-teal-700 hover:bg-teal-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
        }`}
      >
        {visible ? 'Visible' : 'Hidden'}
      </button>
    </div>
  )
}
