import { describe, it, expect } from 'vitest'
import { coaPrice, coaSpan, coaHasOwnSpan, isTripLine, DEFAULT_MARGIN, dayCountFollowsCourse, daysForLine, factorValue, guessSeedQty, wantsSeedLine } from '@/lib/estimates'

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
    const counts = { instructors: 2, students: 8, days: 10, calendarDays: 12, leads: null, assists: null, shadows: null }
    expect(factorValue('days', 'Travel days', counts)).toBeNull()
    expect(factorValue('days', 'Admin time', counts)).toBeNull()
    expect(factorValue('days', 'Rental vehicle', counts)).toBe(14)
    expect(factorValue('days', 'Instructor day rate', counts)).toBe(10)
  })

  // Half an instructor is a real plan for pay and nonsense for a bed: the
  // shadowing instructor who is only there for two days still sleeps in a
  // whole room, sits in a whole seat and is driven out and back once.
  it('pays a fraction of an instructor and houses a whole one', () => {
    const counts = { instructors: 1.5, students: 8, days: 10, calendarDays: 12, leads: null, assists: null, shadows: null }
    expect(factorValue('instructors', 'Instructor field day/s', counts)).toBe(1.5)
    expect(factorValue('instructors', 'Instructor day rate', counts)).toBe(1.5)
    expect(factorValue('instructors', 'Lodging', counts)).toBe(2)
    expect(factorValue('instructors', 'Meals', counts)).toBe(2)
    expect(factorValue('instructors', 'Rental vehicle', counts)).toBe(2)
    expect(factorValue('instructors', 'Instructor travel day/s', counts)).toBe(2)
    expect(factorValue('participants', 'Catering', counts)).toBe(10)
  })

  // Everything but the field day rounds up, including the rates that name none
  // of the words a list of per-head costs would have held. Half an airline
  // ticket is the failure this shape exists to prevent.
  it('rounds up a cost it has never seen before', () => {
    const counts = { instructors: 1.5, students: 8, days: 10, calendarDays: 12, leads: null, assists: null, shadows: null }
    expect(factorValue('instructors', 'Flights', counts)).toBe(2)
    expect(factorValue('instructors', 'Lift tickets', counts)).toBe(2)
    expect(factorValue('instructors', 'SPRAT fees', counts)).toBe(2)
    expect(factorValue('instructors', 'EMT / medical', counts)).toBe(2)
    expect(factorValue('instructors', 'Something nobody has added yet', counts)).toBe(2)
  })

  // A whole crew is a whole crew: the rounding is invisible until somebody
  // types a fraction, which is most courses.
  it('changes nothing for a whole number of instructors', () => {
    const counts = { instructors: 3, students: 8, days: 10, calendarDays: 12, leads: null, assists: null, shadows: null }
    expect(factorValue('instructors', 'Instructor field day/s', counts)).toBe(3)
    expect(factorValue('instructors', 'Flights', counts)).toBe(3)
    expect(factorValue('participants', 'Catering', counts)).toBe(11)
  })
})

// A COA that prices part of the course — the first week of a blended course,
// quoted beside the pair — against the ordinary one that prices all of it.
describe('coaSpan', () => {
  const course = { starts_at: '2027-06-22', ends_at: '2027-07-06' }

  it('follows the course when the COA says nothing', () => {
    expect(coaSpan(null, course)).toEqual(course)
    expect(coaSpan({ starts_at: null, ends_at: null }, course)).toEqual(course)
    expect(coaHasOwnSpan(null)).toBe(false)
    expect(coaHasOwnSpan({ starts_at: null, ends_at: null })).toBe(false)
  })

  it("takes the COA's own window where it has one", () => {
    expect(coaSpan({ starts_at: '2027-06-22', ends_at: '2027-06-29' }, course))
      .toEqual({ starts_at: '2027-06-22', ends_at: '2027-06-29' })
    expect(coaHasOwnSpan({ starts_at: '2027-06-22', ends_at: '2027-06-29' })).toBe(true)
  })

  // Either end stands alone: a COA that starts with the course and stops early
  // only has to say where it stops.
  it('lets one end follow the course while the other does not', () => {
    expect(coaSpan({ ends_at: '2027-06-29' }, course))
      .toEqual({ starts_at: '2027-06-22', ends_at: '2027-06-29' })
    expect(coaSpan({ starts_at: '2027-06-30' }, course))
      .toEqual({ starts_at: '2027-06-30', ends_at: '2027-07-06' })
    expect(coaHasOwnSpan({ ends_at: '2027-06-29' })).toBe(true)
  })

  it('has no dates to offer on a course with none', () => {
    expect(coaSpan(null, { starts_at: null, ends_at: null })).toEqual({ starts_at: null, ends_at: null })
  })
})

// What an addition must not carry: the deployment is already paid for by the
// COA it extends.
describe('isTripLine', () => {
  it('claims getting there and back', () => {
    expect(isTripLine('Instructor travel day/s')).toBe(true)
    expect(isTripLine('Flights')).toBe(true)
    expect(isTripLine('Airfare')).toBe(true)
    expect(isTripLine('Mobilization')).toBe(true)
  })
  it('leaves the costs that scale with the days alone', () => {
    expect(isTripLine('Instructor field day/s')).toBe(false)
    expect(isTripLine('Lodging')).toBe(false)
    expect(isTripLine('Meals')).toBe(false)
    expect(isTripLine('Vehicle rental')).toBe(false)
  })
})

// What "reset this line to the course's numbers" means. The panel's reset
// button and the server's COA seeding both go through guessSeedQty, so a reset
// lands on the number a freshly added line would have carried — and refuses to
// invent one where the course cannot know it.
describe('the auto quantity for a line', () => {
  const counts = { instructors: 2, students: 8, days: 5, calendarDays: 5, leads: null, assists: null, shadows: null }

  it('multiplies a two-dimension rate out and keeps the breakdown', () => {
    expect(guessSeedQty({ label: 'Instructor field day', unit: 'per instructor per day' }, counts))
      .toEqual({ qty: 10, factors: [2, 5] })
  })

  it('gives a single-dimension rate a bare count and no breakdown', () => {
    expect(guessSeedQty({ label: 'Student manual', unit: 'per student' }, counts))
      .toEqual({ qty: 8, factors: null })
  })

  // A reset must not quietly re-price a drive at one mile, so a factor the
  // course cannot supply yields no quantity at all and the line is left as the
  // estimator typed it.
  it('refuses to guess a number only a person can supply', () => {
    expect(guessSeedQty({ label: 'Mileage', unit: 'per mile' }, counts).qty).toBeNull()
    expect(guessSeedQty({ label: 'Admin burden', unit: 'per day' }, counts).qty).toBeNull()
  })

  it('leaves a flat-fee line alone — no unit, nothing to compute', () => {
    expect(guessSeedQty({ label: 'Permit', unit: null }, counts).qty).toBeNull()
  })

  // The vehicle and the lodging are held a day either side of the course, so a
  // reset has to put those days back too.
  it('gives the travelling costs the extra day at each end', () => {
    expect(guessSeedQty({ label: 'Lodging', unit: 'per instructor per night' }, counts))
      .toEqual({ qty: 14, factors: [2, 7] })
  })

  // Asked about a course whose details are half-filled — the panel does this,
  // and the answer is "no number", never zero.
  it('has no answer when the course has no dates yet', () => {
    expect(guessSeedQty({ label: 'Instructor field day', unit: 'per instructor per day' },
      { instructors: 2, students: 8, days: null, calendarDays: null, leads: null, assists: null, shadows: null }).qty).toBeNull()
  })
})

// A lead day and a shadow day are not the same money — $50, $40 and $25 an hour
// — so the estimate stopped quoting one "instructor" line against the head
// count. The seats get their own lines, but only on a course that has said what
// it is made of.
describe('which default lines a course wants', () => {
  const LEAD = { label: 'Lead field day/s', unit: 'per lead per day' }
  const ASSIST = { label: 'Assist field day/s', unit: 'per assist per day' }
  const SHADOW = { label: 'Shadow field day/s', unit: 'per shadow per day' }
  const GENERIC = { label: 'Instructor field day/s', unit: 'per instructor per day' }
  const TRAVEL = { label: 'Instructor travel day/s', unit: 'per instructor per day' }
  const LODGING = { label: 'Lodging', unit: 'per instructor per night' }

  const base = { instructors: 3, students: 8, days: 5, calendarDays: 5 }
  const planned = { ...base, leads: 1, assists: 2, shadows: 0 }
  const unplanned = { ...base, leads: null, assists: null, shadows: null }

  it('quotes a planned course seat by seat, and not on the head count', () => {
    expect(wantsSeedLine(LEAD, planned)).toBe(true)
    expect(wantsSeedLine(ASSIST, planned)).toBe(true)
    expect(wantsSeedLine(GENERIC, planned)).toBe(false)
  })

  // Zero is an answer: planned with no shadow means no shadow line, not a line
  // worth nothing.
  it('drops a seat the plan has none of', () => {
    expect(wantsSeedLine(SHADOW, planned)).toBe(false)
    expect(wantsSeedLine(SHADOW, { ...planned, shadows: 1 })).toBe(true)
  })

  it('falls back to the head count when nobody has broken the crew down', () => {
    expect(wantsSeedLine(GENERIC, unplanned)).toBe(true)
    expect(wantsSeedLine(LEAD, unplanned)).toBe(false)
    expect(wantsSeedLine(ASSIST, unplanned)).toBe(false)
  })

  // A travel day costs the same whoever is in the seat, which is why that rate
  // never split — and it must not be mistaken for the field line and dropped.
  it('leaves travel, lodging and the rest alone either way', () => {
    for (const counts of [planned, unplanned]) {
      expect(wantsSeedLine(TRAVEL, counts)).toBe(true)
      expect(wantsSeedLine(LODGING, counts)).toBe(true)
    }
  })
})

// The whole seeding arithmetic, end to end, on the default lines as they stand.
// Worth pinning as one sum: the per-seat split changes what a client is quoted,
// and "cheaper because two of the four are not leads" is the claim being made.
describe('what a seeded COA comes to', () => {
  const RATES = [
    { label: 'Instructor field day/s', unit: 'per instructor per day', rate: 750 },
    { label: 'Lead field day/s', unit: 'per lead per day', rate: 750 },
    { label: 'Assist field day/s', unit: 'per assist per day', rate: 600 },
    { label: 'Shadow field day/s', unit: 'per shadow per day', rate: 375 },
    { label: 'Instructor travel day/s', unit: 'per instructor per day', rate: 300 },
    { label: 'Lodging', unit: 'per instructor per night', rate: 180 },
    { label: 'Flights', unit: 'per instructor', rate: 800 },
  ]
  const seeded = (counts: Parameters<typeof wantsSeedLine>[1]) =>
    RATES.filter((r) => wantsSeedLine(r, counts)).map((r) => {
      const { qty } = guessSeedQty(r, counts)
      return { label: r.label, qty, amount: (qty ?? 0) * r.rate }
    })
  const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0)
  const base = { students: 8, days: 5, calendarDays: 5, instructors: 4 }

  it('bills a planned crew by seat', () => {
    const rows = seeded({ ...base, leads: 1, assists: 2, shadows: 1 })
    expect(rows.map((r) => r.label)).toEqual([
      'Lead field day/s', 'Assist field day/s', 'Shadow field day/s',
      'Instructor travel day/s', 'Lodging', 'Flights',
    ])
    // 1 lead × 5 days × $750, 2 assists × 5 × $600, 1 shadow × 5 × $375
    expect(rows.find((r) => r.label === 'Lead field day/s')!.amount).toBe(3750)
    expect(rows.find((r) => r.label === 'Assist field day/s')!.amount).toBe(6000)
    expect(rows.find((r) => r.label === 'Shadow field day/s')!.amount).toBe(1875)
  })

  // The same four people on a course nobody broke down are all billed as leads,
  // which is the behaviour this replaces — and it is $3,375 dearer on one week.
  it('is cheaper than billing the same four people at the lead rate', () => {
    const planned = total(seeded({ ...base, leads: 1, assists: 2, shadows: 1 }))
    const flat = total(seeded({ ...base, leads: null, assists: null, shadows: null }))
    expect(flat - planned).toBe(3375)
  })

  // The shared lines do not move: a travel day, a bed and a seat on a plane
  // cost what they cost whoever is in them.
  it('leaves travel, lodging and flights identical either way', () => {
    const pick = (counts: Parameters<typeof wantsSeedLine>[1]) =>
      seeded(counts).filter((r) => !/field day/.test(r.label)).map((r) => [r.label, r.amount])
    expect(pick({ ...base, leads: 1, assists: 2, shadows: 1 }))
      .toEqual(pick({ ...base, leads: null, assists: null, shadows: null }))
  })
})
