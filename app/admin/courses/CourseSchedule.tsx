'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ScheduleEditor, { type Schedule, type SiteOption, type MeetingPointOption } from '@/app/admin/schedules/ScheduleEditor'
import { createSchedule, copySchedule, deleteSchedule } from '@/app/admin/schedules/actions'

// A course's running order, built here rather than in a Google Doc that then
// gets linked. Starts blank — seeded with a day per course day — or from a
// saved template.
export default function CourseSchedule({
  instanceId,
  courseType,
  courseDays,
  schedule,
  templates,
  sites,
  meetingPoints,
  venueId,
}: {
  instanceId: string
  courseType: string | null
  courseDays: number
  schedule: Schedule | null
  templates: { id: string; name: string; description?: string | null; days: number }[]
  sites: SiteOption[]
  meetingPoints: MeetingPointOption[]
  // The course's venue, so its own canyons head the day's site list.
  venueId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
    finally { setBusy(false) }
  }

  if (schedule) {
    return (
      <div className="space-y-4">
        {error && <p className="text-sm text-pr-red">{error}</p>}
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">{schedule.name}</h3>
          <button
            onClick={() => { if (confirm('Delete this schedule?')) run(() => deleteSchedule(schedule.id)) }}
            disabled={busy}
            className="ml-auto text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Delete schedule
          </button>
        </div>
        <ScheduleEditor schedule={schedule} courseType={courseType} templates={templates} sites={sites} meetingPoints={meetingPoints} venueId={venueId} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-pr-red">{error}</p>}
      <p className="text-sm text-zinc-500">
        No schedule yet. Start blank{courseDays > 0 ? ` — you'll get ${courseDays} day${courseDays === 1 ? '' : 's'} to fill in` : ''}, or
        from a saved template.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(() => createSchedule({
            name: 'Course schedule', instanceId, courseType, days: courseDays || 1,
          }))}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          + Blank schedule
        </button>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => run(() => copySchedule(t.id, { instanceId, name: t.name }))}
            disabled={busy}
            title={[`${t.days} day(s)`, t.description].filter(Boolean).join(' — ')}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            {t.name}
            <span className="text-zinc-600 ml-1.5">{t.days}d</span>
          </button>
        ))}
      </div>
    </div>
  )
}
