import { describe, it, expect } from 'vitest'
import { courseZone, todayIn, todayHere, HOME_ZONE } from '@/lib/course-clock'

// Turning "now" into a date is a question about where you are standing, and
// every place that did it was standing on the server — UTC. These are the
// hours where that gave the wrong day to the people using the portal.

describe('courseZone', () => {
  it('reads a US state', () => {
    expect(courseZone('US-CO')).toBe('America/Denver')
    expect(courseZone('US-HI')).toBe('Pacific/Honolulu')
    expect(courseZone('US-AK')).toBe('America/Anchorage')
  })

  it('gives Arizona its own, since it does not move for daylight saving', () => {
    expect(courseZone('US-AZ')).toBe('America/Phoenix')
  })

  it('reads a Canadian province and a bare country', () => {
    expect(courseZone('CA-AB')).toBe('America/Edmonton')
    expect(courseZone('PL')).toBe('Europe/Warsaw')
  })

  it('falls back to the office for a region unset or unrecognised', () => {
    expect(courseZone(null)).toBe(HOME_ZONE)
    expect(courseZone('')).toBe(HOME_ZONE)
    expect(courseZone('XX-ZZ')).toBe(HOME_ZONE)
    expect(courseZone('US-ZZ')).toBe(HOME_ZONE)
  })
})

describe('todayIn', () => {
  // 7pm in the canyon on the 24th of August. UTC has already turned over.
  const canyonEvening = new Date('2026-08-25T01:00:00Z')

  it('is still the 24th in Colorado when UTC says the 25th', () => {
    expect(todayIn('America/Denver', canyonEvening)).toBe('2026-08-24')
    expect(canyonEvening.toISOString().slice(0, 10)).toBe('2026-08-25')
  })

  it('is still the 24th in Hawaii, where it is only mid-afternoon', () => {
    expect(todayIn('Pacific/Honolulu', canyonEvening)).toBe('2026-08-24')
  })

  it('is already the 25th in Warsaw at the same instant', () => {
    expect(todayIn('Europe/Warsaw', canyonEvening)).toBe('2026-08-25')
  })

  it('holds through the winter, when Colorado is an hour further from UTC', () => {
    // 6pm MST on the 15th of January; UTC is into the 16th.
    const winterEvening = new Date('2027-01-16T01:00:00Z')
    expect(todayIn('America/Denver', winterEvening)).toBe('2027-01-15')
    expect(todayIn('America/Phoenix', winterEvening)).toBe('2027-01-15')
  })

  it('pads to yyyy-mm-dd, so it still compares as a string', () => {
    expect(todayIn('America/Denver', new Date('2026-01-02T20:00:00Z'))).toBe('2026-01-02')
  })

  it('falls back to the office rather than throwing on a zone it does not know', () => {
    const t = new Date('2026-08-25T01:00:00Z')
    expect(todayIn('Not/AZone', t)).toBe(todayHere(t))
  })
})

describe('todayHere', () => {
  it('is the office clock', () => {
    const t = new Date('2026-08-25T01:00:00Z')
    expect(todayHere(t)).toBe(todayIn(HOME_ZONE, t))
    expect(todayHere(t)).toBe('2026-08-24')
  })
})
