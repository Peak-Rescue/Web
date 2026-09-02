'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSchedule, copySchedule, deleteSchedule } from '@/app/admin/schedules/actions'

// Starting a running order from nothing.
//
// The Schedule section only appeared once a schedule had days in it, which
// meant the one course that most needed one — a course created five minutes
// ago — was the one course you could not make one for without leaving the
// page. Same trap as the empty Resources section, one level up.
export default function CreateSchedule({
  instanceId,
  courseType,
  courseDays,
  templates,
  /** Set once one exists: the control becomes the way to throw it away and
      start again, which is the other half of "start from a template" and had
      no home on this page. */
  existingScheduleId,
}: {
  instanceId: string
  courseType: string | null
  existingScheduleId?: string | null
  /** How many days the course runs, so a blank schedule starts with somewhere
      to type rather than an empty box. */
  courseDays: number
  templates: { id: string; name: string; description?: string | null; days: number }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    fn()
      .then(() => router.refresh())
      .catch((e) => setError(e instanceof Error ? e.message : 'That didn’t work'))
      .finally(() => setBusy(false))
  }

  if (existingScheduleId) {
    return (
      <div className="flex items-center gap-3">
        {error && <p className="text-sm text-pr-red">{error}</p>}
        <button
          onClick={() => {
            if (!confirm('Delete this schedule? Every day and its outline goes with it.')) return
            run(() => deleteSchedule(existingScheduleId))
          }}
          disabled={busy}
          className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
        >
          Delete schedule
        </button>
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
