import { services, categoryMeta, type ServiceCategory } from './data/services'

export type DateBlock = { starts_at: string; ends_at: string }
/** A break in a course. `instructors_paid` is asked when the break is
    designated: both kinds skip a teaching day, but only an unpaid one comes
    off the instructor days a client is quoted for. Absent (older rows, and
    callers that don't select it) reads as unpaid — what a break meant before
    the question was asked. */
export type OffDayRange = {
  off_date: string
  end_date?: string | null
  instructors_paid?: boolean | null
}

/** Every individual date a set of off-day rows covers, ranges expanded. */
function offDates(offDays: OffDayRange[]): Set<string> {
  const out = new Set<string>()
  for (const { off_date, end_date } of offDays) {
    const d = new Date(off_date + 'T00:00:00')
    const e = new Date((end_date ?? off_date) + 'T00:00:00')
    while (d <= e) {
      out.add(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  }
  return out
}

export function computeBlocks(starts_at: string, ends_at: string, offDays: OffDayRange[]): DateBlock[] {
  // Every break skips a teaching day, paid or not: the blocks are about when
  // the course runs, not about who is owed for it.
  const offSet = offDates(offDays)

  const blocks: DateBlock[] = []
  const end = new Date(ends_at + 'T00:00:00')
  let blockStart: string | null = null
  let blockEnd: string | null = null

  const d = new Date(starts_at + 'T00:00:00')
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10)
    if (!offSet.has(dateStr)) {
      if (!blockStart) blockStart = dateStr
      blockEnd = dateStr
    } else if (blockStart && blockEnd) {
      blocks.push({ starts_at: blockStart, ends_at: blockEnd })
      blockStart = null
      blockEnd = null
    }
    d.setDate(d.getDate() + 1)
  }

  if (blockStart && blockEnd) blocks.push({ starts_at: blockStart, ends_at: blockEnd })
  return blocks
}

/** The calendar dates a course actually runs, in order, off days removed.
    A schedule day is positional — it has no date of its own, and must not gain
    one, because schedules are saved to the shelf as templates and a template
    day belongs to no calendar. So day N is simply the Nth date the course
    runs, worked out here from the two facts that do know: the course's dates
    and its off days.

    A schedule with more days than the course runs leaves the extras dateless.
    That is a real state — someone drafted six days for a five-day course — and
    the caller shows it rather than guessing. */
export function courseDates(
  starts_at: string | null,
  ends_at: string | null,
  offDays: OffDayRange[]
): string[] {
  if (!starts_at) return []
  const out: string[] = []
  for (const b of computeBlocks(starts_at, ends_at ?? starts_at, offDays)) {
    const d = new Date(b.starts_at + 'T00:00:00')
    const end = new Date(b.ends_at + 'T00:00:00')
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  }
  return out
}

/** A course's two lengths, for anything that has to put a number of days on
    it. `days` is the days somebody is paid for: the days the course runs,
    plus any break marked as paid, because the crew that stays in the canyon
    over a weekend is on the clock whether or not anyone is being taught.
    `calendarDays` is first day to last with every break left in, which is
    what a rental vehicle or a hotel room is held for regardless.

    Both null until the course has dates: a length nobody knows is not 1. */
export function courseDayCounts(
  starts_at: string | null,
  ends_at: string | null,
  offDays: OffDayRange[]
): { days: number | null; calendarDays: number | null } {
  if (!starts_at || !ends_at) return { days: null, calendarDays: null }
  const calendarDays = Math.max(
    Math.round((Date.parse(ends_at) - Date.parse(starts_at)) / 86_400_000) + 1,
    1
  )
  // Only an unpaid break comes off the count: a paid one is a day the course
  // does not teach and still owes somebody a day's wage. A date covered by
  // both a paid and an unpaid row counts as paid — where two breaks disagree,
  // quoting the more expensive reading is the safe way to be wrong.
  const paid = offDates(offDays.filter((o) => o.instructors_paid))
  const unpaid = offDates(offDays.filter((o) => !o.instructors_paid))
  const notWorked = [...unpaid].filter((d) => !paid.has(d) && d >= starts_at && d <= ends_at)
  // A course that is break end to end still costs someone a day to run.
  const days = Math.max(calendarDays - notWorked.length, 1)
  return { days, calendarDays }
}

/** A break, normalised to two dates and one question: paid or not. The rows
    in the table say the same thing with a nullable end date. */
export type OffSpan = { from: string; to: string; paid: boolean }

/** The day n days either side of a yyyy-mm-dd. UTC, so no break lands a day
    out west of Greenwich. */
export function dayShift(d: string, n: number): string {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** What a stroke drawn across from→to leaves the breaks looking like.
 *
 *  Breaks are painted on the course calendar rather than typed as ranges, so
 *  the arithmetic a form left to the person filling it in has to happen
 *  somewhere: a stroke can land on top of breaks already there, and a click in
 *  the middle of a five-day break has to cut it in two.
 *
 *  Painting swallows every break the stroke touches or merely abuts — two
 *  breaks with no working day between them are one break, however they were
 *  drawn — and the result is paid if the stroke or anything it swallowed was.
 *  A date covered by a paid and an unpaid break already reads as paid
 *  (see courseDayCounts), and a stroke must not quietly take pay off days
 *  that had it.
 *
 *  Erasing removes the stroke's days and keeps whatever ends survive.
 *
 *  Ordered by start date, so the result is comparable to itself. */
export function strokeOffDays(
  spans: OffSpan[],
  from: string,
  to: string,
  paint: boolean,
  paid: boolean
): OffSpan[] {
  if (to < from) [from, to] = [to, from]

  const out = paint
    ? (() => {
        const touched = spans.filter((b) => b.to >= dayShift(from, -1) && b.from <= dayShift(to, 1))
        const rest = spans.filter((b) => !touched.includes(b))
        return [
          ...rest,
          {
            from: touched.reduce((m, b) => (b.from < m ? b.from : m), from),
            to: touched.reduce((m, b) => (b.to > m ? b.to : m), to),
            paid: paid || touched.some((b) => b.paid),
          },
        ]
      })()
    : spans.flatMap((b) => {
        if (b.to < from || b.from > to) return [b]
        const parts: OffSpan[] = []
        if (b.from < from) parts.push({ ...b, to: dayShift(from, -1) })
        if (b.to > to) parts.push({ ...b, from: dayShift(to, 1) })
        return parts
      })

  return out.sort((a, b) => a.from.localeCompare(b.from))
}

/** Breaks trimmed to a course window, for when the window moves under them.
    A break that no longer overlaps the days between the first and last is
    dropped: an off-day outside the course is a day nothing can be said about,
    and every reader of the dates would have to explain it away. */
export function clampOffDays(spans: OffSpan[], starts_at: string, ends_at: string): OffSpan[] {
  const first = dayShift(starts_at, 1)
  const last = dayShift(ends_at, -1)
  if (last < first) return []
  return spans
    .map((b) => ({ ...b, from: b.from < first ? first : b.from, to: b.to > last ? last : b.to }))
    .filter((b) => b.from <= b.to)
}

export { categoryMeta }

// Six of the tactical offerings are "<terrain> Mobility", so the word is pure
// repetition once you're inside the Tactical group — the terrain is the choice.
// Only the grouped picker drops it; everywhere a course name stands on its own
// (calendar events, staffing emails, quotes) keeps the full shortTitle.
const pickerLabel = (shortTitle: string) => shortTitle.replace(/ Mobility$/, '')

export const COURSE_TYPE_OPTIONS = [
  ...(['tactical', 'sar', 'industrial', 'specialty'] as ServiceCategory[]).map(cat => ({
    category: cat,
    label: categoryMeta[cat].label,
    options: services
      .filter(s => s.category === cat)
      .map(s => ({ value: s.slug, label: pickerLabel(s.shortTitle) })),
  })),
]

export function courseDisplayName(course_type: string, custom_title: string | null): string {
  if (course_type === 'custom') return custom_title ?? 'Custom Course'
  return services.find(s => s.slug === course_type)?.title ?? custom_title ?? course_type
}

export function courseShortName(course_type: string, custom_title: string | null): string {
  if (course_type === 'custom') return custom_title ?? 'Custom Course'
  return services.find(s => s.slug === course_type)?.shortTitle ?? custom_title ?? course_type
}

// Calendar-event title, shared by the Google Calendar sync and the portal
// calendars so an event reads the same in both:
// "Name — Client — Location — Crew first names".
export function courseEventTitle(
  c: { course_type: string; custom_title: string | null; client_name?: string | null; location?: string | null },
  crewNames: string[]
): string {
  return [
    courseShortName(c.course_type, c.custom_title),
    c.client_name,
    c.location,
    crewNames.join(', ') || null,
  ]
    .filter(Boolean)
    .join(' — ')
}

// Lead(s) first, first names only — the team's long-standing manual
// calendar-event convention.
export function crewFirstNames(crew: { role: string; name: string }[]): string[] {
  return [...crew]
    .sort((a, b) => Number(a.role !== 'lead') - Number(b.role !== 'lead'))
    .map((m) => m.name.split(' ')[0])
}

// Compact display label for a course instance — the human parts (type,
// client, location, date) lead; the PR ref number trails for uniqueness.
// e.g. "Jungle Mobility · Peak Rescue · Casper · Jul 2026 (PR-0002)"
export type InstanceLabelFields = {
  ref_number: number
  course_type: string
  custom_title: string | null
  client_name: string | null
  location: string | null
  starts_at: string | null
}

export function instanceLabel(i: InstanceLabelFields): string {
  const parts = [
    courseShortName(i.course_type, i.custom_title),
    i.client_name,
    i.location,
    i.starts_at
      ? new Date(i.starts_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : null,
  ].filter(Boolean)
  return `${parts.join(' · ')} (PR-${String(i.ref_number).padStart(4, '0')})`
}
