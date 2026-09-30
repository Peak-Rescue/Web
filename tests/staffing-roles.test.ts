import { describe, it, expect } from 'vitest'
import {
  INSTANCE_ROLES,
  roleLabel,
  asInstanceRole,
  crewOrder,
  studentFacingRole,
  crewPlanTotal,
  crewPlanSummary,
  hasCrewPlan,
  openSeats,
  EMPTY_CREW_PLAN,
  ROLE_BADGE,
  ROLE_TEXT,
  ROLE_SOLID,
  ROLE_MUTED,
  ROLE_DOT,
  roleBadgeClass,
  roleInitial,
} from '@/lib/staffing-roles'

// The split "lead" went through: a wage category, and separately who is running
// the course. Everything here exists because one column used to answer both.
describe('staffing categories', () => {
  it('is three wages, best paid first', () => {
    expect([...INSTANCE_ROLES]).toEqual(['lead', 'assist', 'shadow'])
  })

  it('names each one', () => {
    expect(roleLabel('shadow')).toBe('Shadow')
    expect(roleLabel(null)).toBe('')
  })

  // A value the enum grows before this file hears about it should read as
  // itself, not as a blank chip on a crew row.
  it('shows an unknown category as itself rather than as nothing', () => {
    expect(roleLabel('evaluator')).toBe('evaluator')
  })

  // Assist is the column's own default, and the safe guess in both directions:
  // it neither hands out lead wage nor halves somebody's rate.
  it('falls back to assist, never to lead or shadow', () => {
    expect(asInstanceRole(undefined)).toBe('assist')
    expect(asInstanceRole('nonsense')).toBe('assist')
    expect(asInstanceRole('shadow')).toBe('shadow')
  })
})

describe('crew order', () => {
  const crew = [
    { name: 'Cody', role: 'shadow', in_charge: false },
    { name: 'Eric', role: 'lead', in_charge: false },
    { name: 'Toph', role: 'assist', in_charge: true },
  ]

  // The person answering for the course reads first even when somebody beside
  // them is paid more — the calendar title, the crew meter and the student's
  // roster are all asking "who do I go to", not "who costs most".
  it('puts the primary first, over wage', () => {
    expect([...crew].sort(crewOrder).map((c) => c.name)).toEqual(['Toph', 'Eric', 'Cody'])
  })

  it('falls back to wage, then to name', () => {
    const flat = [
      { name: 'Zoe', role: 'assist' },
      { name: 'Abe', role: 'shadow' },
      { name: 'Mia', role: 'assist' },
    ]
    expect([...flat].sort(crewOrder).map((c) => c.name)).toEqual(['Mia', 'Zoe', 'Abe'])
  })

  // Two primaries is the case this was all built for, and the order
  // between them is then just the wage and the name — no tie-break invented.
  it('handles more than one primary', () => {
    const two = [
      { name: 'Nadav', role: 'lead', in_charge: true },
      { name: 'Toph', role: 'assist', in_charge: true },
      { name: 'Eric', role: 'lead', in_charge: false },
    ]
    expect([...two].sort(crewOrder).map((c) => c.name)).toEqual(['Nadav', 'Toph', 'Eric'])
  })
})

// Wage bands are ours. A student has no use for the difference between an
// assist and a shadow, and "Shadow" beside somebody teaching them would read as
// a warning about the person rather than as a pay band.
describe('what a student is told', () => {
  // "Primary" alone is the crew's shorthand; a student gets the noun with it.
  it('says primary instructor, or just instructor', () => {
    expect(studentFacingRole(true)).toBe('Primary instructor')
    expect(studentFacingRole(false)).toBe('Instructor')
    expect(studentFacingRole(null)).toBe('Instructor')
  })
})

// The crew plan: what the course is planned to run, seat by seat. It exists
// because one head count could not say what the people were there to do, which
// is the first thing somebody asked to work the week wants to know.
describe('the crew plan', () => {
  const plan = { lead: 1, assist: 2, shadow: 1 }

  it('adds up to the head count the estimate quotes for', () => {
    expect(crewPlanTotal(plan)).toBe(4)
  })

  // Empty and zero are different answers, and the difference matters: a course
  // nobody has broken down must not read as a crew of nobody.
  it('has no total at all when nobody has broken the crew down', () => {
    expect(crewPlanTotal(EMPTY_CREW_PLAN)).toBeNull()
    expect(hasCrewPlan(EMPTY_CREW_PLAN)).toBe(false)
    expect(crewPlanTotal({ lead: 0, assist: 0, shadow: 0 })).toBe(0)
    expect(hasCrewPlan({ lead: 0, assist: 0, shadow: 0 })).toBe(true)
  })

  it('says what it is out loud, skipping the seats it does not have', () => {
    expect(crewPlanSummary({ lead: 2, assist: 1, shadow: 0 })).toBe('2 lead · 1 assist')
    expect(crewPlanSummary(EMPTY_CREW_PLAN)).toBe('')
  })

  // Worked out at read time, every time. This is the number an emailed
  // call-out cannot tell the truth about, which is why it is only ever on a
  // page somebody is looking at.
  it('counts what is open against who is on the course now', () => {
    const crew = [{ role: 'lead' }, { role: 'assist' }]
    expect(openSeats(plan, crew)).toEqual([
      { role: 'lead', seats: 1, filled: 1, open: 0 },
      { role: 'assist', seats: 2, filled: 1, open: 1 },
      { role: 'shadow', seats: 1, filled: 0, open: 1 },
    ])
  })

  // Over-staffing a category is real and shows as filled, never as a negative
  // seat somebody could be offered.
  it('never reports a negative open seat', () => {
    const over = openSeats({ lead: 1, assist: 0, shadow: null }, [{ role: 'lead' }, { role: 'lead' }])
    expect(over).toEqual([{ role: 'lead', seats: 1, filled: 2, open: 0 }])
  })
})


// One palette, one definition. These exist because the same three words appear
// on the crew row, the roster card, the dashboard, the call-out, the expertise
// grid and the rate library, and three screens each picking their own blue is
// how a colour stops meaning anything.
describe('the wage band palette', () => {
  it('dresses every band, in every weight', () => {
    for (const r of INSTANCE_ROLES) {
      expect(ROLE_BADGE[r]).toBeTruthy()
      expect(ROLE_TEXT[r]).toBeTruthy()
      expect(ROLE_SOLID[r]).toBeTruthy()
      expect(ROLE_MUTED[r]).toBeTruthy()
      expect(ROLE_DOT[r]).toBeTruthy()
    }
  })

  // Teal is the one colour this palette must not contain: it means primary —
  // the person answering for the course — and a band that borrowed it would put
  // the two facts back together after all the work of pulling them apart.
  it('leaves teal alone, because teal means primary', () => {
    const everything = INSTANCE_ROLES.flatMap((r) => [
      ROLE_BADGE[r], ROLE_TEXT[r], ROLE_SOLID[r], ROLE_MUTED[r], ROLE_DOT[r],
    ]).join(' ')
    expect(everything).not.toMatch(/teal/)
    // Amber is likewise spoken for: it means something needs doing.
    expect(everything).not.toMatch(/amber/)
  })

  it('gives each band its own hue, so two seats never look alike', () => {
    const hue = (c: string) => c.match(/-(violet|sky|zinc|blue|indigo)-/)?.[1]
    const hues = INSTANCE_ROLES.map((r) => hue(ROLE_BADGE[r]))
    expect(new Set(hues).size).toBe(INSTANCE_ROLES.length)
  })

  // A pill is a shape and a colour, and a caller should not be able to get one
  // right and the other wrong.
  it('hands out the whole pill, not just the colour', () => {
    expect(roleBadgeClass('lead')).toContain('rounded')
    expect(roleBadgeClass('lead')).toContain('violet')
    // An unknown role still gets a readable pill rather than a broken one.
    expect(roleBadgeClass('nonsense')).toContain('sky')
  })

  it('initials each band distinctly', () => {
    expect(INSTANCE_ROLES.map(roleInitial)).toEqual(['L', 'A', 'S'])
  })
})
