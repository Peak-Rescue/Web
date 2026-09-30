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

// ─── Who is double-booked, and where the question gets asked ─────────────────
// A course had to move its dates, and the new dates put the same instructor on
// two courses at once. Nothing caught it: the overlap rule above was only ever
// run inside the staffing panel's loader, so a clash existed while somebody had
// that panel open and not otherwise — and whoever moves dates is not on the
// staffing screen. These pin the rule now that three places ask it.

import { busyDuring, clashesFor, clashesAcross, clashSentence, canClash, asClashCourse } from '@/lib/staffing-conflicts'

const course = (
  over: Partial<Parameters<typeof clashesFor>[0]> = {}
): Parameters<typeof clashesFor>[0] => ({
  id: 'a',
  label: 'Jungle Mobility · MARSOC (PR-0001)',
  status: 'confirmed',
  starts_at: '2026-03-02',
  ends_at: '2026-03-06',
  offDays: [],
  crew: [{ instructor_id: 'eric' }],
  ...over,
})

describe('clashes on one course', () => {
  it('finds the crew who are on another course the same days', () => {
    const moved = course()
    const other = course({ id: 'b', label: 'SPRAT · Acme (PR-0002)', starts_at: '2026-03-05', ends_at: '2026-03-09' })
    expect(clashesFor(moved, [other])).toEqual({
      eric: [{ course: 'SPRAT · Acme (PR-0002)', days: 'Mar 5–6' }],
    })
  })

  // The exact shape of the situation: the dates were fine, then they moved.
  it('is clean before the move and dirty after it', () => {
    const other = course({ id: 'b', label: 'SPRAT · Acme (PR-0002)', starts_at: '2026-03-16', ends_at: '2026-03-20' })
    expect(clashesFor(course(), [other])).toEqual({})
    const moved = course({ starts_at: '2026-03-16', ends_at: '2026-03-20' })
    expect(Object.keys(clashesFor(moved, [other]))).toEqual(['eric'])
  })

  it('ignores a course that shares dates but nobody', () => {
    const other = course({ id: 'b', crew: [{ instructor_id: 'toph' }], starts_at: '2026-03-05' })
    expect(clashesFor(course(), [other])).toEqual({})
  })

  // A break is days the course stops holding, so painting one can clear a clash
  // — which is why the date painter reports after a break stroke as well.
  it('clears when a break is painted over the overlapping days', () => {
    const other = course({ id: 'b', label: 'SPRAT (PR-0002)', starts_at: '2026-03-05', ends_at: '2026-03-06' })
    const withBreak = course({ offDays: [{ off_date: '2026-03-05', end_date: '2026-03-06' }] })
    expect(clashesFor(withBreak, [other])).toEqual({})
  })

  it('never clashes with a cancelled course, or while unscheduled', () => {
    const cancelled = course({ id: 'b', status: 'cancelled', starts_at: '2026-03-05' })
    expect(clashesFor(course(), [cancelled])).toEqual({})
    expect(clashesFor(course({ starts_at: null }), [course({ id: 'b', starts_at: '2026-03-05' })])).toEqual({})
    expect(canClash({ status: 'cancelled', starts_at: '2026-03-02' })).toBe(false)
    expect(canClash({ status: 'confirmed', starts_at: null })).toBe(false)
  })

  it('never reports a course clashing with itself', () => {
    expect(clashesFor(course(), [course()])).toEqual({})
  })

  it('lists both courses when somebody is triple-booked', () => {
    const b = course({ id: 'b', label: 'B (PR-0002)', starts_at: '2026-03-04' })
    const c = course({ id: 'c', label: 'C (PR-0003)', starts_at: '2026-03-06' })
    expect(clashesFor(course(), [b, c]).eric).toHaveLength(2)
  })
})

// The staffing panel asks a different question: who is busy on these days, so it
// can warn *before* somebody is assigned. Not narrowed to this course's crew.
describe('who is busy on these days', () => {
  it('reports people who are not on this course at all', () => {
    const other = course({ id: 'b', label: 'B (PR-0002)', crew: [{ instructor_id: 'toph' }], starts_at: '2026-03-05' })
    const busy = busyDuring({ starts_at: '2026-03-02', ends_at: '2026-03-06', offDays: [] }, [other])
    expect(Object.keys(busy)).toEqual(['toph'])
    // …and the narrowed question says nothing about them, because they are not
    // a mistake that has happened.
    expect(clashesFor(course(), [other])).toEqual({})
  })
})

describe('clashes across the whole book', () => {
  it('finds both sides of the same double-booking', () => {
    const a = course({ id: 'a', label: 'A (PR-0001)' })
    const b = course({ id: 'b', label: 'B (PR-0002)', starts_at: '2026-03-05', ends_at: '2026-03-09' })
    const all = clashesAcross([a, b])
    expect(Object.keys(all).sort()).toEqual(['a', 'b'])
    expect(all.a.eric[0].course).toBe('B (PR-0002)')
    expect(all.b.eric[0].course).toBe('A (PR-0001)')
  })

  it('says nothing about a book with no clashes in it', () => {
    const a = course({ id: 'a' })
    const b = course({ id: 'b', starts_at: '2026-04-06', ends_at: '2026-04-10' })
    expect(clashesAcross([a, b])).toEqual({})
  })
})

describe('the sentence a date move shows', () => {
  const names: Record<string, string> = { eric: 'Eric Tolliver', toph: 'Toph Vance', cody: 'Cody Carroll' }
  const nameOf = (id: string) => names[id]

  it('is null when there is nothing to say', () => {
    expect(clashSentence({}, nameOf)).toBeNull()
  })

  it('names the person and the course they are also on', () => {
    expect(clashSentence({ eric: [{ course: 'SPRAT (PR-0002)', days: 'Mar 5–6' }] }, nameOf))
      .toBe('Eric Tolliver is also on SPRAT (PR-0002) (Mar 5–6)')
  })

  // Trimmed rather than truncated mid-list: the count of the rest is more use
  // than a third name and no idea how many followed it.
  it('trims at two and counts the rest', () => {
    const many = {
      eric: [{ course: 'A', days: 'Mar 5' }],
      toph: [{ course: 'B', days: 'Mar 5' }],
      cody: [{ course: 'C', days: 'Mar 5' }],
    }
    expect(clashSentence(many, nameOf)).toContain('and 1 other')
  })

  it('falls back to somebody rather than to a bare id', () => {
    expect(clashSentence({ ghost: [{ course: 'A', days: 'Mar 5' }] }, nameOf)).toMatch(/^Somebody is also on/)
  })
})

// One label, built in one place, so the panel and the date-move notice name the
// same course the same way.
describe('naming a clashing course', () => {
  it('reads type, client and ref', () => {
    expect(asClashCourse({
      ref_number: 42, course_type: 'sprat', custom_title: null, client_name: 'Acme',
      starts_at: '2026-03-02', ends_at: '2026-03-06',
    }).label).toMatch(/· Acme \(PR-0042\)$/)
  })

  it('treats an unstated status as a live course', () => {
    expect(asClashCourse({
      ref_number: 1, course_type: 'sprat', custom_title: null, client_name: null,
      starts_at: '2026-03-02', ends_at: null,
    }).status).not.toBe('cancelled')
  })
})
