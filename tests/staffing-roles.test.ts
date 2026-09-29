import { describe, it, expect } from 'vitest'
import {
  INSTANCE_ROLES,
  roleLabel,
  asInstanceRole,
  crewOrder,
  studentFacingRole,
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
  it('puts whoever is in charge first, over wage', () => {
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

  // Two people in charge is the case this was all built for, and the order
  // between them is then just the wage and the name — no tie-break invented.
  it('handles more than one person in charge', () => {
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
  it('says course director, or just instructor', () => {
    expect(studentFacingRole(true)).toBe('Course director')
    expect(studentFacingRole(false)).toBe('Instructor')
    expect(studentFacingRole(null)).toBe('Instructor')
  })
})
