import { describe, it, expect } from 'vitest'
import {
  courseFieldDates,
  courseWorkDays,
  payForPerson,
  payPlan,
  paySettingsFrom,
  personWorkDays,
  weekStart,
  DEFAULT_PAY_SETTINGS,
  NO_TERMS,
  type PayPerson,
  type PayTerms,
  type WorkDay,
} from '@/lib/pay'

const SETTINGS = DEFAULT_PAY_SETTINGS

function person(over: Partial<Omit<PayPerson, 'terms'>> & { terms?: Partial<PayTerms> } = {}): PayPerson {
  const { terms, ...rest } = over
  return {
    id: 'i1',
    profileId: 'p1',
    name: 'Alex Kerr',
    exempt: false,
    paidForDays: true,
    terms: { ...NO_TERMS, fieldHourly: 50, ...terms },
    ...rest,
  }
}

/** Mon–Fri in the field: the ordinary week-long course. With the standard
    terms that is Sunday the 13th out and Saturday the 19th back, all inside
    one Sunday-to-Saturday week. */
const FIELD_WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']

const WEEK_LONG: WorkDay[] = [
  { date: '2026-09-13', kind: 'travel', hours: 10 },
  { date: '2026-09-14', kind: 'field', hours: 10 },
  { date: '2026-09-15', kind: 'field', hours: 10 },
  { date: '2026-09-16', kind: 'field', hours: 10 },
  { date: '2026-09-17', kind: 'field', hours: 10 },
  { date: '2026-09-18', kind: 'field', hours: 10 },
  { date: '2026-09-19', kind: 'travel', hours: 10 },
]

describe('the days a course puts somebody on the clock', () => {
  it('is the course, with a travel day either side', () => {
    const days = courseWorkDays(
      { starts_at: '2026-09-14', ends_at: '2026-09-18', breaks_paid: true },
      [],
      SETTINGS
    )
    expect(days).toEqual(WEEK_LONG)
  })

  it('drops a break the crew went home for, and keeps one they stayed through', () => {
    const off = [{ off_date: '2026-09-19', end_date: '2026-09-20' }]
    const course = { starts_at: '2026-09-14', ends_at: '2026-09-25' }
    const unpaid = courseWorkDays({ ...course, breaks_paid: false }, off, SETTINGS)
    const paid = courseWorkDays({ ...course, breaks_paid: true }, off, SETTINGS)
    expect(unpaid.filter((d) => d.kind === 'field')).toHaveLength(10)
    expect(paid.filter((d) => d.kind === 'field')).toHaveLength(12)
    // Travel is the outside edges either way — nobody flies home for a weekend.
    expect(unpaid.map((d) => d.date).at(0)).toBe('2026-09-13')
    expect(unpaid.map((d) => d.date).at(-1)).toBe('2026-09-26')
  })

  it('has nothing to say about a course with no dates', () => {
    expect(courseWorkDays({ starts_at: null, ends_at: null }, [], SETTINGS)).toEqual([])
  })
})

describe('the workweek overtime is counted against', () => {
  it('starts on Sunday', () => {
    expect(weekStart('2026-09-13')).toBe('2026-09-13') // a Sunday
    expect(weekStart('2026-09-19')).toBe('2026-09-13') // the Saturday after
    expect(weekStart('2026-09-20')).toBe('2026-09-20') // the next Sunday
  })
})

describe('what a non-exempt instructor earns on a week-long course', () => {
  const plan = payForPerson(person(), FIELD_WEEK, SETTINGS)

  it('pays the first 40 hours straight and the rest at time and a half', () => {
    // Sun travel 10 + Mon–Wed field 30 = the 40 straight hours. Thu and Fri
    // field are premium, and so is the Saturday travel home.
    expect(plan.lines.map((l) => [l.kind, l.overtime, l.hours, l.hourly_rate, l.amount])).toEqual([
      ['travel', false, 10, 20, 200],
      ['field', false, 30, 50, 1500],
      ['field', true, 20, 75, 1500],
      ['travel', true, 10, 30, 300],
    ])
    expect(plan.total).toBe(3500)
    expect(plan.overtimeHours).toBe(30) // two field days and the drive home
  })

  it('keeps the two kinds of hour apart, since they are paid differently', () => {
    expect([plan.fieldHours, plan.travelHours, plan.hours]).toEqual([50, 20, 70])
  })

  it('pays overtime at the rate of the day it falls on, not a blend', () => {
    // The Saturday drive home is overtime at $30, not at 1.5 × some average
    // of the field and travel rates.
    expect(plan.lines.find((l) => l.kind === 'travel' && l.overtime)?.hourly_rate).toBe(30)
  })
})

describe('what an exempt instructor earns for the same week', () => {
  it('is straight time throughout — the premium is not theirs', () => {
    const plan = payForPerson(person({ exempt: true }), FIELD_WEEK, SETTINGS)
    expect(plan.lines.map((l) => [l.kind, l.overtime, l.hours, l.amount])).toEqual([
      ['travel', false, 20, 400],
      ['field', false, 50, 2500],
    ])
    expect(plan.total).toBe(2900)
    expect(plan.overtimeHours).toBe(0)
  })
})

describe('a person on a lower hourly', () => {
  it('is priced at their own rate, premium and all', () => {
    const plan = payForPerson(person({ terms: { fieldHourly: 25 } }), FIELD_WEEK, SETTINGS)
    expect(plan.lines.filter((l) => l.kind === 'field').map((l) => l.hourly_rate)).toEqual([25, 37.5])
    expect(plan.total).toBe(2000) // 30 × 25 + 20 × 37.50 + 200 + 300
  })

  it('earns nothing in the field until somebody says what they are paid', () => {
    const plan = payForPerson(person({ terms: { fieldHourly: null } }), FIELD_WEEK, SETTINGS)
    expect(plan.lines.every((l) => l.kind === 'travel')).toBe(true)
    expect(payPlan([person({ terms: { fieldHourly: null } })], FIELD_WEEK, SETTINGS)?.missingRates).toHaveLength(1)
  })
})

describe('the 40 belongs to the week, not to the course', () => {
  it('starts a fresh allowance when the course crosses a Sunday', () => {
    // Sat 12th travel in, Sun 13th – Thu 17th field, Fri 18th travel out.
    // The Saturday is alone in its week, so all 10 of its hours are straight;
    // the new week then has its own 40 before anything is premium.
    const dates = courseFieldDates({ starts_at: '2026-09-13', ends_at: '2026-09-17', breaks_paid: true }, [])
    const plan = payForPerson(person(), dates, SETTINGS)
    expect(plan.hours).toBe(70)
    expect(plan.overtimeHours).toBe(20) // 60 hours in the second week, not 70
  })

  it('splits a day when the fortieth hour lands in the middle of it', () => {
    // Four twelve-hour field days and no travel: 48 hours, 40 of them
    // straight.
    const plan = payForPerson(
      person({ terms: { travelDays: 0, hoursPerDay: 12 } }),
      ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'],
      SETTINGS
    )
    expect(plan.lines.map((l) => [l.overtime, l.hours, l.amount])).toEqual([
      [false, 40, 2000],
      [true, 8, 600],
    ])
  })
})

describe('somebody whose days are not paid on top', () => {
  it('costs the course nothing, hourly or not', () => {
    // Micah: salaried, and not paid for course days. An hour booked against
    // him is money the course never spent.
    const plan = payForPerson(person({ paidForDays: false }), FIELD_WEEK, SETTINGS)
    expect(plan.lines).toEqual([])
    expect(plan.total).toBe(0)
    expect(plan.overtimeHours).toBe(0)
  })

  it('still has its hours counted, because what they worked is worth showing', () => {
    expect(payForPerson(person({ paidForDays: false }), FIELD_WEEK, SETTINGS).hours).toBe(70)
  })

  it('is not somebody the panel should be asking a rate for', () => {
    const plan = payPlan([person({ paidForDays: false, terms: { fieldHourly: null } })], FIELD_WEEK, SETTINGS)
    expect(plan?.missingRates).toEqual([])
    expect(plan?.total).toBe(0)
  })
})

describe("somebody who worked their own days, not the course's", () => {
  it('shows up late and is paid from the day they arrived', () => {
    // Wednesday to Friday, and the drive in moves with them: their travel
    // day is the Tuesday, not the Sunday the rest of the crew flew.
    const plan = payForPerson(person({ terms: { startsAt: '2026-09-16' } }), FIELD_WEEK, SETTINGS)
    expect([plan.fieldDays, plan.firstDay, plan.lastDay]).toEqual([3, '2026-09-16', '2026-09-18'])
    expect(plan.hours).toBe(50)
    // 50 hours in the one week: 40 straight, 10 premium.
    expect(plan.overtimeHours).toBe(10)
  })

  it('leaves early, and the drive home comes with them', () => {
    const plan = payForPerson(person({ terms: { endsAt: '2026-09-16' } }), FIELD_WEEK, SETTINGS)
    // The Saturday drive home becomes the Thursday one.
    expect(personWorkDays(FIELD_WEEK, { ...NO_TERMS, endsAt: '2026-09-16' }, SETTINGS).at(-1)?.date)
      .toBe('2026-09-17')
    expect(plan.lastDay).toBe('2026-09-16')
    expect(plan.travelDayCount).toBe(2)
    expect(plan.hours).toBe(50) // 3 field days plus two travel
  })

  it('is paid for the travel days they actually had', () => {
    expect(payForPerson(person({ terms: { travelDays: 0 } }), FIELD_WEEK, SETTINGS).travelHours).toBe(0)
    expect(payForPerson(person({ terms: { travelDays: 1 } }), FIELD_WEEK, SETTINGS).travelHours).toBe(10)
  })

  it('can have a day that is not ten hours, for the flight to another continent', () => {
    const plan = payForPerson(person({ terms: { hoursPerDay: 16 } }), FIELD_WEEK, SETTINGS)
    expect(plan.hours).toBe(112) // 7 days × 16
    expect(plan.hoursPerDay).toBe(16)
  })

  it('earns nothing at all if none of the course was theirs', () => {
    const plan = payForPerson(person({ terms: { startsAt: '2026-10-01' } }), FIELD_WEEK, SETTINGS)
    expect([plan.lines, plan.hours, plan.total]).toEqual([[], 0, 0])
  })
})

describe('the plan for the whole crew', () => {
  const crew = [
    person({ id: 'i1', name: 'Alex Kerr' }),
    person({ id: 'i2', profileId: null, name: 'Sam Oyelaran', terms: { fieldHourly: 25 } }),
    person({ id: 'i3', name: 'Micah Rush', exempt: true }),
    person({ id: 'i4', name: 'Sal Aried', paidForDays: false, terms: { fieldHourly: null } }),
  ]
  const plan = payPlan(crew, FIELD_WEEK, SETTINGS)

  it('is one set of lines per person, and adds up to all of them', () => {
    expect(plan?.people.map((p) => p.total)).toEqual([3500, 2000, 2900, 0])
    expect(plan?.total).toBe(8400)
    // The salaried week is in the hours and out of the money.
    expect(plan?.hours).toBe(280)
  })

  it('puts the lines in the order the days happened', () => {
    // The drive out, the field days, the two that ran past forty, the drive
    // home. The dates are not on the lines — which day an hour fell on is the
    // calculator's working — but they are still what decides the order.
    expect(plan?.people[0].lines.map((l) => l.description)).toEqual([
      'Travel days',
      'Field days',
      'Field overtime',
      'Travel overtime',
    ])
  })

  it('keeps field and travel on lines of their own, straight and premium apart', () => {
    // Four lines, so the hours on any one of them can be corrected without
    // unpicking somebody else's week from a single total.
    expect(plan?.people[0].lines.map((l) => l.description)).toEqual([
      'Travel days',
      'Field days',
      'Field overtime',
      'Travel overtime',
    ])
  })

  it('says what it assumed, because nothing here came from a timesheet', () => {
    expect(plan?.assumptions).toBe(
      '5 field days and 2 travel days each at 10 h a day, corrected per person where it differs, ' +
        'with hours past 40 h in a Sunday-to-Saturday week at 1.5×'
    )
  })

  it('has nothing to offer with no dates or nobody staffed', () => {
    expect(payPlan(crew, [], SETTINGS)).toBeNull()
    expect(payPlan([], FIELD_WEEK, SETTINGS)).toBeNull()
  })
})

describe('the shared constants', () => {
  it('come from the rates page, each falling back on its own', () => {
    expect(
      paySettingsFrom([
        { key: 'pay_travel_hourly', value: '22' },
        { key: 'pay_ot_weekly_hours', value: 45 },
      ])
    ).toEqual({ travelHourly: 22, hoursPerDay: 10, otWeeklyHours: 45, otMultiplier: 1.5 })
  })

  it('ignores a row that says nothing usable', () => {
    expect(paySettingsFrom([{ key: 'pay_hours_per_day', value: 0 }]).hoursPerDay).toBe(10)
  })
})
