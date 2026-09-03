import { services, categoryMeta, type ServiceCategory } from './data/services'

export type DateBlock = { starts_at: string; ends_at: string }
export type OffDayRange = { off_date: string; end_date?: string | null }

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
    it. `days` is the days it actually runs — breaks taken out, because a
    break is in the course to say that day is off and nobody is paid for it.
    `calendarDays` is first day to last with the breaks left in, which is what
    a rental vehicle or a hotel room is held for over a weekend in the middle.

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
  // A course that is break end to end still costs someone a day to run.
  const days = Math.max(courseDates(starts_at, ends_at, offDays).length, 1)
  return { days, calendarDays }
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
