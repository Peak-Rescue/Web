import { describe, it, expect } from 'vitest'
import { coaPrice, DEFAULT_MARGIN } from '@/lib/estimates'

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
