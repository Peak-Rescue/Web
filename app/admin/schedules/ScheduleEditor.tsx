'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateSchedule, addScheduleDay, updateScheduleDay, removeScheduleDay,
  copySchedule, saveScheduleIntoTemplate,
} from './actions'
import DayOutline from './DayOutline'

export type ScheduleTemplateOption = { id: string; name: string; days: number }

export type ScheduleBlock = {
  id: string
  parent_id: string | null
  title: string
  time_label: string | null
  location: string | null
  sort_order: number
}

export type ScheduleDay = {
  id: string
  title: string
  location: string | null
  notes: string | null
  sort_order: number
  schedule_blocks: ScheduleBlock[]
}

export type Schedule = {
  id: string
  name: string
  overview: string | null
  objectives: string[]
  instance_id: string | null
  is_template: boolean
  schedule_days: ScheduleDay[]
}

// Builds the running order the way the real outlines are written: an overview,
// optional learning objectives, then a day per day — each with its own
// location and notes, and topics that can carry sub-topics. Times are optional
// because half the schedules we run don't use them.
export default function ScheduleEditor({
  schedule,
  courseType,
  templates,
}: {
  schedule: Schedule
  courseType?: string | null
  // The schedule shelf's templates, so a running order refined on a course can
  // be saved back over the one it started from.
  templates?: ScheduleTemplateOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A removed day leaves the screen on the click, not on the round trip — the
  // course page behind it takes about a second to rebuild, and watching a day
  // you've already confirmed sit there is the slowest part of editing one.
  const [removed, setRemoved] = useState<string[]>([])

  const days = useMemo(
    () => [...schedule.schedule_days]
      .filter((d) => !removed.includes(d.id))
      .sort((a, b) => a.sort_order - b.sort_order),
    [schedule.schedule_days, removed]
  )

  // Reports whether it landed, so a caller that already took the change on
  // screen can put it back if the server disagreed.
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh(); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save'); return false }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <textarea
        defaultValue={schedule.overview ?? ''}
        onBlur={(e) => e.target.value !== (schedule.overview ?? '') && run(() => updateSchedule(schedule.id, { overview: e.target.value }))}
        rows={3}
        placeholder="Course overview — who it's for, what they'll walk away able to do"
        className={`w-full resize-y ${input}`}
      />

      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Learning objectives — one per line, optional</label>
        <textarea
          defaultValue={schedule.objectives.join('\n')}
          onBlur={(e) => {
            const next = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
            if (next.join('\n') !== schedule.objectives.join('\n')) {
              run(() => updateSchedule(schedule.id, { objectives: next }))
            }
          }}
          rows={3}
          className={`w-full resize-y ${input}`}
        />
      </div>

      {days.map((day) => (
        <div key={day.id} className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="bg-zinc-900 px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                defaultValue={day.title}
                onBlur={(e) => e.target.value !== day.title && run(() => updateScheduleDay(day.id, { title: e.target.value }))}
                placeholder="Day 1: Basic rope skills"
                className={`flex-1 font-medium ${input}`}
              />
              <button
                onClick={() => {
                  if (!confirm(`Remove "${day.title}"?`)) return
                  setRemoved((r) => [...r, day.id])
                  void run(() => removeScheduleDay(day.id)).then((ok) => {
                    if (!ok) setRemoved((r) => r.filter((x) => x !== day.id))
                  })
                }}
                className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
              >
                Remove day
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                defaultValue={day.location ?? ''}
                onBlur={(e) => e.target.value !== (day.location ?? '') && run(() => updateScheduleDay(day.id, { location: e.target.value }))}
                placeholder="Location"
                className={`w-full ${input}`}
              />
              <input
                defaultValue={day.notes ?? ''}
                onBlur={(e) => e.target.value !== (day.notes ?? '') && run(() => updateScheduleDay(day.id, { notes: e.target.value }))}
                placeholder="Notes — e.g. bring tactical gear"
                className={`w-full ${input}`}
              />
            </div>
          </div>

          <DayOutline dayId={day.id} blocks={day.schedule_blocks} onError={setError} />
        </div>
      ))}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => run(() => addScheduleDay(schedule.id))}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          + Day
        </button>
        {!schedule.is_template && (
          <SaveToShelf
            schedule={schedule} templates={templates ?? []} courseType={courseType}
            busy={busy} run={run} input={input}
          />
        )}
      </div>
    </div>
  )
}

// Two ways onto the schedule shelf: a new template, or over one already there.
// Overwriting keeps the template's shelf identity — name, description, tags —
// and replaces its days, so refining a running order on the course you're
// actually teaching is how the reusable one improves.
function SaveToShelf({
  schedule, templates, courseType, busy, run, input,
}: {
  schedule: Schedule
  templates: ScheduleTemplateOption[]
  courseType?: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [target, setTarget] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        onClick={() => {
          const name = prompt('Save this schedule to the library as a new template. Name it:', schedule.name)
          if (name) run(() => copySchedule(schedule.id, { isTemplate: true, name, courseType }))
        }}
        disabled={busy}
        className="text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
      >
        Save as a new template
      </button>

      {templates.length > 0 && (
        <>
          <span className="text-zinc-700">or update</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={`${input} text-xs max-w-52`}
          >
            <option value="">— pick a template —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.days}d)</option>)}
          </select>
          <button
            onClick={() => {
              const t = templates.find((x) => x.id === target)
              if (!t) return
              if (!confirm(
                `Replace the days on "${t.name}" with this schedule? Its name and tags stay, and courses already using it aren't touched.`
              )) return
              run(async () => { await saveScheduleIntoTemplate(schedule.id, t.id); setTarget('') })
            }}
            disabled={busy || !target}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            Update it
          </button>
        </>
      )}
    </div>
  )
}
