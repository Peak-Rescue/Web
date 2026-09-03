import { describe, it, expect } from 'vitest'
import { courseDates, computeBlocks, courseDayCounts } from '@/lib/courses'

// A schedule day has no date of its own — it is the Nth date the course runs.
// Announcing a morning depends on this being right, and a template day must
// never gain a date, which is why it is derived rather than stored.
describe('courseDates', () => {
  it('lists every running day in order', () => {
    expect(courseDates('2026-08-24', '2026-08-28', [])).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
    ])
  })

  it('skips a single off day, so day 4 is the 4th day worked', () => {
    const days = courseDates('2026-08-24', '2026-08-28', [{ off_date: '2026-08-26' }])
    expect(days).toEqual(['2026-08-24', '2026-08-25', '2026-08-27', '2026-08-28'])
    expect(days[2]).toBe('2026-08-27')
  })

  it('skips a range of off days', () => {
    expect(courseDates('2026-08-24', '2026-08-30', [{ off_date: '2026-08-26', end_date: '2026-08-28' }]))
      .toEqual(['2026-08-24', '2026-08-25', '2026-08-29', '2026-08-30'])
  })

  it('handles a one-day course', () => {
    expect(courseDates('2026-08-24', '2026-08-24', [])).toEqual(['2026-08-24'])
  })

  it('treats a missing end date as a one-day course', () => {
    expect(courseDates('2026-08-24', null, [])).toEqual(['2026-08-24'])
  })

  it('has nothing to say when the course has no dates', () => {
    expect(courseDates(null, null, [])).toEqual([])
  })

  // A schedule with more days than the course runs leaves the extras dateless,
  // and the caller shows that rather than guessing.
  it('runs out rather than inventing dates', () => {
    const running = courseDates('2026-08-24', '2026-08-25', [])
    expect(running[4]).toBeUndefined()
  })
})

describe('computeBlocks', () => {
  it('splits a course either side of its off days', () => {
    expect(computeBlocks('2026-08-24', '2026-08-28', [{ off_date: '2026-08-26' }])).toEqual([
      { starts_at: '2026-08-24', ends_at: '2026-08-25' },
      { starts_at: '2026-08-27', ends_at: '2026-08-28' },
    ])
  })
})

// A course has two lengths, and a break in the middle is what separates them:
// the days worked, and the days on the calendar the vehicle and the room are
// held across.
describe('course lengths', () => {
  const noBreaks: { off_date: string; end_date?: string | null }[] = []

  it('reads the same both ways when the course runs straight through', () => {
    expect(courseDayCounts('2026-09-07', '2026-09-11', noBreaks)).toEqual({ days: 5, calendarDays: 5 })
  })

  // Mon–Fri, weekend off, Mon–Fri: ten days worked, twelve on the calendar.
  it('takes an unpaid weekend out of the days paid and leaves it in the span', () => {
    const weekend = [{ off_date: '2026-09-12', end_date: '2026-09-13' }]
    expect(courseDayCounts('2026-09-07', '2026-09-18', weekend)).toEqual({ days: 10, calendarDays: 12 })
  })

  // The same weekend, with the crew staying in the canyon on the clock. The
  // course still doesn't teach those days; payroll still owes them.
  it('keeps a paid break in the days paid', () => {
    const weekend = [{ off_date: '2026-09-12', end_date: '2026-09-13', instructors_paid: true }]
    expect(courseDayCounts('2026-09-07', '2026-09-18', weekend)).toEqual({ days: 12, calendarDays: 12 })
  })

  // A break entered before the question was asked means what a break has
  // always meant here.
  it('reads a break that never answered the question as unpaid', () => {
    const weekend = [{ off_date: '2026-09-12', end_date: '2026-09-13', instructors_paid: null }]
    expect(courseDayCounts('2026-09-07', '2026-09-18', weekend).days).toBe(10)
  })

  // One paid Saturday inside an unpaid weekend: where two breaks disagree
  // about a date, the day is paid, because that is the safe way to be wrong.
  it('pays a date that two breaks disagree about', () => {
    const both = [
      { off_date: '2026-09-12', end_date: '2026-09-13' },
      { off_date: '2026-09-12', instructors_paid: true },
    ]
    expect(courseDayCounts('2026-09-07', '2026-09-18', both).days).toBe(11)
  })

  // Off days still skip a teaching day whoever is paying: day N of a schedule
  // is the Nth date the course actually runs, paid break or not.
  it('skips a paid break in the dates the course runs', () => {
    const paidWeekend = [{ off_date: '2026-09-12', end_date: '2026-09-13', instructors_paid: true }]
    expect(courseDates('2026-09-07', '2026-09-18', paidWeekend)).toHaveLength(10)
  })

  // A length nobody knows yet is not 1 — a course with no dates has no
  // number, and the lines that need one are left blank to be filled in.
  it('has no answer for a course with no dates', () => {
    expect(courseDayCounts(null, null, noBreaks)).toEqual({ days: null, calendarDays: null })
    expect(courseDayCounts('2026-09-07', null, noBreaks)).toEqual({ days: null, calendarDays: null })
  })
})
