import { describe, it, expect } from 'vitest'
import { optionAvailable, selectionProblem, type QuoteOption } from '@/lib/quotes'



// Week one of a blended course, with week two offered as an addition. Week two
// carries no travel and no flights — those are in week one — so accepting it
// alone would sell a deployment nobody is flying to.
describe('option dependencies', () => {
  const OPTS: QuoteOption[] = [
    { estimate_id: 'wk1', title: 'Week 1 — Mountain Rescue', total: 31980, relation: 'standalone' },
    { estimate_id: 'wk2', title: 'Week 2 — Mountaineering extension', total: 21976.5, relation: 'addition', requires: 'wk1' },
  ]

  it('takes week one alone, or both', () => {
    expect(selectionProblem(OPTS, [0])).toBeNull()
    expect(selectionProblem(OPTS, [0, 1])).toBeNull()
  })

  it('refuses the addition on its own, and says why', () => {
    expect(selectionProblem(OPTS, [1]))
      .toBe('"Week 2 — Mountaineering extension" is an addition to "Week 1 — Mountain Rescue" and can only be accepted with it.')
  })

  it('offers the addition only once its option is taken', () => {
    expect(optionAvailable(OPTS, 1, [])).toBe(false)
    expect(optionAvailable(OPTS, 1, [0])).toBe(true)
    // An option that stands on its own is always available.
    expect(optionAvailable(OPTS, 0, [])).toBe(true)
  })

  it('still needs something picked', () => {
    expect(selectionProblem(OPTS, [])).toBe('Select at least one option')
  })

  // Week one stands on its own, so it is the course being bought. Two of those
  // is the case below.
  it('takes the course with or without its addition', () => {
    expect(selectionProblem(OPTS, [0])).toBeNull()
    expect(selectionProblem(OPTS, [0, 1])).toBeNull()
  })

  // A COA can extend one that was set aside before the quote went out. The
  // snapshot then points at nothing on offer, and an addition with no parent to
  // wait for must not be unacceptable.
  it('does not strand an addition whose option is not on the quote', () => {
    const orphan: QuoteOption[] = [{ estimate_id: 'wk2', title: 'Week 2', total: 21976.5, relation: 'addition', requires: 'gone' }]
    expect(selectionProblem(orphan, [0])).toBeNull()
    expect(optionAvailable(orphan, 0, [])).toBe(true)
    // But it is still an addition where there is something to add it to.
    const beside: QuoteOption[] = [
      { estimate_id: 'wk1', title: 'Week 1', total: 31980, relation: 'standalone' },
      { estimate_id: 'wk2', title: 'Week 2', total: 21976.5, relation: 'addition', requires: 'gone' },
    ]
    expect(optionAvailable(beside, 1, [])).toBe(false)
    expect(optionAvailable(beside, 1, [0])).toBe(true)
  })
})

// The drive team and the fly-in are one course reached two ways — two COAs that
// each stand on their own, which is what makes them alternatives.
describe('two courses on one quote', () => {
  const WAYS: QuoteOption[] = [
    { estimate_id: 'drive', title: 'Drive team', total: 18400, relation: 'standalone' },
    { estimate_id: 'fly', title: 'Fly-in', total: 24100, relation: 'standalone' },
  ]

  it('takes one', () => {
    expect(selectionProblem(WAYS, [0])).toBeNull()
    expect(selectionProblem(WAYS, [1])).toBeNull()
  })

  it('refuses both — that is two deployments billed as one', () => {
    expect(selectionProblem(WAYS, [0, 1]))
      .toBe('"Drive team" and "Fly-in" are alternatives — please choose one.')
    expect(optionAvailable(WAYS, 1, [0])).toBe(false)
  })
})

// Quotes written before 213 carry no relation at all and were freely
// combinable. They must keep working exactly as they did.
describe('quotes written before relationships existed', () => {
  const OLD: QuoteOption[] = [
    { estimate_id: 'a', title: 'Drive team', total: 18400 },
    { estimate_id: 'b', title: 'Fly-in', total: 24100 },
  ]
  it('still accepts any combination', () => {
    expect(selectionProblem(OLD, [0])).toBeNull()
    expect(selectionProblem(OLD, [0, 1])).toBeNull()
  })
})
