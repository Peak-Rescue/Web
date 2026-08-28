'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateSchedule, addScheduleDay, updateScheduleDay, removeScheduleDay,
  copySchedule, saveScheduleIntoTemplate,
} from './actions'
import ScheduleDayCard from './ScheduleDayCard'
export type {
  Schedule, ScheduleDay, ScheduleBlock, SiteOption, MeetingPointOption, ScheduleTemplateOption,
} from './types'
import type {
  Schedule, SiteOption, MeetingPointOption, ScheduleTemplateOption,
} from './types'
import PdfLink from '@/components/PdfLink'

// Builds the running order the way the real outlines are written: an overview,
// optional learning objectives, then a day per day — each with its own
// location and notes, and topics that can carry sub-topics. Times are optional
// because half the schedules we run don't use them.
export default function ScheduleEditor({
  schedule,
  courseType,
  templates,
  canTemplate = true,
  sites = [],
  meetingPoints = [],
  venueId = null,
}: {
  schedule: Schedule
  courseType?: string | null
  // The schedule shelf's templates, so a running order refined on a course can
  // be saved back over the one it started from.
  templates?: ScheduleTemplateOption[]
  // Whether the shelf is this person's to write to at all. Both ways onto it —
  // a new template and over an existing one — reach every course built from it
  // afterwards, which is a blast radius that doesn't come with a course
  // assignment. Default true: the admin screens are the ones that had this
  // before it was a question.
  canTemplate?: boolean
  // Canyons and crags with beta already written. A day picks one instead of
  // retyping what the place is like.
  sites?: SiteOption[]
  // Where a day can be told to gather instead of the site's usual — the
  // carpool lot, the gas station, the morning we start at the shop.
  meetingPoints?: MeetingPointOption[]
  // The course's venue. A Maui course shouldn't have to scroll past every crag
  // in Washington to find Emerald, so the venue's own sites come first and the
  // rest sit under a heading you have to mean to reach.
  venueId?: string | null
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
  //
  // Quiet saves skip the re-render. Every text field here is uncontrolled, so
  // what you typed is already on screen and the refresh only redraws the page
  // behind the editor — which on the course portal means re-reading the
  // roster, the gear catalog, the waivers and a dozen signed URLs, about a
  // second and a half of server work per blur. Structural changes still
  // refresh, because a new day or a copied template is only on screen once the
  // server says so. `touch()` has already told the pages they're stale either
  // way, so the next navigation is fresh regardless.
  async function run(fn: () => Promise<unknown>, opts?: { quiet?: boolean }) {
    setBusy(true); setError(null)
    try { await fn(); if (!opts?.quiet) router.refresh(); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save'); return false }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      {/* The sheet this running order becomes when it's handed out or pinned
          to the van window. */}
      <div className="flex justify-end">
        <PdfLink href={`/api/schedules/${schedule.id}/pdf`} label="Printable PDF" />
      </div>

      <textarea
        defaultValue={schedule.overview ?? ''}
        onBlur={(e) => e.target.value !== (schedule.overview ?? '') && run(() => updateSchedule(schedule.id, { overview: e.target.value }), { quiet: true })}
        rows={3}
        placeholder="Course overview"
        className={`w-full resize-y ${input}`}
      />

      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Course objectives — one per line, optional</label>
        <textarea
          defaultValue={schedule.objectives.join('\n')}
          onBlur={(e) => {
            const next = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
            if (next.join('\n') !== schedule.objectives.join('\n')) {
              run(() => updateSchedule(schedule.id, { objectives: next }), { quiet: true })
            }
          }}
          rows={3}
          className={`w-full resize-y ${input}`}
        />
      </div>

      {days.map((day) => (
        <ScheduleDayCard
          key={day.id}
          day={day}
          sites={sites}
          meetingPoints={meetingPoints}
          venueId={venueId}
          onRemoving={(id) => setRemoved((r) => [...r, id])}
          onRemoveFailed={(id) => setRemoved((r) => r.filter((x) => x !== id))}
          onError={setError}
        />
      ))}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => run(() => addScheduleDay(schedule.id))}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          + Day
        </button>
        {!schedule.is_template && canTemplate && (
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
