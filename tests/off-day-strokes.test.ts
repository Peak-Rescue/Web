import { describe, it, expect } from 'vitest'
import { strokeOffDays, clampOffDays, courseDayCounts, dayShift, type OffSpan } from '@/lib/courses'

// Breaks are drawn on the course calendar rather than typed as ranges, so the
// arithmetic a form left to the person filling it in happens in here: a stroke
// landing on breaks already drawn, and a click in the middle of a long one.
// Both the calendar under the pointer and the server writing the rows run this,
// and they have to agree or the drawing snaps back on the next refresh.

const span = (from: string, to = from, paid = false): OffSpan => ({ from, to, paid })

describe('dayShift', () => {
  it('crosses a month end', () => {
    expect(dayShift('2026-08-31', 1)).toBe('2026-09-01')
    expect(dayShift('2026-09-01', -1)).toBe('2026-08-31')
  })
})

describe('strokeOffDays — painting', () => {
  it('marks a single day', () => {
    expect(strokeOffDays([], '2026-08-26', '2026-08-26', true, false)).toEqual([span('2026-08-26')])
  })

  it('marks a run of days drawn in either direction', () => {
    const forwards = strokeOffDays([], '2026-08-26', '2026-08-28', true, false)
    const backwards = strokeOffDays([], '2026-08-28', '2026-08-26', true, false)
    expect(forwards).toEqual([span('2026-08-26', '2026-08-28')])
    expect(backwards).toEqual(forwards)
  })

  it('swallows a break it overlaps', () => {
    expect(strokeOffDays([span('2026-08-26', '2026-08-27')], '2026-08-27', '2026-08-29', true, false))
      .toEqual([span('2026-08-26', '2026-08-29')])
  })

  it('swallows a break it merely abuts — no working day between them', () => {
    expect(strokeOffDays([span('2026-08-26')], '2026-08-27', '2026-08-27', true, false))
      .toEqual([span('2026-08-26', '2026-08-27')])
  })

  it('leaves a break with a working day between it and the stroke alone', () => {
    expect(strokeOffDays([span('2026-08-26')], '2026-08-28', '2026-08-28', true, false))
      .toEqual([span('2026-08-26'), span('2026-08-28')])
  })

  // A break is paid unless somebody marked it otherwise on its row, so an
  // unpaid one is a deliberate answer and a stroke drawn over or beside it
  // must not put the pay back. The two stay adjacent and disagree.
  it('draws around a break that answered pay the other way', () => {
    expect(strokeOffDays([span('2026-08-26', '2026-08-26', false)], '2026-08-26', '2026-08-28', true, true))
      .toEqual([span('2026-08-26', '2026-08-26', false), span('2026-08-27', '2026-08-28', true)])
  })

  it('draws around one it merely abuts, rather than swallowing it', () => {
    expect(strokeOffDays([span('2026-08-26', '2026-08-26', false)], '2026-08-27', '2026-08-27', true, true))
      .toEqual([span('2026-08-26', '2026-08-26', false), span('2026-08-27', '2026-08-27', true)])
  })

  // A stroke straddling a disagreeing break comes out in two pieces, one
  // either side, and the break in the middle is left as it was.
  it('splits in two around a break it straddles', () => {
    expect(strokeOffDays([span('2026-08-27', '2026-08-27', false)], '2026-08-26', '2026-08-28', true, true))
      .toEqual([
        span('2026-08-26', '2026-08-26', true),
        span('2026-08-27', '2026-08-27', false),
        span('2026-08-28', '2026-08-28', true),
      ])
  })

  it('still merges with a break that agrees about pay', () => {
    expect(strokeOffDays([span('2026-08-26', '2026-08-26', true)], '2026-08-27', '2026-08-28', true, true))
      .toEqual([span('2026-08-26', '2026-08-28', true)])
  })

  it('paints paid when asked', () => {
    expect(strokeOffDays([], '2026-08-26', '2026-08-27', true, true))
      .toEqual([span('2026-08-26', '2026-08-27', true)])
  })
})

describe('strokeOffDays — erasing', () => {
  it('rubs out a whole break', () => {
    expect(strokeOffDays([span('2026-08-26')], '2026-08-26', '2026-08-26', false, false)).toEqual([])
  })

  it('cuts a break in two when the stroke lands in the middle', () => {
    expect(strokeOffDays([span('2026-08-24', '2026-08-28', true)], '2026-08-26', '2026-08-26', false, false))
      .toEqual([span('2026-08-24', '2026-08-25', true), span('2026-08-27', '2026-08-28', true)])
  })

  it('trims an end and keeps the rest', () => {
    expect(strokeOffDays([span('2026-08-24', '2026-08-28')], '2026-08-27', '2026-08-30', false, false))
      .toEqual([span('2026-08-24', '2026-08-26')])
  })

  it('leaves breaks the stroke misses', () => {
    const before = [span('2026-08-24'), span('2026-08-28')]
    expect(strokeOffDays(before, '2026-08-26', '2026-08-26', false, false)).toEqual(before)
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
  const rows = (spans: OffSpan[]) =>
    spans.map((b) => ({ off_date: b.from, end_date: b.to, instructors_paid: b.paid }))

  it('an unpaid stroke takes instructor days off', () => {
    const after = strokeOffDays([], '2026-08-26', '2026-08-27', true, false)
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(after)))
      .toEqual({ days: 5, calendarDays: 7 })
  })

  it('a paid stroke holds them, and the calendar span never moves', () => {
    const after = strokeOffDays([], '2026-08-26', '2026-08-27', true, true)
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(after)))
      .toEqual({ days: 7, calendarDays: 7 })
  })

  it('a stroke beside an unpaid break leaves that day off the count', () => {
    // The gesture that costs money is the one aimed at the days around the
    // exception, not at the exception itself: painting the 27th and 28th must
    // not put the 26th's pay back. One instructor day stays off, and the chip
    // is the only thing that puts it back.
    const after = strokeOffDays(
      [{ from: '2026-08-26', to: '2026-08-26', paid: false }],
      '2026-08-26', '2026-08-28', true, true
    )
    expect(after).toEqual([
      { from: '2026-08-26', to: '2026-08-26', paid: false },
      { from: '2026-08-27', to: '2026-08-28', paid: true },
    ])
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(after)).days).toBe(6)
  })

  it('erasing a break gives the days back', () => {
    const painted = strokeOffDays([], '2026-08-26', '2026-08-27', true, false)
    const erased = strokeOffDays(painted, '2026-08-26', '2026-08-27', false, false)
    expect(erased).toEqual([])
    expect(courseDayCounts('2026-08-24', '2026-08-30', rows(erased)).days).toBe(7)
  })

  it('a window pulled in past a break gives its days back too', () => {
    const painted = strokeOffDays([], '2026-08-26', '2026-08-27', true, false)
    const kept = clampOffDays(painted, '2026-08-24', '2026-08-26')
    expect(kept).toEqual([])
    expect(courseDayCounts('2026-08-24', '2026-08-26', rows(kept)))
      .toEqual({ days: 3, calendarDays: 3 })
  })
})
