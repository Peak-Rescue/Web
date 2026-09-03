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
  const weekendOff = [{ off_date: '2026-09-12', end_date: '2026-09-13' }]

  it('reads the same both ways when the course runs straight through', () => {
    expect(courseDayCounts('2026-09-07', '2026-09-11', noBreaks, true))
      .toEqual({ days: 5, calendarDays: 5 })
  })

  // Mon–Fri, weekend off, Mon–Fri. The crew went home for the weekend, so the
  // days worked are ten; the vehicle was kept for all twelve.
  it('takes an unpaid weekend out of the days paid and leaves it in the span', () => {
    expect(courseDayCounts('2026-09-07', '2026-09-18', weekendOff, false))
      .toEqual({ days: 10, calendarDays: 12 })
  })

  // The same weekend, with the crew staying in the canyon on the clock. The
  // course still doesn't teach those days; payroll still owes them.
  it('keeps the break in the days paid when the crew is paid through it', () => {
    expect(courseDayCounts('2026-09-07', '2026-09-18', weekendOff, true))
      .toEqual({ days: 12, calendarDays: 12 })
  })

  // Off days skip a teaching day whoever is paying: day N of a schedule is the
  // Nth date the course actually runs, and pay has nothing to say about it.
  it('skips a break in the dates the course runs, paid or not', () => {
    expect(courseDates('2026-09-07', '2026-09-18', weekendOff)).toHaveLength(10)
  })

  // A length nobody knows yet is not 1 — a course with no dates has no
  // number, and the lines that need one are left blank to be filled in.
  it('has no answer for a course with no dates', () => {
    expect(courseDayCounts(null, null, noBreaks, true)).toEqual({ days: null, calendarDays: null })
    expect(courseDayCounts('2026-09-07', null, noBreaks, true)).toEqual({ days: null, calendarDays: null })
  })
})

// These walks used to parse 'yyyy-mm-dd' as local midnight and then read the
// date back off toISOString, which is UTC — so anywhere east of Greenwich
// every date came out a day early, and day 1 of a course was yesterday. The
// walks run on UTC now, and this pins it: the browser painting a course
// calendar is not always in Colorado.
describe('dates do not move with the reader', () => {
  const eastOfGreenwich = 'Europe/Berlin'

  function inTimeZone<T>(tz: string, run: () => T): T {
    const was = process.env.TZ
    process.env.TZ = tz
    try {
      return run()
    } finally {
      process.env.TZ = was
    }
  }

  it('gives the same course dates whatever clock is reading them', () => {
    const here = courseDates('2026-09-07', '2026-09-09', [])
    const there = inTimeZone(eastOfGreenwich, () => courseDates('2026-09-07', '2026-09-09', []))
    expect(here).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
    expect(there).toEqual(here)
  })

  it('puts a break on the same day for both of them', () => {
    const off = [{ off_date: '2026-09-08' }]
    const here = computeBlocks('2026-09-07', '2026-09-09', off)
    const there = inTimeZone(eastOfGreenwich, () => computeBlocks('2026-09-07', '2026-09-09', off))
    expect(here).toEqual([
      { starts_at: '2026-09-07', ends_at: '2026-09-07' },
      { starts_at: '2026-09-09', ends_at: '2026-09-09' },
    ])
    expect(there).toEqual(here)
  })

  it('counts the same days paid and on the calendar from either side', () => {
    const off = [{ off_date: '2026-09-12', end_date: '2026-09-13' }]
    const here = courseDayCounts('2026-09-07', '2026-09-18', off, false)
    const there = inTimeZone(eastOfGreenwich, () => courseDayCounts('2026-09-07', '2026-09-18', off, false))
    expect(here).toEqual({ days: 10, calendarDays: 12 })
    expect(there).toEqual(here)
  })
})
