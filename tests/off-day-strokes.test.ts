import { describe, it, expect } from 'vitest'
import { strokeOffDays, clampOffDays, courseDayCounts, dayShift, type OffSpan } from '@/lib/courses'

// Breaks are drawn on the course calendar rather than typed as ranges, so the
// arithmetic a form left to the person filling it in happens in here: a stroke
// landing on breaks already drawn, and a click in the middle of a long one.
// Both the calendar under the pointer and the server writing the rows run this,
// and they have to agree or the drawing snaps back on the next refresh.

const span = (from: string, to = from): OffSpan => ({ from, to })

/** Spans as the table stores them, for handing to courseDayCounts. */
const rowsOf = (spans: OffSpan[]) => spans.map((b) => ({ off_date: b.from, end_date: b.to }))

describe('dayShift', () => {
  it('crosses a month end', () => {
    expect(dayShift('2026-08-31', 1)).toBe('2026-09-01')
    expect(dayShift('2026-09-01', -1)).toBe('2026-08-31')
  })
})

describe('strokeOffDays — painting', () => {
  it('marks a single day', () => {
    expect(strokeOffDays([], '2026-08-26', '2026-08-26', true)).toEqual([span('2026-08-26')])
  })

  it('marks a run of days drawn in either direction', () => {
    const forwards = strokeOffDays([], '2026-08-26', '2026-08-28', true)
    const backwards = strokeOffDays([], '2026-08-28', '2026-08-26', true)
    expect(forwards).toEqual([span('2026-08-26', '2026-08-28')])
    expect(backwards).toEqual(forwards)
  })

  it('swallows a break it overlaps', () => {
    expect(strokeOffDays([span('2026-08-26', '2026-08-27')], '2026-08-27', '2026-08-29', true))
      .toEqual([span('2026-08-26', '2026-08-29')])
  })

  it('swallows a break it merely abuts — no working day between them', () => {
    expect(strokeOffDays([span('2026-08-26')], '2026-08-27', '2026-08-27', true))
      .toEqual([span('2026-08-26', '2026-08-27')])
  })

  it('leaves a break with a working day between it and the stroke alone', () => {
    expect(strokeOffDays([span('2026-08-26')], '2026-08-28', '2026-08-28', true))
      .toEqual([span('2026-08-26'), span('2026-08-28')])
  })

})

describe('strokeOffDays — erasing', () => {
  it('rubs out a whole break', () => {
    expect(strokeOffDays([span('2026-08-26')], '2026-08-26', '2026-08-26', false)).toEqual([])
  })

  it('cuts a break in two when the stroke lands in the middle', () => {
    expect(strokeOffDays([span('2026-08-24', '2026-08-28')], '2026-08-26', '2026-08-26', false))
      .toEqual([span('2026-08-24', '2026-08-25'), span('2026-08-27', '2026-08-28')])
  })

  it('trims an end and keeps the rest', () => {
    expect(strokeOffDays([span('2026-08-24', '2026-08-28')], '2026-08-27', '2026-08-30', false))
      .toEqual([span('2026-08-24', '2026-08-26')])
  })

  it('leaves breaks the stroke misses', () => {
    const before = [span('2026-08-24'), span('2026-08-28')]
    expect(strokeOffDays(before, '2026-08-26', '2026-08-26', false)).toEqual(before)
  })
})

describe('clampOffDays', () => {
  it('drops a break the window no longer reaches', () => {
    expect(clampOffDays([span('2026-08-20')], '2026-08-24', '2026-08-28')).toEqual([])
  })

  it('trims a break overhanging the first day', () => {
    expect(clampOffDays([span('2026-08-22', '2026-08-26')], '2026-08-24', '2026-08-28'))
      .toEqual([span('2026-08-25', '2026-08-26')])
  })

  it('trims a break overhanging the last day', () => {
    expect(clampOffDays([span('2026-08-26', '2026-08-30')], '2026-08-24', '2026-08-28'))
      .toEqual([span('2026-08-26', '2026-08-27')])
  })

  it('a break can never cover the first or last day', () => {
    expect(clampOffDays([span('2026-08-24', '2026-08-28')], '2026-08-24', '2026-08-28'))
      .toEqual([span('2026-08-25', '2026-08-27')])
  })

  it('keeps nothing on a course too short to hold a break', () => {
    expect(clampOffDays([span('2026-08-24')], '2026-08-24', '2026-08-25')).toEqual([])
  })
})

// What a stroke does to the money. An off-day row is only visible in a quote
// through courseDayCounts — instructor days come off for an unpaid break and
// hold for a paid one — so the two are worth reading together, particularly
// where painting is asymmetric.
describe('what a stroke costs', () => {
  const rows = rowsOf

  // Whether the crew is paid through breaks is one answer for the course, so
  // the same stroke costs different things on two courses and nothing about
  // the stroke says which.
  it('takes instructor days off when the crew is not paid through breaks', () => {
    const after = strokeOffDays([], '2026-08-26', '2026-08-27', true)
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(after), false))
      .toEqual({ days: 5, calendarDays: 7 })
  })

  it('holds them when they are, and the calendar span never moves either way', () => {
    const after = strokeOffDays([], '2026-08-26', '2026-08-27', true)
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(after), true))
      .toEqual({ days: 7, calendarDays: 7 })
  })

  it('erasing a break gives the days back', () => {
    const painted = strokeOffDays([], '2026-08-26', '2026-08-27', true)
    const erased = strokeOffDays(painted, '2026-08-26', '2026-08-27', false)
    expect(erased).toEqual([])
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(erased), false).days).toBe(7)
  })

  it('a window pulled in past a break gives its days back too', () => {
    const painted = strokeOffDays([], '2026-08-26', '2026-08-27', true)
    const kept = clampOffDays(painted, '2026-08-24', '2026-08-26')
    expect(kept).toEqual([])
    expect(courseDayCounts('2026-08-24', '2026-08-26', rows(kept), false))
      .toEqual({ days: 3, calendarDays: 3 })
  })
})
