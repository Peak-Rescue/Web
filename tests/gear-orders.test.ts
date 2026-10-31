import { describe, expect, it } from 'vitest'
import { orderTotal, safeLink } from '@/lib/gear-orders'

describe('orderTotal', () => {
  it('adds up the lines still wanted', () => {
    expect(orderTotal([
      { qty: 2, removed: false, unit_price: 59 },
      { qty: 1, removed: false, unit_price: 449.5 },
    ])).toEqual({ total: 567.5, unpriced: 0, anyPriced: true })
  })

  it('leaves out struck-off lines and lines nobody asked for', () => {
    const { total, unpriced } = orderTotal([
      { qty: 2, removed: true, unit_price: 100 },
      { qty: 0, removed: false, unit_price: 100 },
      { qty: null, removed: false, unit_price: null },
      { qty: 1, removed: false, unit_price: 10 },
    ])
    expect(total).toBe(10)
    expect(unpriced).toBe(0)
  })

  it('counts a wanted line with no price rather than skipping it quietly', () => {
    const { total, unpriced } = orderTotal([
      { qty: 6, removed: false, unit_price: null },
      { qty: 1, removed: false, unit_price: 10 },
    ])
    expect(total).toBe(10)
    expect(unpriced).toBe(1)
  })

  it('does not drift on cents', () => {
    expect(orderTotal([{ qty: 3, removed: false, unit_price: 19.99 }]).total).toBe(59.97)
  })

  it('says when nothing is priced, so a course order shows no $0.00', () => {
    expect(orderTotal([{ qty: 3, removed: false }]).anyPriced).toBe(false)
  })
})

describe('safeLink', () => {
  it('keeps web addresses', () => {
    expect(safeLink(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
  })

  it('refuses anything a client page should not make clickable', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('example.com')).toBeNull()
    expect(safeLink('')).toBeNull()
    expect(safeLink(null)).toBeNull()
  })
})
