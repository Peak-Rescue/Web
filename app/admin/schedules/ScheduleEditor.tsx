'use client'

import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateSchedule, addScheduleDay, updateScheduleDay, removeScheduleDay,
  copySchedule, saveScheduleIntoTemplate,
} from './actions'
import DayOutline from './DayOutline'
import PdfLink from '@/components/PdfLink'

export type ScheduleTemplateOption = { id: string; name: string; days: number }

export type ScheduleBlock = {
  id: string
  parent_id: string | null
  title: string
  time_label: string | null
  location: string | null
  sort_order: number
}

export type SiteOption = {
  id: string
  name: string
  kind: string | null
  beta: string | null
  venue_id?: string | null
  venue_name?: string | null
}

export type ScheduleDay = {
  id: string
  title: string
  location: string | null
  site_id: string | null
  notes: string | null
  objectives: string[]
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
  sites = [],
  venueId = null,
}: {
  schedule: Schedule
  courseType?: string | null
  // The schedule shelf's templates, so a running order refined on a course can
  // be saved back over the one it started from.
  templates?: ScheduleTemplateOption[]
  // Canyons and crags with beta already written. A day picks one instead of
  // retyping what the place is like.
  sites?: SiteOption[]
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

  // The course's own venue first, then everywhere else — the list is one
  // dropdown, so the ordering is the only thing making a Maui course feel like
  // it knows it's on Maui.
  const siteGroups = useMemo(() => {
    const here = sites.filter((s) => venueId && s.venue_id === venueId)
    const rest = sites.filter((s) => !here.includes(s))
    const restBy = new Map<string, SiteOption[]>()
    for (const s of rest) {
      const k = s.venue_name ?? 'Elsewhere'
      restBy.set(k, [...(restBy.get(k) ?? []), s])
    }
    return [
      ...(here.length ? [{ name: here[0].venue_name ?? 'This venue', sites: here }] : []),
      ...[...restBy.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, sites]) => ({ name, sites })),
    ]
  }, [sites, venueId])

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

      {/* The sheet this running order becomes when it's handed out or pinned
          to the van window. */}
      <div className="flex justify-end">
        <PdfLink href={`/api/schedules/${schedule.id}/pdf`} label="Printable PDF" />
      </div>

      <textarea
        defaultValue={schedule.overview ?? ''}
        onBlur={(e) => e.target.value !== (schedule.overview ?? '') && run(() => updateSchedule(schedule.id, { overview: e.target.value }))}
        rows={3}
        placeholder="Course overview — who it's for, what they'll walk away able to do"
        className={`w-full resize-y ${input}`}
      />

      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Course objectives — one per line, optional</label>
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
              <Marked icon={<PinIcon />}>
                <input
                  defaultValue={day.location ?? ''}
                  onBlur={(e) => e.target.value !== (day.location ?? '') && run(() => updateScheduleDay(day.id, { location: e.target.value }))}
                  placeholder="Location"
                  className={`w-full pl-7 ${input}`}
                />
              </Marked>
              {/* Picking the canyon is what stops its beta being retyped per
                  course. Left unset, the day behaves exactly as it always
                  has — a free-text location and its own notes. */}
              {sites.length > 0 && (
                <Marked icon={<RouteIcon />}>
                  <select
                    value={day.site_id ?? ''}
                    onChange={(e) => run(() => updateScheduleDay(day.id, { site_id: e.target.value || null }))}
                    className={`w-full pl-7 ${input} ${day.site_id ? 'text-zinc-200' : 'text-zinc-500'}`}
                  >
                    <option value="">No site — notes only</option>
                    {siteGroups.map((g) => (
                      <optgroup key={g.name} label={g.name}>
                        {g.sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.kind ? ` · ${s.kind}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Marked>
              )}
            </div>
            {/* The beta as the day will show it, read-only here: this is the
                site's, and editing it belongs on the site, where the fix
                reaches every other course too. */}
            {(() => {
              const site = sites.find((s) => s.id === day.site_id)
              if (!site?.beta) return null
              return (
                <div className="rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">
                    Beta from {site.name} ·{' '}
                    <a href="/admin/sites" className="underline hover:text-zinc-400 transition-colors">edit on the site</a>
                  </p>
                  <p className="text-[11px] text-zinc-500 whitespace-pre-line leading-relaxed line-clamp-6">{site.beta}</p>
                </div>
              )
            })()}
            {/* A day at a canyon carries its beta here — approach, rap count,
                exit — so this one starts a line tall and grows to whatever got
                pasted in. Sitting half-width beside the location, a paragraph
                of it was a keyhole. */}
            <Marked icon={<NoteIcon />} top>
              <Grows
                defaultValue={day.notes ?? ''}
                onBlur={(e) => e.target.value !== (day.notes ?? '') && run(() => updateScheduleDay(day.id, { notes: e.target.value }))}
                placeholder="Notes — what’s true of this day only: what to bring, who’s running it, what you’re skipping"
                className={`w-full pl-7 ${input}`}
              />
            </Marked>
            {/* What the day is for, as opposed to what happens on it — the
                course objectives are too coarse to teach a Tuesday from. */}
            <Marked icon={<TargetIcon />} top>
              <textarea
                defaultValue={day.objectives.join('\n')}
                onBlur={(e) => {
                  const next = e.target.value.split('\n').map((o) => o.trim()).filter(Boolean)
                  if (next.join('\n') !== day.objectives.join('\n')) {
                    run(() => updateScheduleDay(day.id, { objectives: next }))
                  }
                }}
                rows={2}
                placeholder="Objectives for this day — one per line, optional"
                className={`w-full resize-y pl-7 ${input}`}
              />
            </Marked>
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

// A placeholder only says what a field is until you fill it in — after that,
// two grey lines under a day title are just two grey lines. These are the same
// marks the course page reads with, so the field you type into is the one the
// students see.
// An uncontrolled textarea sized to its content, on mount and on every
// keystroke, so nothing it holds is hidden behind a scrollbar.
function Grows(props: ComponentProps<'textarea'>) {
  function fit(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  return (
    <textarea
      {...props}
      ref={fit}
      rows={1}
      onInput={(e) => { fit(e.currentTarget); props.onInput?.(e) }}
      className={`resize-none overflow-hidden ${props.className ?? ''}`}
    />
  )
}

function Marked({ icon, top, children }: { icon: ReactNode; top?: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={`absolute left-2 text-zinc-600 ${top ? 'top-2.5' : 'top-1/2 -translate-y-1/2'}`}
      >
        {icon}
      </span>
      {children}
    </div>
  )
}

const glyph = {
  xmlns: 'http://www.w3.org/2000/svg', width: 12, height: 12, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

// A line with waypoints on it — a route, as opposed to the pin's single spot.
function RouteIcon() {
  return (
    <svg {...glyph} aria-hidden>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h4a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h4" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg {...glyph}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg {...glyph}>
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
      <path d="M14 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg {...glyph}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  )
}
