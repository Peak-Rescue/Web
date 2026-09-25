import { describe, it, expect } from 'vitest'
import { buildScheduleIcs, type FeedCourse } from '@/lib/schedule-feed'

const NOW = new Date('2026-09-24T17:00:00.000Z')

const course = (over: Partial<FeedCourse> = {}): FeedCourse => ({
  id: '11111111-1111-1111-1111-111111111111',
  course_type: 'rope-access',
  custom_title: null,
  location: 'Casper, WY',
  status: 'confirmed',
  starts_at: '2026-10-05',
  ends_at: '2026-10-09',
  off_days: [],
  ...over,
})

const ics = (courses: FeedCourse[]) =>
  buildScheduleIcs(courses, { calendarName: 'Nadav Oakes — Peak Rescue', now: NOW })

describe('buildScheduleIcs', () => {
  it('writes one all-day event with an exclusive end date', () => {
    const out = ics([course()])
    expect(out).toContain('DTSTART;VALUE=DATE:20261005')
    // The course's last day is the 9th, so the calendar's end is the 10th.
    expect(out).toContain('DTEND;VALUE=DATE:20261010')
    expect(out.split('BEGIN:VEVENT').length - 1).toBe(1)
  })

  it('says the course and the town and nothing else about the client', () => {
    const out = ics([course({ location: 'Moab, UT' })])
    expect(out).toContain('LOCATION:Moab\\, UT')
    expect(out).not.toMatch(/DESCRIPTION/)
    expect(out).not.toMatch(/ATTENDEE|ORGANIZER/)
  })

  it('breaks at off days, because those are two trips not one', () => {
    const out = ics([course({ off_days: [{ off_date: '2026-10-07' }] })])
    expect(out.split('BEGIN:VEVENT').length - 1).toBe(2)
    expect(out).toContain('DTEND;VALUE=DATE:20261007') // first block ends the 6th
    expect(out).toContain('DTSTART;VALUE=DATE:20261008')
  })

  it('follows the person’s own days when their week is not the course’s', () => {
    const out = ics([course({ own_starts_at: '2026-10-06', own_ends_at: '2026-10-08' })])
    expect(out).toContain('DTSTART;VALUE=DATE:20261006')
    expect(out).toContain('DTEND;VALUE=DATE:20261009')
  })

  it('falls back to the course when their own dates are inside out', () => {
    const out = ics([course({ own_starts_at: '2026-10-08', own_ends_at: '2026-10-06' })])
    expect(out).toContain('DTSTART;VALUE=DATE:20261005')
    expect(out).toContain('DTEND;VALUE=DATE:20261010')
  })

  it('marks an unconfirmed course tentative and drops a cancelled one', () => {
    expect(ics([course({ status: 'quoted' })])).toContain('STATUS:TENTATIVE')
    expect(ics([course({ status: 'tentative' })])).toMatch(/SUMMARY:.*\(tentative\)/)
    expect(ics([course({ status: 'cancelled' })])).not.toContain('BEGIN:VEVENT')
    expect(ics([course({ starts_at: null })])).not.toContain('BEGIN:VEVENT')
  })

  it('keeps a stable UID per block so a moved course updates in place', () => {
    const before = ics([course()])
    const after = ics([course({ starts_at: '2026-10-12', ends_at: '2026-10-16' })])
    const uid = (s: string) => s.match(/^UID:.*$/m)![0]
    expect(uid(before)).toBe(uid(after))
  })

  it('folds long lines on octets without splitting a character', () => {
    const out = ics([
      course({ course_type: 'custom', custom_title: 'Confined Space — ' + 'é'.repeat(80) }),
    ])
    for (const line of out.split('\r\n')) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(76)
    }
    // Unfolding puts it back together byte for byte.
    expect(out.replace(/\r\n /g, '')).toContain('é'.repeat(80))
  })
})
