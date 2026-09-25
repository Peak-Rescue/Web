import { describe, it, expect } from 'vitest'
import { draftRows, periodEndFromDue, periodFor, shiftPeriod, stateOf, rowsAsTsv, totalHours, type TimesheetCourse } from '@/lib/timesheet'
import { FIELD_CODE, TRAVEL_CODE, PAY_CODES } from '@/lib/paycodes'

// A real hours-due date off the admin calendar — a Friday — and the period it
// closes, which ends on the Saturday of that same week.
const DUE = '2026-12-18'
const ANCHOR = periodEndFromDue(DUE)

const course = (over: Partial<TimesheetCourse> = {}): TimesheetCourse => ({
  id: 'c1',
  course_type: 'rope-access',
  custom_title: null,
  location: 'Casper, WY',
  status: 'confirmed',
  starts_at: '2026-12-08',
  ends_at: '2026-12-11',
  off_days: [],
  ...over,
})

describe('pay periods', () => {
  it('closes on the Saturday of the week the hours are due in', () => {
    // Hours are due on the Friday so payroll can run; the period itself is
    // two Sunday-to-Saturday weeks, the same week overtime is counted in.
    expect(periodEndFromDue('2026-12-18')).toBe('2026-12-19')
    expect(new Date(ANCHOR + 'T00:00:00Z').getUTCDay()).toBe(6) // Saturday
  })

  it('runs the fortnight Sunday to Saturday', () => {
    expect(periodFor('2026-12-10', ANCHOR)).toEqual({ start: '2026-12-06', end: '2026-12-19' })
    expect(new Date('2026-12-06T00:00:00Z').getUTCDay()).toBe(0) // Sunday
    // The last day belongs to the period it closes, not the next one.
    expect(periodFor('2026-12-19', ANCHOR)).toEqual({ start: '2026-12-06', end: '2026-12-19' })
    expect(periodFor('2026-12-20', ANCHOR)).toEqual({ start: '2026-12-20', end: '2027-01-02' })
  })

  it('steps by a fortnight in both directions', () => {
    const p = periodFor('2026-12-10', ANCHOR)
    expect(shiftPeriod(p, -1)).toEqual({ start: '2026-11-22', end: '2026-12-05' })
    expect(shiftPeriod(p, 1)).toEqual({ start: '2026-12-20', end: '2027-01-02' })
  })

  it('holds the anchor across a year boundary', () => {
    expect(periodFor('2026-12-31', ANCHOR).end).toBe('2027-01-02')
  })
})

describe('draft rows', () => {
  const period = periodFor('2026-12-10', ANCHOR)

  it('puts a travel day either side of the field days', () => {
    const rows = draftRows(period, [course()])
    expect(rows.map((r) => [r.date, r.code])).toEqual([
      ['2026-12-07', TRAVEL_CODE],
      ['2026-12-08', FIELD_CODE],
      ['2026-12-09', FIELD_CODE],
      ['2026-12-10', FIELD_CODE],
      ['2026-12-11', FIELD_CODE],
      ['2026-12-12', TRAVEL_CODE],
    ])
    expect(totalHours(rows)).toBe(60)
  })

  it('travels home and back around a break in the middle', () => {
    const rows = draftRows(period, [
      course({ starts_at: '2026-12-07', ends_at: '2026-12-14', off_days: [{ off_date: '2026-12-10', end_date: '2026-12-11' }] }),
    ])
    const travel = rows.filter((r) => r.code === TRAVEL_CODE).map((r) => r.date)
    // The way home falls on the first day off and the way back on the last,
    // which is when you'd actually fly: the break absorbs both, and no
    // teaching day is spent in an airport.
    expect(travel).toEqual(['2026-12-06', '2026-12-10', '2026-12-11', '2026-12-15'])
  })

  it('never pays a lead rate for a day that is only travel, or twice for one day', () => {
    // Two courses back to back: the travel day out of one is the travel day
    // into the next, and the day itself can only be claimed once.
    const rows = draftRows(period, [
      course({ id: 'a', starts_at: '2026-12-08', ends_at: '2026-12-09' }),
      course({ id: 'b', starts_at: '2026-12-11', ends_at: '2026-12-12', location: 'Moab, UT' }),
    ])
    expect(new Set(rows.map((r) => r.date)).size).toBe(rows.length)
    // The 10th is the way home from one and the way out to the other.
    expect(rows.find((r) => r.date === '2026-12-10')!.code).toBe(TRAVEL_CODE)
  })

  it('lets a field day beat a travel day on the same date', () => {
    const rows = draftRows(period, [
      course({ id: 'a', starts_at: '2026-12-09', ends_at: '2026-12-09' }),
      course({ id: 'b', starts_at: '2026-12-10', ends_at: '2026-12-11' }),
    ])
    // The 10th is course b's first field day and course a's travel home.
    expect(rows.find((r) => r.date === '2026-12-10')!.code).toBe(FIELD_CODE)
  })

  it('drops days belonging to the period either side', () => {
    const rows = draftRows(period, [course({ starts_at: '2026-12-16', ends_at: '2026-12-22' })])
    expect(rows.every((r) => r.date >= period.start && r.date <= period.end)).toBe(true)
    expect(rows.at(-1)!.date).toBe('2026-12-19')
  })

  it('follows their own days and their own hours', () => {
    const rows = draftRows(period, [course({ own_starts_at: '2026-12-09', hours_per_day: 16 })])
    expect(rows[0].date).toBe('2026-12-08') // travel, the day before their start
    expect(rows.find((r) => r.code === FIELD_CODE)!.hours).toBe(16)
  })
})

describe('the state ADP asks for', () => {
  it('reads an abbreviation or a name, and guesses at neither', () => {
    expect(stateOf('Casper, WY')).toBe('WY')
    // Half the courses are written without the comma.
    expect(stateOf('Saint George UT')).toBe('UT')
    expect(stateOf('Santa Fe New Mexico')).toBe('NM')
    // A city that names no state gets a blank, not a guess.
    expect(stateOf('San Diego')).toBe('')
    expect(stateOf('Juneau, Alaska')).toBe('AK')
    expect(stateOf('WA')).toBe('WA')
    expect(stateOf('Maui')).toBe('')
    expect(stateOf('Wadi Rum, Jordan')).toBe('')
    expect(stateOf(null)).toBe('')
  })
})

describe('what gets handed over', () => {
  it('pastes into a spreadsheet as the columns it already has', () => {
    const rows = draftRows(periodFor('2026-12-10', ANCHOR), [course()])
    const [header, first] = rowsAsTsv(rows).split('\n')
    expect(header).toBe('Date\tHours\tCode\tState')
    expect(first).toBe('12/7/2026\t10\t07597T\tWY')
  })

  it('uses codes that exist in the handbook', () => {
    const codes = new Set(PAY_CODES.map((c) => c.code))
    expect(codes.has(TRAVEL_CODE)).toBe(true)
    expect(codes.has(FIELD_CODE)).toBe(true)
  })
})
