// Who is on two courses at once.
//
// The day-by-day comparison behind this has been right for a long time
// (`overlappingDates`) — the problem was where it got asked. It lived inside the
// staffing panel's loader, so a clash existed only while somebody had that panel
// open on one of the two courses. Which means the action most likely to create
// one — moving a course's dates — created them in silence, because whoever moves
// dates is not on the staffing screen.
//
// So the rule moves here, with no database in it, and answers two questions that
// are easy to mistake for one:
//
//   busyDuring   — who is booked on these days, on any course. Asked about
//                  people who are *not* on this course yet, so the assign
//                  dropdown can warn before somebody is picked.
//   clashesFor   — who on this course is double-booked. Asked about people who
//                  already are, because that is a mistake that has happened
//                  rather than one about to.
//
// Same overlap rule underneath; the second is the first narrowed to the crew.

import { courseShortName, overlappingDates, formatDayList, type OffDayRange, type StaffingConflicts } from '@/lib/courses'

/** A course as a clash is worked out from: its days, its breaks, and who is on
    it. `label` is display-ready, because a clash is always shown as the name of
    the other course. */
export type ClashCourse = {
  id: string
  label: string
  status: string
  starts_at: string | null
  ends_at: string | null
  offDays: OffDayRange[]
  crew: { instructor_id: string }[]
}

/** The days a course holds, without the crew — what the other side of a
    comparison needs. */
export type ClashWindow = {
  starts_at: string | null
  ends_at: string | null
  offDays: OffDayRange[]
}

/** Whether a course can clash at all. A cancelled course holds nobody's week,
    and a course with no dates cannot collide with anything yet — either would
    otherwise raise a warning nobody can act on. */
export function canClash(c: { status: string; starts_at: string | null }): boolean {
  return c.status !== 'cancelled' && Boolean(c.starts_at)
}

/** Everybody booked on days this window covers, keyed by instructor id, whoever
    they are. Absent means free.

    The overlap is day by day rather than range against range, so a course
    running entirely inside another's break does not count — somebody can teach
    elsewhere in a week the first course has off. */
export function busyDuring(window: ClashWindow, others: ClashCourse[]): StaffingConflicts {
  const out: StaffingConflicts = {}
  if (!window.starts_at) return out

  for (const other of others) {
    if (!canClash(other)) continue
    const days = overlappingDates(window, other)
    if (days.length === 0) continue
    const clash = { course: other.label, days: formatDayList(days) }
    for (const { instructor_id } of other.crew) {
      (out[instructor_id] ??= []).push(clash)
    }
  }
  return out
}

/** The same thing narrowed to the people actually on this course: the
    double-bookings that exist, rather than the ones a pick would create.

    Symmetric by construction — if A clashes with B then B clashes with A, which
    is why the moved course and the course it landed on both know. */
export function clashesFor(course: ClashCourse, others: ClashCourse[]): StaffingConflicts {
  if (!canClash(course) || course.crew.length === 0) return {}
  const mine = new Set(course.crew.map((c) => c.instructor_id))
  const busy = busyDuring(course, others.filter((o) => o.id !== course.id))
  return Object.fromEntries(Object.entries(busy).filter(([id]) => mine.has(id)))
}

/** Every clash in a whole set of courses, keyed by course id then by person —
    one pass over courses the caller already has, so a list of two hundred rows
    costs nothing beyond the query that drew it.

    Each course is only compared with courses that share somebody with it, so the
    quadratic runs over pairs-with-a-person-in-common rather than over every pair
    of courses. Most pairs share nobody. */
export function clashesAcross(courses: ClashCourse[]): Record<string, StaffingConflicts> {
  const live = courses.filter(canClash)

  const byPerson = new Map<string, ClashCourse[]>()
  for (const c of live) {
    for (const { instructor_id } of c.crew) {
      const list = byPerson.get(instructor_id) ?? []
      list.push(c)
      byPerson.set(instructor_id, list)
    }
  }

  const out: Record<string, StaffingConflicts> = {}
  for (const c of live) {
    const neighbours = new Map<string, ClashCourse>()
    for (const { instructor_id } of c.crew) {
      for (const other of byPerson.get(instructor_id) ?? []) {
        if (other.id !== c.id) neighbours.set(other.id, other)
      }
    }
    if (neighbours.size === 0) continue
    const found = clashesFor(c, [...neighbours.values()])
    if (Object.keys(found).length > 0) out[c.id] = found
  }
  return out
}

/** A clash in one sentence, for a place with room for one — the notice after a
    date move.

    Names people rather than counting them: "1 double-booked" sends you looking,
    and the name is what you were going to look for. Trimmed at two, because the
    third name is past the point where anybody reads on. */
export function clashSentence(
  conflicts: StaffingConflicts,
  nameOf: (instructorId: string) => string | null | undefined
): string | null {
  const ids = Object.keys(conflicts)
  if (ids.length === 0) return null

  const named = ids.map((id) => ({ name: nameOf(id) ?? 'Somebody', clashes: conflicts[id] }))
  const shown = named.slice(0, 2)
  const rest = named.length - shown.length

  const parts = shown.map(
    (p) => `${p.name} is also on ${p.clashes.map((c) => `${c.course} (${c.days})`).join(' and ')}`
  )
  return parts.join('; ') + (rest > 0 ? ` — and ${rest} other${rest === 1 ? '' : 's'}` : '')
}

/** Just the names, for a chain step with room for a few words. */
export function clashNames(
  conflicts: StaffingConflicts,
  nameOf: (instructorId: string) => string | null | undefined
): string[] {
  return Object.keys(conflicts).map((id) => nameOf(id) ?? 'Somebody')
}

/** A course row as the clash rule reads it. The label is built here so every
    place that names a clashing course names it identically — "Jungle Mobility ·
    MARSOC (PR-0042)". */
export function asClashCourse(c: {
  id?: string
  ref_number: number
  course_type: string
  custom_title: string | null
  client_name: string | null
  status?: string | null
  starts_at: string | null
  ends_at: string | null
  instance_off_days?: OffDayRange[] | null
  instance_instructors?: { instructor_id: string }[] | null
}): ClashCourse {
  return {
    id: c.id ?? String(c.ref_number),
    label: `${courseShortName(c.course_type, c.custom_title)}${c.client_name ? ` · ${c.client_name}` : ''} (PR-${String(c.ref_number).padStart(4, '0')})`,
    // The panel's own query already excludes cancelled courses; anything else
    // asking has to say, and an unstated status is a live course.
    status: c.status ?? 'confirmed',
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    offDays: c.instance_off_days ?? [],
    crew: c.instance_instructors ?? [],
  }
}

