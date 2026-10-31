// Breaking one gear order into several, each under a spending cap.
//
// A team's purchasing can often only sign off so much on one order. The rule on
// top of the cap is that a brand stays together where it can, because each order
// tends to go to one supplier. So brands are placed whole, biggest first, in the
// first part with room. A brand too big for any one part has to spread, and
// within it a line only breaks across parts if that line alone is over the cap.
//
// A plan, not a write: the same function draws the preview and makes the orders.
// Money is in whole cents throughout, so a cap of $1,000.00 is exactly that.

import type { GearOrderSize } from '@/lib/gear-orders'

export type SplitLine = {
  id: string
  name: string
  brand: string | null
  qty: number | null
  unit_price: number | null
  removed: boolean
  sizes?: GearOrderSize[] | null
}

export type SplitPiece = { lineId: string; qty: number; sizes: GearOrderSize[]; cents: number }
export type SplitPart = {
  pieces: SplitPiece[]
  cents: number
  /** One unit costs more than the cap, so this part cannot be under it. */
  overCap: boolean
}
export type SplitPlan = {
  parts: SplitPart[]
  /** Wanted, with no price. A cap can't be kept against an unknown number. */
  unpriced: string[]
  /** Nothing asked for yet, so not on any part. */
  leftOut: string[]
}

// A quantity to plan with: the line's own, or the stand-in given for lines nobody
// has answered yet, which is how "what if twelve of everything" gets split
// before anyone has picked a size.
export function planQty(qty: number | null | undefined, fill: number | null | undefined): number | null {
  if (Number(qty ?? 0) > 0) return Number(qty)
  return Number(fill ?? 0) > 0 ? Number(fill) : (qty ?? null)
}

const toCents = (dollars: number) => Math.round(dollars * 100)

// Takes units off the front of a size list, leaving the rest for the next part.
function takeSizes(left: GearOrderSize[], qty: number): GearOrderSize[] {
  const out: GearOrderSize[] = []
  let need = qty
  while (need > 0 && left.length > 0) {
    const take = Math.min(left[0].qty, need)
    out.push({ size: left[0].size, qty: take })
    left[0] = { ...left[0], qty: left[0].qty - take }
    if (left[0].qty <= 0) left.shift()
    need -= take
  }
  return out
}

export function planSplit(lines: SplitLine[], capDollars: number): SplitPlan {
  const live = lines.filter((l) => !l.removed)
  const wanted = live.filter((l) => Number(l.qty ?? 0) > 0)
  const leftOut = live.filter((l) => !(Number(l.qty ?? 0) > 0)).map((l) => l.name)
  const unpriced = wanted.filter((l) => l.unit_price == null).map((l) => l.name)
  const cap = toCents(capDollars)
  if (!(cap > 0) || unpriced.length > 0) return { parts: [], unpriced, leftOut }

  type Item = { line: SplitLine; unit: number; qty: number; cents: number }
  const items: Item[] = wanted.map((line) => {
    const unit = toCents(Number(line.unit_price))
    const qty = Number(line.qty)
    return { line, unit, qty, cents: Math.round(unit * qty) }
  })

  // A line with no brand has nothing to stay together with.
  const byBrand = new Map<string, Item[]>()
  for (const it of items) {
    const key = it.line.brand?.trim().toLowerCase() || `no-brand:${it.line.id}`
    byBrand.set(key, [...(byBrand.get(key) ?? []), it])
  }
  const sum = (g: Item[]) => g.reduce((s, i) => s + i.cents, 0)
  const biggestFirst = (a: Item, b: Item) => b.cents - a.cents
  const groups = [...byBrand.values()].sort((a, b) => sum(b) - sum(a))

  const parts: SplitPart[] = []
  const put = (part: SplitPart, it: Item, qty: number, sizes: GearOrderSize[]) => {
    const cents = Math.round(it.unit * qty)
    part.pieces.push({ lineId: it.line.id, qty, sizes, cents })
    part.cents += cents
  }
  const open = () => {
    const part: SplitPart = { pieces: [], cents: 0, overCap: false }
    parts.push(part)
    return part
  }

  // Too big for one part: those go first, while there is the most room, and
  // spread across as few parts as they can.
  for (const group of groups.filter((g) => sum(g) > cap)) {
    for (const it of [...group].sort(biggestFirst)) {
      const sizes = [...(it.line.sizes ?? [])]
      if (it.cents <= cap) {
        const last = parts[parts.length - 1]
        const home = last && last.cents + it.cents <= cap ? last : open()
        put(home, it, it.qty, sizes)
        continue
      }
      let left = it.qty
      while (left > 0) {
        if (it.unit > cap) {
          const part = open()
          part.overCap = true
          const qty = Math.min(1, left)
          put(part, it, qty, takeSizes(sizes, qty))
          left -= qty
          continue
        }
        const last = parts[parts.length - 1]
        const fits = last ? Math.floor((cap - last.cents) / it.unit) : 0
        const home = fits > 0 ? last : open()
        const qty = Math.min(fits > 0 ? fits : Math.floor(cap / it.unit), left)
        put(home, it, qty, takeSizes(sizes, qty))
        left -= qty
      }
    }
  }

  // Everything else fits whole somewhere: first part with room, or a new one.
  for (const group of groups.filter((g) => sum(g) <= cap)) {
    const total = sum(group)
    const home = parts.find((p) => !p.overCap && p.cents + total <= cap) ?? open()
    for (const it of [...group].sort(biggestFirst)) put(home, it, it.qty, [...(it.line.sizes ?? [])])
  }

  // Back in the order of the list, so a part reads like the list it came from.
  const order = new Map(lines.map((l, i) => [l.id, i]))
  for (const p of parts) p.pieces.sort((a, b) => (order.get(a.lineId) ?? 0) - (order.get(b.lineId) ?? 0))
  return { parts, unpriced, leftOut }
}
