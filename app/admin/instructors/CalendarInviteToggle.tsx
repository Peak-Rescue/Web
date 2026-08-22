'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import { adminSetCalendarInvites } from './[id]/actions'

export default function CalendarInviteToggle({
  instructorId,
  initialValue,
}: {
  instructorId: string
  initialValue: boolean
}) {
  const [invited, setInvited] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleToggle() {
    if (saving) return
    setSaving(true)
    const next = !invited
    await adminSetCalendarInvites(instructorId, next)
    setInvited(next)
    setSaving(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">Google Calendar invites</p>
        <InfoHint text="Off for anyone who subscribes to the course calendars — otherwise their courses appear twice. Portal emails are unaffected." />
      </div>
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
          invited ? 'bg-teal-700 hover:bg-teal-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
        }`}
      >
        {invited ? 'Invited' : 'Not invited'}
      </button>
    </div>
  )
}
