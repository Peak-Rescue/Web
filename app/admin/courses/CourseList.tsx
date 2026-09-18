'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { courseShortName, COURSE_TYPE_OPTIONS } from '@/lib/courses'
import { COURSE_STATUSES, COURSE_STATUS_STYLES as STATUS_STYLES } from '@/lib/course-status'
import {
  courseSteps, showsSteps, coursePhase, courseSettled, NO_EXTRAS,
  type CourseExtras, type StepInput,
} from '@/lib/course-readiness'
import { billTo, parseContacts } from '@/lib/contacts'
import { NEEDS, matchesNeeds } from '@/lib/course-needs'
import { type CourseOwner } from '@/lib/course-owner'
import CourseQuickActions from './CourseQuickActions'

const STATUS_OPTIONS = COURSE_STATUSES

function formatDateRange(starts_at: string, ends_at: string) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return starts_at === ends_at ? fmt(starts_at) : `${fmt(starts_at)} – ${fmt(ends_at)}`
}

export type Instance = {
  id: string
  ref_number: number
  slug: string | null
  course_type: string
  course_category: string | null
  custom_title: string | null
  status: string
  location: string | null
  client_name: string | null
  starts_at: string | null
  ends_at: string | null
  max_students: number | null
  instructor_slots?: number | null
  /** Only to answer "is there anybody to bill" — the money track says so on
      the stop rather than behind a panel you had to open to find out. */
  contacts?: unknown
  /** The admin whose job it is to move this one along. */
  owner_id?: string | null
  internal?: boolean | null
  instance_instructors: { count: number }[]
  crew?: { role: string; instructors: { name: string } | null }[] | null
  enrollments: { count: number }[]
  course_estimates?: { count: number }[]
}

/** The list's row, as the step model reads it. */
function asStepInput(inst: Instance): StepInput {
  return {
    id: inst.id,
    status: inst.status,
    instructor_slots: inst.instructor_slots,
    crew: (inst.crew ?? []).map((c) => ({ role: c.role })),
    estimates: inst.course_estimates?.[0]?.count ?? 0,
    starts_at: inst.starts_at,
    ends_at: inst.ends_at,
    internal: inst.internal,
  }
}

function InstanceCard({
  inst,
  extras,
  today,
  settleDays,
  owner,
  owners,
}: {
  inst: Instance
  extras: CourseExtras | undefined
  today: string
  settleDays: number
  owner: CourseOwner | undefined
  /** Everyone it could be handed to, so the pill can hand it over in place. */
  owners: CourseOwner[]
}) {
  const instructorCount = inst.instance_instructors?.[0]?.count ?? 0
  const studentCount    = inst.enrollments?.[0]?.count ?? 0
  const displayName = courseShortName(inst.course_type, inst.custom_title)

  const x = extras ?? NO_EXTRAS
  const step = asStepInput(inst)
  const steps = courseSteps(step, x, today, settleDays)
  // What an open panel watches to know it has gone stale. Every number in it
  // moves when the thing the panel changes changes — assigning somebody, a
  // draft quote leaving, a handoff, the books shutting — so the panel re-asks
  // the server without the list having to tell it to.
  const version = [step.crew.length, x.invitesSent, x.invitesAnswered, x.quote, x.billing, x.booksClosed, inst.status].join('|')

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg transition-colors hover:border-zinc-600">
      <div className="flex items-start gap-3">
        <Link
          href={`/portal/${inst.id}`}
          // One per course listed: left to prefetch, showing the list
          // server-renders a whole course page for every course in it.
          prefetch={false}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* On a live course the status lives in the action row below,
                where it can be changed. Here it only reports. */}
            {!showsSteps(inst.status) && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${STATUS_STYLES[inst.status] ?? ''}`}>
                {inst.status}
              </span>
            )}
            <span className="text-xs font-mono text-zinc-500">PR-{String(inst.ref_number).padStart(4, '0')}</span>
            <span className="font-medium truncate">{displayName}</span>
            {/* The list has no colour coding, so the flag is a word here. */}
            {inst.internal && (
              <span
                title="No students — internal work, a consultation, anything without a roster"
                className="text-[10px] text-zinc-500 whitespace-nowrap"
              >
                No students
              </span>
            )}
          </div>
          <div className="text-sm text-zinc-400 flex flex-wrap gap-x-4 gap-y-0.5">
            {inst.starts_at && inst.ends_at && <span>{formatDateRange(inst.starts_at, inst.ends_at)}</span>}
            {inst.location && <span>{inst.location}</span>}
            {inst.client_name && <span>{inst.client_name}</span>}
          </div>
        </Link>
        <div className="text-xs text-zinc-500 whitespace-nowrap text-right shrink-0">
          {instructorCount > 0 && <div>{instructorCount} instructor{instructorCount !== 1 ? 's' : ''}</div>}
          {inst.max_students && <div>{studentCount}/{inst.max_students} students</div>}
        </div>
      </div>

      {showsSteps(inst.status) && (
        <CourseQuickActions
          instanceId={inst.id}
          status={inst.status}
          steps={steps}
          phase={coursePhase(inst, today)}
          estimates={step.estimates}
          extras={x}
          crew={step.crew}
          slots={inst.instructor_slots}
          owner={owner}
          owners={owners}
          hasBillingContact={billTo(parseContacts(inst.contacts)) !== null}
          version={version}
        />
      )}
    </div>
  )
}

/** One titled block of rows. The count says "3 of 19" while filtering,
    because a filtered list that only shows its own length is a list you can
    misread as the whole set. */
function Section({
  title,
  rows,
  total,
  filtering,
  empty,
  note,
  ...card
}: {
  title: string
  rows: Instance[]
  total?: number
  filtering: boolean
  empty?: string
  /** An alarm that belongs to the section rather than to any one row. */
  note?: string
  extras: Record<string, CourseExtras>
  today: string
  settleDays: number
  ownerById: Map<string, CourseOwner>
  owners: CourseOwner[]
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-3 flex-wrap">
        <span>
          {title}
          <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
            ({filtering && total !== undefined ? `${rows.length} of ${total}` : rows.length})
          </span>
        </span>
        {note && (
          <span className="normal-case tracking-normal font-medium text-[11px] px-2 py-0.5 rounded-full border border-amber-600/60 bg-amber-500/10 text-amber-300">
            {note}
          </span>
        )}
      </h2>
      {rows.length === 0 ? (
        empty ? <p className="text-zinc-600 text-sm">{empty}</p> : null
      ) : (
        <div className="space-y-3">
          {rows.map(inst => (
            <InstanceCard
              key={inst.id}
              inst={inst}
              extras={card.extras[inst.id]}
              today={card.today}
              settleDays={card.settleDays}
              owner={inst.owner_id ? card.ownerById.get(inst.owner_id) : undefined}
              owners={card.owners}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// Short row labels for the course-type groups (the full categoryMeta labels
// are too wide for the filter-bar gutter).
const CATEGORY_SHORT: Record<string, string> = {
  tactical: 'Tactical',
  sar: 'SAR',
  industrial: 'Industrial',
  specialty: 'Specialty',
}

export default function CourseList({
  upcoming,
  past,
  extras,
  today,
  settleDays,
  owners,
}: {
  upcoming: Instance[]
  past: Instance[]
  /** Per-course state the list's own query doesn't carry — the schedule, the
      curriculum, the gear list, the quotes and who has been asked to staff it.
      Loaded for the upcoming courses only: a course that has already run is
      not waiting on any of it. */
  extras: Record<string, CourseExtras>
  /** Today where the courses are — what makes billing due. */
  today: string
  /** How long costs may keep arriving before the books are chased. */
  settleDays: number
  /** Everyone a course can be pinned on. */
  owners: CourseOwner[]
}) {
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [year, setYear] = useState<string | null>(null)
  const [needs, setNeeds] = useState<Set<string>>(new Set())
  const [whose, setWhose] = useState<Set<string>>(new Set())

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) =>
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  const toggleCategory = toggleIn(setCategories)
  const toggleType = toggleIn(setTypes)
  const toggleStatus = toggleIn(setStatuses)
  const toggleNeed = toggleIn(setNeeds)
  const toggleWhose = toggleIn(setWhose)

  const ownerById = useMemo(() => new Map(owners.map(o => [o.id, o])), [owners])

  // Asked once per course and reused by the filter, the counts and the rows —
  // the same list, so none of the three can say a different thing.
  const stepsOf = useMemo(() => {
    const m = new Map<string, ReturnType<typeof courseSteps>>()
    for (const i of [...upcoming, ...past]) {
      m.set(i.id, courseSteps(asStepInput(i), extras[i.id] ?? NO_EXTRAS, today, settleDays))
    }
    return m
  }, [upcoming, past, extras, today, settleDays])

  const needCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const n of NEEDS) {
      out[n.id] = [...upcoming, ...past].filter(i => showsSteps(i.status) && n.test(stepsOf.get(i.id) ?? [])).length
    }
    return out
  }, [upcoming, past, stepsOf])

  // Actions default a missing category to tactical, so filters treat null the
  // same way.
  const instCategory = (i: Instance) => i.course_category ?? 'tactical'

  // Every custom course shares course_type === 'custom', so key custom courses
  // by category (custom:tactical, custom:industrial, …) — otherwise the
  // "Custom" chip in one category row would select custom courses in every row.
  const typeKey = (i: Instance) => i.course_type === 'custom' ? `custom:${instCategory(i)}` : i.course_type

  // Course types present in the data, grouped by category — the same
  // category → type structure used when a course is created.
  const typeGroups = useMemo(() => {
    const byCat = new Map<string, Map<string, string>>()
    for (const i of [...upcoming, ...past]) {
      const m = byCat.get(instCategory(i)) ?? new Map<string, string>()
      const key = typeKey(i)
      if (!m.has(key)) {
        m.set(key, i.course_type === 'custom' ? 'Custom' : courseShortName(i.course_type, null))
      }
      byCat.set(instCategory(i), m)
    }
    return COURSE_TYPE_OPTIONS.filter(g => byCat.has(g.category)).map(g => ({
      category: g.category as string,
      types: [...byCat.get(g.category)!.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    }))
  }, [upcoming, past])

  const filtering = query.trim() !== '' || categories.size > 0 || types.size > 0 || statuses.size > 0 || needs.size > 0 || whose.size > 0

  // Check-all-that-apply: a checked category counts as all of its types, so
  // category and type picks OR together; status ANDs against that (mirrors
  // the instructor filter).
  const matches = (inst: Instance) => {
    if (
      (categories.size > 0 || types.size > 0) &&
      !categories.has(instCategory(inst)) &&
      !types.has(typeKey(inst))
    ) return false
    if (statuses.size > 0 && !statuses.has(inst.status)) return false
    if (!matchesNeeds(stepsOf.get(inst.id) ?? [], needs)) return false
    // "No owner" is a pick like anybody else's name: it is the set of courses
    // nobody has taken on, which is the set worth looking at first.
    if (whose.size > 0 && !whose.has(inst.owner_id ?? 'none')) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    const haystack = [
      courseShortName(inst.course_type, inst.custom_title),
      `pr-${String(inst.ref_number).padStart(4, '0')}`,
      String(inst.ref_number),
      inst.client_name ?? '',
      inst.location ?? '',
    ].join(' ').toLowerCase()
    return q.split(/\s+/).every(term => haystack.includes(term))
  }

  const shownUpcoming = filtering ? upcoming.filter(matches) : upcoming
  const shownPast     = filtering ? past.filter(matches) : past

  // A past course is either still owing somebody something or it is finished
  // with. Nothing else about it matters from here.
  const isSettled = (i: Instance) =>
    courseSettled(asStepInput(i), extras[i.id] ?? NO_EXTRAS, today, settleDays)
  const stillOwed = shownPast.filter(i => !isSettled(i))
  const archive   = shownPast.filter(isSettled)

  // The one number the section heading shouts, because it is money we have
  // not asked for.
  const unsentToHarken = stillOwed.filter(i =>
    courseSteps(asStepInput(i), extras[i.id] ?? NO_EXTRAS, today, settleDays)
      .some(s => s.key === 'billing' && s.tone === 'action')
  ).length

  const archiveYears = [...new Set(archive.map(i => i.ends_at?.slice(0, 4)).filter(Boolean))].sort().reverse() as string[]
  const archiveShown = year ? archive.filter(i => i.ends_at?.startsWith(year)) : archive

  const cardProps = { extras, today, settleDays, ownerById, owners }

  return (
    <>
      {/* ── Filters — check all that apply, like the instructor filter ── */}
      <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, ref, client, location…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
          {filtering && (
            <button
              onClick={() => { setQuery(''); setCategories(new Set()); setTypes(new Set()); setStatuses(new Set()); setNeeds(new Set()); setWhose(new Set()); setYear(null) }}
              className="text-xs px-3 py-2 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </div>

        {/* Course type — one row per category; the category label is itself a
            toggle that selects everything in the row, type chips refine. */}
        {typeGroups.map(group => (
          <div key={group.category} className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => toggleCategory(group.category)}
              title={`Select all ${CATEGORY_SHORT[group.category] ?? group.category} courses`}
              className={`w-24 shrink-0 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-left transition-colors ${
                categories.has(group.category)
                  ? 'bg-pr-red-light text-white'
                  : 'bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-600 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {CATEGORY_SHORT[group.category] ?? group.category}
            </button>
            <span className="self-stretch w-px bg-zinc-700 shrink-0" aria-hidden="true" />
            <div className="flex flex-wrap gap-2">
              {group.types.map(([value, label]) => (
                <button
                  key={`${group.category}:${value}`}
                  onClick={() => {
                    if (categories.has(group.category)) {
                      // Unchecking one type of a fully-selected category:
                      // swap the category pick for its other types.
                      setCategories(prev => {
                        const n = new Set(prev)
                        n.delete(group.category)
                        return n
                      })
                      setTypes(prev => {
                        const n = new Set(prev)
                        for (const [v] of group.types) {
                          if (v === value) n.delete(v)
                          else n.add(v)
                        }
                        return n
                      })
                    } else {
                      toggleType(value)
                    }
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    types.has(value) || categories.has(group.category)
                      ? 'bg-teal-700 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Needs — the second filter row, and the reason the first one was
            never enough: "confirmed" is a fact about a course, "needs
            staffing" is a fact about your morning. */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider w-24 shrink-0">Needs</span>
          <span className="self-stretch w-px bg-zinc-700 shrink-0" aria-hidden="true" />
          <div className="flex flex-wrap gap-2">
            {NEEDS.map(n => (
              <button
                key={n.id}
                onClick={() => toggleNeed(n.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                  needs.has(n.id)
                    ? 'border-amber-600/70 bg-amber-500/15 text-amber-200'
                    : 'border-transparent bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {n.label}
                <span className="ml-1.5 tabular-nums text-zinc-500">{needCounts[n.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Owner — "what is on my plate" is a different question from "what
            is happening", and the page could not previously ask it at all. */}
        {owners.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider w-24 shrink-0">Owner</span>
            <span className="self-stretch w-px bg-zinc-700 shrink-0" aria-hidden="true" />
            <div className="flex flex-wrap gap-2">
              {[...owners.map(o => ({ id: o.id, label: o.name })), { id: 'none', label: 'No owner' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => toggleWhose(o.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                    whose.has(o.id)
                      ? o.id === 'none'
                        ? 'border-amber-600/70 bg-amber-500/15 text-amber-200'
                        : 'border-teal-700 bg-teal-900/40 text-teal-200'
                      : 'border-transparent bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {o.label}
                  <span className="ml-1.5 tabular-nums text-zinc-500">
                    {[...upcoming, ...past].filter(i => (i.owner_id ?? 'none') === o.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider w-24 shrink-0">Status</span>
          <span className="self-stretch w-px bg-zinc-700 shrink-0" aria-hidden="true" />
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize border ${
                  statuses.has(s)
                    ? STATUS_STYLES[s]
                    : 'border-transparent bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── What needs doing, before a single row is read ──────────────
          Most mornings this is the whole answer, and nobody scrolls. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
        {NEEDS.filter(n => n.headline).map(n => {
          const count = needCounts[n.id] ?? 0
          const on = needs.has(n.id)
          const hot = n.id !== 'clear' && count > 0
          return (
            <button
              key={n.id}
              onClick={() => toggleNeed(n.id)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                count === 0 ? 'border-zinc-800/70 bg-zinc-900/40 text-zinc-600'
                  : hot ? 'border-amber-600/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  : 'border-zinc-800 bg-zinc-900 text-teal-300 hover:border-zinc-600'
              } ${on ? 'ring-1 ring-zinc-400' : ''}`}
            >
              <span className="block text-xl font-semibold leading-none tabular-nums">{count}</span>
              <span className="block text-[11.5px] mt-1 leading-tight">{n.summary}</span>
            </button>
          )
        })}
      </div>

      {/* ── The two jobs this page does ────────────────────────────────

          Getting courses ready, and chasing the money on ones that already
          ran. They were one list with a Past fold, which meant an unbilled
          course from August lived inside a shut grey summary — exactly where
          it goes to be forgotten.

          The cut is what is still owed, never a date. A months-back window
          gets it wrong in both directions: a course from two years ago nobody
          billed is still work, and one that ran last month and was paid is
          not. So the middle section empties itself as the money lands, and
          the working page stays the same size however many courses we run. */}
      <Section
        title="Upcoming & active"
        rows={shownUpcoming}
        total={upcoming.length}
        filtering={filtering}
        empty={filtering ? 'No upcoming courses match.' : 'No upcoming courses.'}
        {...cardProps}
      />

      {stillOwed.length > 0 && (
        <Section
          title="Ran — still owed"
          rows={stillOwed}
          filtering={filtering}
          note={
            unsentToHarken > 0
              ? `${unsentToHarken} not sent to Harken`
              : undefined
          }
          {...cardProps}
        />
      )}

      {/* Finished with, so a fold: reference rather than work. */}
      {archive.length > 0 && (
        <section>
          <details open={filtering || undefined}>
            <summary className="cursor-pointer list-none">
              <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform [[open]_&]:rotate-90">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Archive · settled
                <span className="font-normal normal-case tracking-normal text-zinc-700">({archive.length})</span>
              </h2>
            </summary>
            {/* Years, not months-back: down here you are looking something up,
                and a year is what anybody actually remembers about a course. */}
            {archiveYears.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 ml-5">
                <span className="text-[11px] text-zinc-600">Year</span>
                {archiveYears.map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(year === y ? null : y)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      year === y ? 'bg-teal-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {archiveShown.length === 0
                ? <p className="text-zinc-600 text-sm">Nothing here matches.</p>
                : archiveShown.map(inst => (
                    <InstanceCard
                      key={inst.id}
                      inst={inst}
                      extras={extras[inst.id]}
                      today={today}
                      settleDays={settleDays}
                      owner={inst.owner_id ? ownerById.get(inst.owner_id) : undefined}
                      owners={owners}
                    />
                  ))}
            </div>
          </details>
        </section>
      )}
    </>
  )
}
