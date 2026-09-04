'use client'

import { useState } from 'react'
import { updateSchedule } from '@/app/admin/schedules/actions'
import { useTrackedSaves } from '@/components/PendingSaves'

// What the course is, above the day it happens on.
//
// These two went to the admin editor with the rest of the schedule's shape,
// which was right for adding days and saving templates and wrong for these:
// they are read on this page, and a field you can see but not fill in from
// where you are reading it is a field nobody fills in.
//
// Saves on blur and quietly — the boxes are uncontrolled, so what you typed is
// already on screen, and the page behind them has a roster and a gear catalog
// to rebuild.
export default function ScheduleOverviewFields({
  scheduleId,
  overview,
  objectives,
}: {
  scheduleId: string
  overview: string | null
  objectives: string[]
}) {
  const [error, setError] = useState<string | null>(null)
  // Blur fires on the mousedown that closes this editor; tracking the save
  // keeps the close from re-reading the page before it lands.
  const track = useTrackedSaves()

  async function save(fn: () => Promise<unknown>) {
    setError(null)
    try { await track(fn()) } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
  }

  const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-2 mb-4">
      {error && <p className="text-sm text-pr-red">{error}</p>}
      <textarea
        defaultValue={overview ?? ''}
        onBlur={(e) => e.target.value !== (overview ?? '') && save(() => updateSchedule(scheduleId, { overview: e.target.value }))}
        placeholder="Course overview"
        rows={3}
        className={`resize-y ${input}`}
      />
      <textarea
        defaultValue={objectives.join('\n')}
        onBlur={(e) => {
          const next = e.target.value.split('\n').map((o) => o.trim()).filter(Boolean)
          if (next.join('\n') !== objectives.join('\n')) {
            save(() => updateSchedule(scheduleId, { objectives: next }))
          }
        }}
        placeholder="Course objectives, one per line"
        rows={3}
        className={`resize-y ${input}`}
      />
    </div>
  )
}
