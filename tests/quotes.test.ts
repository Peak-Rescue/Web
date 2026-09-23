import { describe, it, expect } from 'vitest'
import { optionAvailable, selectionProblem, type QuoteOption } from '@/lib/quotes'



// Week one of a blended course, with week two offered as an addition. Week two
// carries no travel and no flights — those are in week one — so accepting it
// alone would sell a deployment nobody is flying to.
describe('option dependencies', () => {
  const OPTS: QuoteOption[] = [
    { estimate_id: 'wk1', title: 'Week 1 — Mountain Rescue', total: 31980 },
    { estimate_id: 'wk2', title: 'Week 2 — Mountaineering extension', total: 21976.5, requires: 'wk1' },
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

  it('leaves plain alternatives combinable, as before', () => {
    const alts: QuoteOption[] = [
      { estimate_id: 'a', title: 'Drive team', total: 18400 },
      { estimate_id: 'b', title: 'Fly-in', total: 24100 },
    ]
    expect(selectionProblem(alts, [1])).toBeNull()
    expect(selectionProblem(alts, [0, 1])).toBeNull()
  })

  // A COA can extend one that was set aside before the quote went out. The
  // snapshot then points at nothing on offer, and an addition with no parent to
  // wait for must not be unacceptable.
  it('does not strand an addition whose option is not on the quote', () => {
    const orphan: QuoteOption[] = [{ estimate_id: 'wk2', title: 'Week 2', total: 21976.5, requires: 'gone' }]
    expect(selectionProblem(orphan, [0])).toBeNull()
    expect(optionAvailable(orphan, 0, [])).toBe(true)
  })
})
