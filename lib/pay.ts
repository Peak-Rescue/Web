// What the crew is owed for a course, worked out the way payroll works it.
//
// The actuals used to book pay at $500 a field day and $200 a travel day.
// Those are two products with the multiplication already done — 10 hours at
// $50, 10 hours at $20 — and doing it in advance hid the two things that
// actually vary:
//
//   · the hourly. $50, $40 or $25, per person. A day rate cannot hold three
//     numbers, so every course with a mixed crew was booked at one person's
//     rate for all of them.
//   · overtime. Non-exempt staff earn time and a half past 40 hours in a
//     Sunday-to-Saturday week, and a travel day plus five field days is 60
//     hours — so the premium is not an edge case, it is most weeks. Exempt
//     staff (Micah, Nadav) never earn it, which is the only thing exemption
//     changes here.
//
// So this counts hours first and turns them into money last. Pure, and in a
// library rather than in the panel, for the same reason lib/actuals.ts is:
// the screen previews with these functions and the accepted lines are written
// from the same ones, so what you approve and what lands cannot disagree.
//
// What it does not know: hours worked anywhere but this course. The 40 is a
// property of somebody's week, and a week can hold two courses, a day in the
// shop, or a shift nobody told the portal about. So this is a suggestion for
// one course's shape, it says out loud which week each figure belongs to, and
// every line it produces is editable before it is accepted.

import { courseDates, dayShift, type OffDayRange } from '@/lib/courses'
import { round2 } from '@/lib/expenses'

/** The shared constants, all four editable on the rates page. Defaults match
    the rows 195 inserts, so a caller that cannot reach org_settings still
    computes the same numbers rather than zeroes. */
export type PaySettings = {
  /** What a travel hour pays, the same for everybody. */
  travelHourly: number
  /** What a field day and a travel day are each assumed to be. */
  hoursPerDay: number
  /** Hours past this in a week earn the premium. */
  otWeeklyHours: number
  /** What an overtime hour pays, as a multiple of the day's own rate. */
  otMultiplier: number
}

export const DEFAULT_PAY_SETTINGS: PaySettings = {
  travelHourly: 20,
  hoursPerDay: 10,
  otWeeklyHours: 40,
  otMultiplier: 1.5,
}

/** org_settings keys, in one place so the loader and the rates page agree. */
export const PAY_SETTING_KEYS: Record<keyof PaySettings, string> = {
  travelHourly: 'pay_travel_hourly',
  hoursPerDay: 'pay_hours_per_day',
  otWeeklyHours: 'pay_ot_weekly_hours',
  otMultiplier: 'pay_ot_multiplier',
}

/** The pay settings out of org_settings rows, each falling back to its
    default on its own — a missing row is one number nobody has set, not a
    reason to price the whole course wrong. */
export function paySettingsFrom(rows: { key: string; value: number | string }[]): PaySettings {
  const get = (key: string, fallback: number) => {
    const hit = rows.find((r) => r.key === key)
    const n = hit === undefined ? NaN : Number(hit.value)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  return {
    travelHourly: get(PAY_SETTING_KEYS.travelHourly, DEFAULT_PAY_SETTINGS.travelHourly),
    hoursPerDay: get(PAY_SETTING_KEYS.hoursPerDay, DEFAULT_PAY_SETTINGS.hoursPerDay),
    otWeeklyHours: get(PAY_SETTING_KEYS.otWeeklyHours, DEFAULT_PAY_SETTINGS.otWeeklyHours),
    otMultiplier: get(PAY_SETTING_KEYS.otMultiplier, DEFAULT_PAY_SETTINGS.otMultiplier),
  }
}

export type DayKind = 'field' | 'travel'

/** One day of somebody's time, with a date on it. The date is not decoration:
    which Sunday-to-Saturday week a day falls in is what decides whether its
    hours are straight or premium, so a count of days cannot answer this and
    the dates have to travel with it. */
export type WorkDay = { date: string; kind: DayKind; hours: number }

/** Travel days per course — one out, one back. The estimator prefills the
    same two. */
export const TRAVEL_DAYS = 2

/** What this course pays one person, and for which days. Every field is an
    exception: null means "the course's own answer", so a crew who all worked
    the same week carries nothing but a rate each.

    These exist because they change the money rather than describe it.
    Somebody arriving on the Tuesday does not just work fewer days — two of
    their days move into a week with room under the forty, and the premium
    moves with them. */
export type PayTerms = {
  /** Their field hourly. Null = nobody has checked it yet. */
  fieldHourly: number | null
  /** Their first and last field day, when not the course's. */
  startsAt: string | null
  endsAt: string | null
  /** Days paid for travel. Null = two, one each way. An odd number puts the
      extra day on the way out, which is the direction that runs long. */
  travelDays: number | null
  /** Hours in each of their days, when not the standard ten. */
  hoursPerDay: number | null
}

export const NO_TERMS: PayTerms = {
  fieldHourly: null,
  startsAt: null,
  endsAt: null,
  travelDays: null,
  hoursPerDay: null,
}

/** The days the crew is on the clock for a course, in order: a travel day in,
    the days the course runs, a travel day out.

    Breaks follow the course's own answer. Paid, the crew stays put and stays
    on the clock, so the break days are field days like any other — which is
    also what makes them count toward the 40. Unpaid, they go home and the
    days come off.

    Empty until the course has dates. Nobody can be paid for a course whose
    dates nobody has set, and a guess of one day would quietly become a
    number on a page of accounts. */
export function courseFieldDates(
  course: { starts_at: string | null; ends_at: string | null; breaks_paid?: boolean | null },
  offDays: OffDayRange[]
): string[] {
  const { starts_at, ends_at } = course
  if (!starts_at) return []
  const last = ends_at ?? starts_at
  if (course.breaks_paid === false) return courseDates(starts_at, last, offDays)
  const out: string[] = []
  for (let d = starts_at; d <= last; d = dayShift(d, 1)) out.push(d)
  return out
}

/** One person's days on the clock: their field days, and the travel days
    either side of them.

    Their window trims the course's days rather than replacing them — a
    break the crew went home for is still a break for somebody who arrived
    late, and a date outside the course is not a day of it.

    Travel lands against their own first and last day, so arriving late moves
    the drive in as well, which is what decides the week it counts against. */
export function personWorkDays(
  fieldDates: string[],
  terms: PayTerms,
  settings: PaySettings
): WorkDay[] {
  const hours = terms.hoursPerDay ?? settings.hoursPerDay
  const mine = fieldDates.filter(
    (d) => (!terms.startsAt || d >= terms.startsAt) && (!terms.endsAt || d <= terms.endsAt)
  )
  if (mine.length === 0) return []

  const travel = terms.travelDays ?? TRAVEL_DAYS
  const before = Math.floor(travel / 2)
  const after = travel - before
  const days: WorkDay[] = []
  for (let i = before; i >= 1; i--) days.push({ date: dayShift(mine[0], -i), kind: 'travel', hours })
  for (const date of mine) days.push({ date, kind: 'field', hours })
  for (let i = 1; i <= after; i++) days.push({ date: dayShift(mine[mine.length - 1], i), kind: 'travel', hours })
  return days
}

/** The course's own shape, for the crew who worked all of it. */
export function courseWorkDays(
  course: { starts_at: string | null; ends_at: string | null; breaks_paid?: boolean | null },
  offDays: OffDayRange[],
  settings: PaySettings
): WorkDay[] {
  return personWorkDays(courseFieldDates(course, offDays), NO_TERMS, settings)
}

/** The Sunday that starts the week a date falls in — the workweek ADP counts
    overtime against. UTC throughout, like every other date in the app, so no
    day lands in the wrong week west of Greenwich. */
export function weekStart(date: string): string {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return dayShift(date, -day)
}

export type PayPerson = {
  /** instructors.id — who is staffed, account or not. */
  id: string
  /** Their portal account, when they have one, so a line can be attributed. */
  profileId: string | null
  name: string
  /** FLSA exempt: their hours never earn the premium. Unknown counts as
      non-exempt, which is both the law's default and the safer error. */
  exempt: boolean
  /** Whether the field and travel days they work are paid on top of anything
      else. False costs the course nothing: no hourly is asked for and their
      pay comes to nothing, though their hours are still counted, because what
      somebody worked is worth showing even when it cost nothing.

      Not the same question as being on a salary — Nadav is salaried for the
      admin work and paid the day rates as well. A salary is overhead and no
      course reads it; this is what a course's pay reads. */
  paidForDays: boolean
  /** What this course pays them and for which days. All exceptions: null
      fields follow the course. */
  terms: PayTerms
}

export type PayLineDraft = {
  /** Which of the staffed crew it pays — instructors.id, named as the column
      it is written to so a draft can be handed straight to the writer. */
  instructor_id: string
  /** What the saved line carries: null for somebody with no account, whose
      name then has to be in the description instead. */
  profileId: string | null
  kind: DayKind
  overtime: boolean
  /** The days this line covers — first and last. The calculator knows them
      exactly: which day an hour fell on is what decided whether it was
      premium, so a line that could not say which days it was for would be
      hiding the working from the only reader who might question it. */
  work_date: string | null
  end_date: string | null
  hours: number
  /** The premium is already in this, so hours × rate = amount, always. Named
      as the column it is written to, like instructor_id: a draft is handed
      straight to the writer, and a camel-cased copy of one of these silently
      arrived as undefined and stripped the hours off every written line. */
  hourly_rate: number
  amount: number
  description: string
}

export type PersonPlan = {
  person: PayPerson
  lines: PayLineDraft[]
  hours: number
  /** The two kinds of hour, kept apart. A week is a number of field hours and
      a number of travel hours at different rates, and one total hides which
      of them is wrong when the crew drove instead of flying or a travel day
      ran to sixteen hours. */
  fieldHours: number
  travelHours: number
  /** The days behind those hours, and their first and last field day — what
      the concise row shows and edits. Their own window, not the course's. */
  fieldDays: number
  travelDayCount: number
  firstDay: string | null
  lastDay: string | null
  hoursPerDay: number
  overtimeHours: number
  total: number
  /** Which weeks the hours fall in, Sunday dates, in order. Shown because the
      40 belongs to the week and not to the course: a reader who knows the
      person also worked the Tuesday before can see which figure to fix. */
  weeks: string[]
}

/** One person's pay for a set of work days.

    Hours are spent in date order against each week's straight-time allowance,
    which is what makes the premium land on the end of a long week rather than
    on whichever day happens to be dearest. A day can split across the
    threshold — the 40th hour falls mid-afternoon on the fourth day — and the
    day's hours then divide, so the arithmetic is right even though no line
    ever says "half a day".

    Lines are aggregated to at most four: field, field overtime, travel,
    travel overtime. A line per day would be twelve rows per person on a
    week-long course, all saying the same rate, and the pay list is read as a
    summary of what people were owed. */
export function payForPerson(person: PayPerson, fieldDates: string[], settings: PaySettings): PersonPlan {
  const days = personWorkDays(fieldDates, person.terms, settings)
  // Nobody is paid twice for the same week. Where the days are not paid on
  // top, the hours are still counted and nothing is priced: an hour booked
  // against somebody whose salary already covered it is money the course
  // never spent.
  const rateFor = (kind: DayKind) =>
    !person.paidForDays ? null : kind === 'field' ? person.terms.fieldHourly : settings.travelHourly

  // hours[kind][straight|ot], and the days that went into each
  const hours = {
    field: { straight: 0, overtime: 0 },
    travel: { straight: 0, overtime: 0 },
  }
  const dates: Record<string, string[]> = {}
  const noteDay = (kind: DayKind, overtime: boolean, date: string) => {
    const key = `${kind}:${overtime}`
    dates[key] = [...(dates[key] ?? []), date]
  }
  const weeks = new Set<string>()
  const spentByWeek = new Map<string, number>()

  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const week = weekStart(day.date)
    weeks.add(week)
    const spent = spentByWeek.get(week) ?? 0
    const allowance = person.exempt ? Infinity : Math.max(settings.otWeeklyHours - spent, 0)
    const straight = Math.min(day.hours, allowance)
    hours[day.kind].straight += straight
    hours[day.kind].overtime += day.hours - straight
    // A day that splits across the threshold belongs to both lines, which is
    // the truth about it: some of its hours were straight and some were not.
    if (straight > 0) noteDay(day.kind, false, day.date)
    if (day.hours - straight > 0) noteDay(day.kind, true, day.date)
    spentByWeek.set(week, spent + day.hours)
  }

  const lines: PayLineDraft[] = []
  const push = (kind: DayKind, overtime: boolean, h: number) => {
    const base = rateFor(kind)
    if (h <= 0 || base === null) return
    const hourlyRate = round2(overtime ? base * settings.otMultiplier : base)
    const covered = (dates[`${kind}:${overtime}`] ?? []).sort()
    lines.push({
      instructor_id: person.id,
      profileId: person.profileId,
      kind,
      overtime,
      work_date: covered[0] ?? null,
      // Only when it really is more than one day: a single-day line saying
      // the same date twice is a range nobody needed.
      end_date: covered.length > 1 ? covered[covered.length - 1] : null,
      hours: round2(h),
      hourly_rate: hourlyRate,
      amount: round2(h * hourlyRate),
      // Just what kind of time it is. The line says whose it is in its own
      // column and shows its hours and rate in theirs, so repeating the
      // arithmetic here would be a second copy of it to keep true.
      description: kind === 'field'
        ? overtime ? 'Field overtime' : 'Field days'
        : overtime ? 'Travel overtime' : 'Travel days',
    })
  }
  push('field', false, hours.field.straight)
  push('field', true, hours.field.overtime)
  push('travel', false, hours.travel.straight)
  push('travel', true, hours.travel.overtime)

  // In the order the days happened, which is the order the week is read in and
  // the order the premium arrives in: the drive out, the field days, the days
  // that ran past forty, the drive home. Built by kind because that is how the
  // hours are counted; shown by date because that is how it is checked.
  lines.sort((a, b) => (a.work_date ?? '').localeCompare(b.work_date ?? '') || Number(a.overtime) - Number(b.overtime))

  const fieldHours = round2(hours.field.straight + hours.field.overtime)
  const travelHours = round2(hours.travel.straight + hours.travel.overtime)

  const field = days.filter((d) => d.kind === 'field')

  return {
    person,
    lines,
    hours: round2(fieldHours + travelHours),
    fieldHours,
    travelHours,
    fieldDays: field.length,
    travelDayCount: days.length - field.length,
    firstDay: field[0]?.date ?? null,
    lastDay: field[field.length - 1]?.date ?? null,
    hoursPerDay: person.terms.hoursPerDay ?? settings.hoursPerDay,
    // Overtime on hours nobody is paid for is not overtime. Exemption says
    // the same thing about the premium; this says it about the pay entirely.
    overtimeHours: person.paidForDays ? round2(hours.field.overtime + hours.travel.overtime) : 0,
    total: round2(lines.reduce((t, l) => t + l.amount, 0)),
    weeks: [...weeks].sort(),
  }
}

export type PayPlan = {
  people: PersonPlan[]
  lines: PayLineDraft[]
  total: number
  hours: number
  overtimeHours: number
  /** Who is staffed, paid by the hour, and has no hourly checked yet. Their
      field hours are missing from the total, so the panel has to say so
      rather than showing a figure that is simply short by a person. Crew who
      are not paid for their days are not missing anything. */
  missingRates: PayPerson[]
  /** What was assumed, in one line, because every figure here is derived from
      the course's dates rather than from anybody's timesheet. */
  assumptions: string
}

/** What the whole crew is owed, person by person. Null when there is nothing
    to work it out from — no dates, or nobody staffed — because a plan for
    zero people is a $0 suggestion, and a suggestion of $0 reads as an answer.*/
export function payPlan(people: PayPerson[], fieldDates: string[], settings: PaySettings): PayPlan | null {
  if (fieldDates.length === 0 || people.length === 0) return null

  const plans = people.map((p) => payForPerson(p, fieldDates, settings))
  const fieldDays = fieldDates.length
  const travelDays = TRAVEL_DAYS
  const overtimeHours = round2(plans.reduce((t, p) => t + p.overtimeHours, 0))

  return {
    people: plans,
    lines: plans.flatMap((p) => p.lines),
    total: round2(plans.reduce((t, p) => t + p.total, 0)),
    hours: round2(plans.reduce((t, p) => t + p.hours, 0)),
    overtimeHours,
    missingRates: plans
      .filter((p) => p.person.paidForDays && p.person.terms.fieldHourly === null)
      .map((p) => p.person),
    assumptions:
      `${fieldDays} field day${fieldDays === 1 ? '' : 's'} and ${travelDays} travel days each at ` +
      `${fmtHours(settings.hoursPerDay)} a day, corrected per person where it differs` +
      (overtimeHours > 0
        ? `, with hours past ${fmtHours(settings.otWeeklyHours)} in a Sunday-to-Saturday week at ${settings.otMultiplier}×`
        : ''),
  }
}

/** Hours, without a trailing .00 on the whole ones — which is all of them
    until somebody edits a line. */
export function fmtHours(h: number): string {
  const n = Math.round(h * 100) / 100
  return `${Number.isInteger(n) ? n : n.toFixed(2)} h`
}

/** A rate as money, with cents only when the premium produced some: $50, but
    $37.50. */
export function fmtRate(r: number): string {
  const n = Math.round(r * 100) / 100
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`
}
