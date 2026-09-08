import { describe, it, expect } from 'vitest'
import { overlappingDates, formatDayList } from '@/lib/courses'

const w = (starts_at: string | null, ends_at: string | null = null, offDays: { off_date: string; end_date?: string | null }[] = []) =>
  ({ starts_at, ends_at, offDays })

// Nothing stopped the same instructor being staffed on two courses running the
// same week. These are the dates that decide whether that happened.
describe('overlappingDates', () => {
  it('finds the days two courses share', () => {
    expect(overlappingDates(w('2026-03-02', '2026-03-06'), w('2026-03-05', '2026-03-09')))
      .toEqual(['2026-03-05', '2026-03-06'])
  })

  it('is empty for courses that merely abut', () => {
    expect(overlappingDates(w('2026-03-02', '2026-03-06'), w('2026-03-07', '2026-03-09'))).toEqual([])
  })

  it('finds a one-day course sitting inside a longer one', () => {
    expect(overlappingDates(w('2026-03-02', '2026-03-06'), w('2026-03-04'))).toEqual(['2026-03-04'])
  })

  it('clears a course that runs entirely in the other one\'s break', () => {
    const long = w('2026-03-02', '2026-03-13', [{ off_date: '2026-03-07', end_date: '2026-03-08' }])
    expect(overlappingDates(long, w('2026-03-07', '2026-03-08'))).toEqual([])
  })

  it('still catches a course that only partly falls in the break', () => {
    const long = w('2026-03-02', '2026-03-13', [{ off_date: '2026-03-07', end_date: '2026-03-08' }])
    expect(overlappingDates(long, w('2026-03-08', '2026-03-09'))).toEqual(['2026-03-09'])
  })

  it('respects breaks on both sides', () => {
    const a = w('2026-03-02', '2026-03-06', [{ off_date: '2026-03-04' }])
    const b = w('2026-03-04', '2026-03-05', [{ off_date: '2026-03-05' }])
    expect(overlappingDates(a, b)).toEqual([])
  })

  it('says nothing about a course with no dates yet', () => {
    expect(overlappingDates(w(null, null), w('2026-03-04', '2026-03-06'))).toEqual([])
    expect(overlappingDates(w('2026-03-04', '2026-03-06'), w(null, null))).toEqual([])
  })

  it('is symmetric', () => {
    const a = w('2026-03-02', '2026-03-06')
    const b = w('2026-03-05', '2026-03-09')
    expect(overlappingDates(a, b)).toEqual(overlappingDates(b, a))
  })
})

describe('formatDayList', () => {
  it('joins consecutive days into one range', () => {
    expect(formatDayList(['2026-03-03', '2026-03-04', '2026-03-05'])).toBe('Mar 3–5')
  })

  it('writes a single day on its own', () => {
    expect(formatDayList(['2026-03-03'])).toBe('Mar 3')
  })

  it('splits a gap into two ranges', () => {
    expect(formatDayList(['2026-03-03', '2026-03-04', '2026-03-09'])).toBe('Mar 3–4, Mar 9')
  })

  it('repeats the month across a month boundary', () => {
    expect(formatDayList(['2026-03-30', '2026-03-31', '2026-04-01'])).toBe('Mar 30–Apr 1')
  })

  it('sorts and dedupes what it is given', () => {
    expect(formatDayList(['2026-03-05', '2026-03-03', '2026-03-04', '2026-03-04'])).toBe('Mar 3–5')
  })

  it('is empty for no days', () => {
    expect(formatDayList([])).toBe('')
  })
})
