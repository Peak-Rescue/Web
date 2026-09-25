// The pay-period timesheet: the days you worked, in the shape ADP wants them.
//
// Nothing here is new information. The courses know their dates, the off days
// know where a trip breaks in two, and the handbook knows what a day is worth.
// This assembles those into rows and then gets out of the way — the draft is
// a starting point, and every row is editable, because the exceptions (a day
// flown home early, two travel days at the end, a day of admin) are exactly
// what a generated timesheet cannot know.

import { computeBlocks, courseShortName, dayShift, type OffDayRange } from '@/lib/courses'
import { weekStart } from '@/lib/pay'
import { splitRegion } from '@/lib/regions'
import { FIELD_CODE, TRAVEL_CODE } from '@/lib/paycodes'

export const PERIOD_DAYS = 14
export const DEFAULT_HOURS = 10

export type TimesheetRow = {
  date: string
  hours: number
  code: string
  /** ADP asks for the state the work happened in. */
  state: string
  /** Which course this came from — for the person checking, never sent to ADP. */
  note: string
}

export type TimesheetCourse = {
  id: string
  course_type: string
  custom_title: string | null
  location: string | null
  /** ISO region code — 'US-CA'. The location is prose; this is the fact. */
  region?: string | null
  status: string
  starts_at: string | null
  ends_at: string | null
  off_days: OffDayRange[]
  own_starts_at?: string | null
  own_ends_at?: string | null
  hours_per_day?: number | null
}

export type Period = { start: string; end: string }

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)

/** The pay period a given hours-due date closes.
 *
 *  The due date is not the last day of the period — it is the Friday inside
 *  its final week, because payroll has to be told the hours before it runs.
 *  The period itself is two of the Sunday-to-Saturday weeks overtime is
 *  reckoned in (lib/pay.ts `weekStart`), so it ends on the Saturday of the
 *  week the due date falls in. Derived from the weekday rather than by adding
 *  a day, so a due date that ever moves to a Thursday still lands right. */
export function periodEndFromDue(due: string): string {
  return dayShift(weekStart(due), 6)
}

/** The pay period containing `date`, anchored on a known period end.
    Periods recur every fortnight, so any one of them fixes all of them. */
export function periodFor(date: string, anchorEnd: string): Period {
  const drift = ((daysBetween(anchorEnd, date) % PERIOD_DAYS) + PERIOD_DAYS) % PERIOD_DAYS
  const end = dayShift(date, drift === 0 ? 0 : PERIOD_DAYS - drift)
  return { start: dayShift(end, -(PERIOD_DAYS - 1)), end }
}

export const shiftPeriod = (p: Period, periods: number): Period => ({
  start: dayShift(p.start, periods * PERIOD_DAYS),
  end: dayShift(p.end, periods * PERIOD_DAYS),
})

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
}

const ABBREVIATIONS = new Set(Object.values(STATES))

/** The state ADP wants, off the course's own region code.
 *
 *  A course records where it is twice: `location` is prose somebody typed,
 *  `region` is the ISO code the venue and map matching run on. The code is
 *  the one to read — "San Diego" names no state and US-CA does.
 *
 *  A course outside the US has no state to give, and gets a blank. Only a
 *  course with no region at all falls back to reading the prose, which is
 *  every course written before the field existed. */
export function stateFor(c: { region?: string | null; location: string | null }): string {
  const { country, sub } = splitRegion(c.region)
  if (country === 'US') return sub.split('-')[1] ?? ''
  if (c.region) return ''
  return stateOf(c.location)
}

/** The state a location names, when it names one at all.
    A comma is not required — half the courses are written "Saint George UT"
    — so this reads the end of the string rather than the last field: the
    final word if it is an abbreviation, else the last word or two if they
    spell a state out. "Maui" and "San Diego" name no state and get a blank
    for someone to fill, because inferring one from a city is guessing. */
export function stateOf(location: string | null): string {
  if (!location) return ''
  const words = location.trim().replace(/[.,]+$/, '').split(/[\s,]+/).filter(Boolean)
  if (words.length === 0) return ''

  const last = words[words.length - 1]
  if (/^[A-Za-z]{2}$/.test(last) && ABBREVIATIONS.has(last.toUpperCase())) return last.toUpperCase()

  // "New Mexico" and "West Virginia" are two words; everything else is one.
  const lastTwo = words.slice(-2).join(' ').toLowerCase()
  return STATES[lastTwo] ?? STATES[last.toLowerCase()] ?? ''
}

/** The window this person works on a course — theirs when it differs. */
function workWindow(c: TimesheetCourse): Period | null {
  if (!c.starts_at) return null
  const courseStart = c.starts_at
  const courseEnd = c.ends_at ?? c.starts_at
  const start = c.own_starts_at ?? courseStart
  const end = c.own_ends_at ?? courseEnd
  return end < start ? { start: courseStart, end: courseEnd } : { start, end }
}

/** A draft for one pay period: a travel day either side of each block of
    field days, ten hours on everything. Days outside the period drop out —
    they belong to the timesheet before or after this one. */
export function draftRows(period: Period, courses: TimesheetCourse[]): TimesheetRow[] {
  const rows: TimesheetRow[] = []

  for (const c of courses) {
    if (c.status === 'cancelled') continue
    const w = workWindow(c)
    if (!w) continue

    const note = [courseShortName(c.course_type, c.custom_title), c.location]
      .filter(Boolean)
      .map((s) => s!.trim())
      .join(' — ')
    const state = stateFor(c)
    const hours = c.hours_per_day ?? DEFAULT_HOURS

    for (const b of computeBlocks(w.start, w.end, c.off_days)) {
      // A break in the middle of a course is a trip home and a trip back, so
      // the travel days hang off each block rather than off the course.
      rows.push({ date: dayShift(b.starts_at, -1), hours: DEFAULT_HOURS, code: TRAVEL_CODE, state, note })
      for (let d = b.starts_at; d <= b.ends_at; d = dayShift(d, 1)) {
        rows.push({ date: d, hours, code: FIELD_CODE, state, note })
      }
      rows.push({ date: dayShift(b.ends_at, 1), hours: DEFAULT_HOURS, code: TRAVEL_CODE, state, note })
    }
  }

  // One row per date. Where a travel day lands on another course's field day,
  // the field day wins — you were not travelling, you were teaching.
  const byDate = new Map<string, TimesheetRow>()
  for (const r of rows) {
    if (r.date < period.start || r.date > period.end) continue
    const held = byDate.get(r.date)
    if (!held || (held.code === TRAVEL_CODE && r.code !== TRAVEL_CODE)) byDate.set(r.date, r)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const totalHours = (rows: TimesheetRow[]): number =>
  Math.round(rows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0) * 100) / 100

const usDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}/${y}`
}

/** Tab-separated, which is what a spreadsheet paste wants. */
export const rowsAsTsv = (rows: TimesheetRow[]): string =>
  ['Date\tHours\tCode\tState', ...rows.map((r) => [usDate(r.date), r.hours, r.code, r.state].join('\t'))].join('\n')

/** The same rows as plain text, for the body of an email. */
export const rowsAsText = (rows: TimesheetRow[]): string =>
  rows.map((r) => `${usDate(r.date)}   ${r.hours} hrs   ${r.code}${r.state ? `   ${r.state}` : ''}`).join('\n')
