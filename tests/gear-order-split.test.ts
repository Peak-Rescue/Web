import { describe, expect, it } from 'vitest'
import { planQty, planSplit, type SplitLine } from '@/lib/gear-order-split'

const line = (id: string, brand: string | null, qty: number | null, price: number | null, over: Partial<SplitLine> = {}): SplitLine => ({
  id, name: id, brand, qty, unit_price: price, removed: false, ...over,
})
const ids = (p: { pieces: { lineId: string }[] }) => p.pieces.map((x) => x.lineId)

describe('planQty', () => {
  it('uses the stand-in only where a line has no quantity', () => {
    expect(planQty(3, 12)).toBe(3)
    expect(planQty(null, 12)).toBe(12)
    expect(planQty(0, 12)).toBe(12)
  })

  it('leaves a line alone with no stand-in', () => {
    expect(planQty(null, null)).toBeNull()
    expect(planQty(null, 0)).toBeNull()
  })
})

describe('planSplit', () => {
  it('leaves an order under the cap as one part', () => {
    const { parts } = planSplit([line('a', 'BD', 2, 100), line('b', 'Petzl', 1, 50)], 1000)
    expect(parts).toHaveLength(1)
    expect(parts[0].cents).toBe(25000)
  })

  it('keeps each brand whole when it can', () => {
    const { parts } = planSplit([
      line('bd1', 'Black Diamond', 1, 300), line('p1', 'Petzl', 1, 400),
      line('bd2', 'black diamond', 1, 300), line('p2', 'Petzl', 1, 300),
    ], 700)
    expect(parts).toHaveLength(2)
    expect(parts.map(ids)).toEqual(expect.arrayContaining([['bd1', 'bd2'], ['p1', 'p2']]))
  })

  it('never goes over the cap, and loses nothing', () => {
    const lines = [
      line('a', 'BD', 6, 449.5), line('b', 'BD', 3, 129), line('c', 'Petzl', 4, 59),
      line('d', 'Petzl', 1, 900), line('e', null, 2, 75), line('f', 'Camp', 7, 33.33),
    ]
    const { parts } = planSplit(lines, 1000)
    for (const p of parts) expect(p.cents).toBeLessThanOrEqual(100000)
    for (const l of lines) {
      const got = parts.flatMap((p) => p.pieces).filter((x) => x.lineId === l.id).reduce((s, x) => s + x.qty, 0)
      expect(got).toBe(l.qty)
    }
    const total = lines.reduce((s, l) => s + Math.round(l.unit_price! * 100) * l.qty!, 0)
    expect(parts.reduce((s, p) => s + p.cents, 0)).toBe(total)
  })

  it('spreads a brand too big for one part, keeping lines whole when it can', () => {
    const { parts } = planSplit([line('a', 'BD', 1, 600), line('b', 'BD', 1, 600), line('c', 'BD', 1, 300)], 1000)
    expect(parts).toHaveLength(2)
    expect(parts.flatMap((p) => p.pieces).every((x) => x.qty === 1)).toBe(true)
  })

  it('breaks a line only when it is over the cap by itself, and sizes follow the units', () => {
    const { parts } = planSplit([
      line('a', 'BD', 6, 400, { sizes: [{ size: 'M', qty: 2 }, { size: 'L', qty: 4 }] }),
    ], 1000)
    expect(parts.map((p) => p.pieces[0].qty)).toEqual([2, 2, 2])
    expect(parts.map((p) => p.pieces[0].sizes)).toEqual([
      [{ size: 'M', qty: 2 }], [{ size: 'L', qty: 2 }], [{ size: 'L', qty: 2 }],
    ])
  })

  it('flags a single unit that costs more than the cap', () => {
    const { parts } = planSplit([line('a', 'BD', 2, 1500)], 1000)
    expect(parts).toHaveLength(2)
    expect(parts.every((p) => p.overCap)).toBe(true)
  })

  it('refuses to plan around a price it does not know', () => {
    const plan = planSplit([line('a', 'BD', 2, null), line('b', 'BD', 1, 100)], 1000)
    expect(plan.unpriced).toEqual(['a'])
    expect(plan.parts).toEqual([])
  })

  it('leaves out lines nobody asked for and lines struck off', () => {
    const plan = planSplit([line('a', 'BD', null, 10), line('b', 'BD', 0, 10), line('c', 'BD', 1, 10, { removed: true }), line('d', 'BD', 1, 10)], 1000)
    expect(plan.leftOut).toEqual(['a', 'b'])
    expect(plan.parts[0].pieces.map((p) => p.lineId)).toEqual(['d'])
  })

  it('makes no plan without a real cap', () => {
    expect(planSplit([line('a', 'BD', 1, 10)], 0).parts).toEqual([])
    expect(planSplit([line('a', 'BD', 1, 10)], Number.NaN).parts).toEqual([])
  })
})
