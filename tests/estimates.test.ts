import { describe, it, expect } from 'vitest'
import { coaPrice, DEFAULT_MARGIN, dayCountFollowsCourse, daysForLine, factorValue } from '@/lib/estimates'

// The number three places had to agree on. A test so they cannot drift apart
// again quietly — the column default is checked by hand, this checks the code.
describe('default margin', () => {
  it('is 30%', () => {
    expect(DEFAULT_MARGIN).toBe(0.3)
  })

  it('is what a COA with no margin of its own prices at', () => {
    expect(coaPrice({ margin: null, price_override: null, items: [{ qty: 2, rate: 100 }] }))
      .toBe(260)
  })

  it('never overrides a margin the COA carries', () => {
    expect(coaPrice({ margin: 0.25, price_override: null, items: [{ qty: 2, rate: 100 }] }))
      .toBe(250)
  })

  it('is ignored entirely when a price was set by hand', () => {
    expect(coaPrice({ margin: null, price_override: 500, items: [{ qty: 2, rate: 100 }] }))
      .toBe(500)
  })
})

// The rental vehicle is picked up the day before the course and dropped off
// the day after, and the lodging covers the same nights — which is why the two
// are almost always the same number, and why neither is a judgment call.
describe('day counts that follow the course', () => {
  const straightThrough = { days: 5, calendarDays: 5 }

  it('gives the vehicle and the lodging the same number of days', () => {
    expect(daysForLine('Rental vehicle', straightThrough)).toBe(7)
    expect(daysForLine('Lodging', straightThrough)).toBe(7)
  })

  // Two working weeks with the weekend marked off: five days worked either
  // side, twelve on the calendar. Nobody returns the truck on Friday and
  // rents another one on Monday, so the vehicle is held for all twelve plus a
  // day at each end — while the instructors are paid for the ten they work.
  it('keeps the vehicle over a break the instructors are not paid for', () => {
    const weekendOff = { days: 10, calendarDays: 12 }
    expect(daysForLine('Rental vehicle', weekendOff)).toBe(14)
    expect(daysForLine('Lodging', weekendOff)).toBe(14)
    expect(daysForLine('Instructor day rate', weekendOff)).toBe(10)
  })

  it('follows the course for the costs read off the calendar', () => {
    for (const label of ['Rental vehicle', 'Lodging', 'Hotel', 'Meals', 'Fuel']) {
      expect(dayCountFollowsCourse(label)).toBe(true)
    }
  })

  // A venue held for eight days on a five-day course is a decision somebody
  // made, not a stale copy of the course's length.
  it('leaves the judgment lines to the estimator', () => {
    expect(dayCountFollowsCourse('Venue fee')).toBe(false)
    expect(dayCountFollowsCourse('Admin days')).toBe(false)
    expect(dayCountFollowsCourse('Instructor day rate')).toBe(false)
  })

  // Travel is out and back whatever the course's length, and admin burden is
  // priced by feel — the course cannot answer either, so it does not try.
  it('has no answer at all for travel or admin days', () => {
    const counts = { instructors: 2, students: 8, days: 10, calendarDays: 12 }
    expect(factorValue('days', 'Travel days', counts)).toBeNull()
    expect(factorValue('days', 'Admin time', counts)).toBeNull()
    expect(factorValue('days', 'Rental vehicle', counts)).toBe(14)
    expect(factorValue('days', 'Instructor day rate', counts)).toBe(10)
  })
})
