import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

// Moving somebody between seats is a change to what their week pays — 219 made
// the seat the wage — so every path that can do it has to say so. There were
// three, and only the obvious one did.
//
// A source test rather than a behavioural one, deliberately: what this is
// guarding is not what the notifier says but that nobody adds a fourth way to
// write `role` and forgets to call it. That mistake is invisible at runtime —
// the wage changes, the person is simply never told — so it has to be caught
// where it is made.
const ACTIONS = fs.readFileSync('app/admin/courses/actions.ts', 'utf8')
const STAFFING = fs.readFileSync('app/admin/courses/staffing-actions.ts', 'utf8')
const IMPORT = fs.readFileSync('app/admin/courses/import/actions.ts', 'utf8')

/** Every server file that writes instance_instructors, and whether it is a path
    an already-assigned person can be moved through. */
const WRITERS = [
  { file: 'app/admin/courses/actions.ts', src: ACTIONS, canMove: true },
  { file: 'app/admin/courses/staffing-actions.ts', src: STAFFING, canMove: true },
  // A course being imported has no crew until this runs, so there is no seat to
  // be moved out of and nobody to tell.
  { file: 'app/admin/courses/import/actions.ts', src: IMPORT, canMove: false },
]

describe('a wage change is never silent', () => {
  it('has a writer for every path we know about', () => {
    for (const w of WRITERS) {
      expect(w.src, `${w.file} no longer writes instance_instructors`).toContain('instance_instructors')
    }
  })

  // The two upserts are the subtle ones: neither reads as a role change at the
  // call site. "Assign" and "add a guest" both overwrite the seat of somebody
  // already on the course.
  it('notifies from every path an assigned person can be moved through', () => {
    for (const w of WRITERS.filter((x) => x.canMove)) {
      expect(w.src, `${w.file} can change a seat without notifying`).toContain('notifyRoleChange')
    }
  })

  it('reads the old seat before overwriting it, or it has nothing to compare', () => {
    // Each mover has to select `role` back out before it writes, or "did this
    // change" is unanswerable and the notice cannot fire.
    expect(ACTIONS).toContain("select('id, role')")
    expect(STAFFING).toContain("select('role')")
  })

  // Only on a real change. Re-saving the same seat is not news, and an email
  // that arrives when nothing happened is how the ones that matter get filtered.
  it('only fires when the seat actually changed', () => {
    for (const src of [ACTIONS, STAFFING]) {
      expect(src).toMatch(/wasRole !== null && wasRole !== |was !== null && was !== /)
    }
  })

  // The letter has to name the money, or it is the same silence in a longer
  // sentence — and must not name it for somebody whose course days are not paid
  // on top of anything else.
  it('quotes the rate, and not to people with no day pay', () => {
    const notify = fs.readFileSync('lib/course-notify.ts', 'utf8')
    expect(notify).toContain('an hour in the field')
    expect(notify).toContain('paid_for_days')
    // A rate typed for them on this course beats the seat's standing one, the
    // same precedence the actuals bill on.
    expect(notify).toContain('course_pay_rates')
  })
})
