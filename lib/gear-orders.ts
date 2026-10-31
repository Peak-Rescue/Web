import { productName } from '@/lib/gear'

// A gear order is the client's answer to a gear list: what they actually want
// us to supply, how many, and what they said about it.
//
// It is deliberately not a document. Purchasing gets a PDF, but the PDF is a
// rendering of the current record — the client rings back wanting two fewer
// harnesses and that is an edit, not a second artefact.

export type GearOrderStatus = 'draft' | 'sent' | 'responded' | 'closed'

export type GearOrderSize = { size: string; qty: number }
/** A size being typed: the quantity is still whatever is in the box. */
export type SizeRow = { size: string; qty: string }

export type GearOrderLine = {
  id: string
  entry_id: string | null
  name: string
  detail: string | null
  category: string | null
  qty_offered: string | null
  qty_wanted: number | null
  removed: boolean
  client_note: string | null
  admin_note: string | null
  sort_order: number
  /** Standalone orders only. A course order's reads don't ask for these. */
  gear_item_id?: string | null
  /** The specific product, under `name`, which says what is needed. */
  product?: string | null
  url?: string | null
  unit_price?: number | null
  discount_percent?: number | null
  size_options?: string[]
  sizes?: GearOrderSize[]
  /** Our own mark that the line is finished. The team never sees it. */
  checked?: boolean
  gear_items?: { brand: string | null } | null
}

export type GearOrder = {
  id: string
  /** Null for an order that belongs to no course; then `title` names it. */
  instance_id: string | null
  title?: string | null
  client_id?: string | null
  contact_name?: string | null
  contact_email?: string | null
  split_from?: string | null
  split_cap?: number | null
  discount_percent?: number | null
  list_id: string | null
  es_quote_number: string | null
  status: GearOrderStatus
  accept_token: string
  intro: string | null
  sent_at: string | null
  viewed_at: string | null
  responded_at: string | null
  responded_name: string | null
  responded_title: string | null
  client_note: string | null
  /** Paperwork sent with the order — a quote, a spec sheet, a signed
      agreement. Paths in the private bucket; the client's page signs them. */
  attachments: { path: string; filename: string }[]
  gear_order_lines: GearOrderLine[]
}

export const GEAR_ORDER_STATUS_LABEL: Record<GearOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent — awaiting the client',
  responded: 'Client responded',
  closed: 'Closed',
}

export const GEAR_ORDER_STATUS_STYLE: Record<GearOrderStatus, string> = {
  draft: 'bg-zinc-800 text-zinc-400',
  sent: 'bg-amber-900/40 text-amber-300',
  responded: 'bg-teal-900/40 text-teal-300',
  closed: 'bg-zinc-800 text-zinc-500',
}

// A link goes on a page a client opens, so only a web address gets to be one:
// a catalog row or a pasted value holding anything else renders as nothing.
export function safeLink(url: string | null | undefined): string | null {
  const v = url?.trim()
  return v && /^https?:\/\/\S+$/i.test(v) ? v : null
}

// What this line says that its catalog product doesn't: typed for this deal, or
// typed in the belief the line was already another product. Either way it is
// somebody's work, so it is never dropped without being shown to them. A generic
// item has no link or price of its own, so everything on that line counts.
export function typedOverCatalog(
  line: { url?: string | null; unit_price?: number | null },
  product: { url?: string | null; price?: number | null } | null | undefined
): { url: string | null; price: number | null } {
  const url = safeLink(line.url)
  const price = line.unit_price == null ? null : Number(line.unit_price)
  return {
    url: url && url !== safeLink(product?.url) ? url : null,
    price: price != null && price !== (product?.price == null ? null : Number(product.price)) ? price : null,
  }
}

// How a catalog row reads on a line: what is needed, then which product meets
// it. A generic item has no product yet, and a product with no generic above it
// is the only name it has.
export function lineNames(
  item: { name: string; brand?: string | null },
  parent: { name: string } | null | undefined
): { name: string; product: string | null } {
  const full = productName(item)
  return parent ? { name: parent.name, product: full } : { name: full, product: null }
}

// Who an order goes to: one address or several, split on commas, semicolons or
// spaces, the ways a list arrives when it is pasted out of an email. `bad` is
// reported, so a typo stops the send instead of quietly losing someone.
export function parseEmails(text: string | null | undefined): { good: string[]; bad: string[] } {
  const seen = new Set<string>()
  const good: string[] = []
  const bad: string[] = []
  for (const part of (text ?? '').split(/[\s,;]+/)) {
    if (!part) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) bad.push(part)
    else if (!seen.has(part.toLowerCase())) {
      seen.add(part.toLowerCase())
      good.push(part)
    }
  }
  return { good, bad }
}

// A typed list of sizes: "S, M, L". Comma-separated because a size can hold a
// space ("10.5 wide") and nothing else in this vocabulary needs a comma.
export function parseSizeOptions(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(',')) {
    const size = part.trim().slice(0, 40)
    if (size && !seen.has(size.toLowerCase())) {
      seen.add(size.toLowerCase())
      out.push(size)
    }
  }
  return out.slice(0, 50)
}

// The patterns sizes actually come in. Skis, poles and hardware follow none,
// so those stay typed. Rope is sold by the length: 10 m steps, rarely 5. Some
// footwear comes in half sizes and some doesn't, so the step is asked.
export type SizeScaleId = 'letter' | 'paired' | 'eu' | 'us' | 'mondo' | 'metres'
export const SIZE_SCALES: Record<SizeScaleId, {
  label: string
  values?: readonly string[]
  from: number | string
  to: number | string
  step: number
  steps: readonly number[]
  prefix: string
  suffix: string
}> = {
  letter: { label: 'Letter sizes', values: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'], from: 'S', to: 'XL', step: 1, steps: [1], prefix: '', suffix: '' },
  // Harnesses and packs often straddle two sizes.
  paired: { label: 'Paired sizes', values: ['XS/S', 'S/M', 'M/L', 'L/XL', 'XL/XXL'], from: 'S/M', to: 'L/XL', step: 1, steps: [1], prefix: '', suffix: '' },
  eu: { label: 'Footwear EU', from: 38, to: 47, step: 1, steps: [1, 0.5], prefix: 'EU ', suffix: '' },
  us: { label: 'Footwear US', from: 6, to: 13, step: 1, steps: [1, 0.5], prefix: 'US ', suffix: '' },
  mondo: { label: 'Ski boots, mondo', from: 24.5, to: 30.5, step: 0.5, steps: [0.5, 1], prefix: 'Mondo ', suffix: '' },
  metres: { label: 'Length, metres', from: 30, to: 100, step: 10, steps: [10, 5], prefix: '', suffix: ' m' },
}

// Written out from a range. Backwards still means the same sizes, and a range
// too big for a line stops at what a line can hold.
export function sizeRange(id: SizeScaleId, from: string | number, to: string | number, step: number): string[] {
  const scale = SIZE_SCALES[id]
  if (scale.values) {
    const a = scale.values.indexOf(String(from))
    const b = scale.values.indexOf(String(to))
    if (a < 0 || b < 0) return []
    return scale.values.slice(Math.min(a, b), Math.max(a, b) + 1)
  }
  const a = Number(from)
  const b = Number(to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(step > 0) || String(from) === '' || String(to) === '') return []
  const low = Math.min(a, b)
  const high = Math.max(a, b)
  const out: string[] = []
  // Counted rather than added up, so half sizes never drift off the half.
  for (let i = 0; low + i * step <= high && out.length < 50; i++) {
    out.push(`${scale.prefix}${low + i * step}${scale.suffix}`)
  }
  return out
}

// The scale a range opens on, as a guess at the common case for this gear.
export function defaultScale(item: { category?: string | null; name?: string | null }): SizeScaleId {
  if (/rope|cord/i.test(item.category ?? '') || /\brope\b/i.test(item.name ?? '')) return 'metres'
  if (/ski.?boot/i.test(item.name ?? '')) return 'mondo'
  if (/boot|shoe|footwear/i.test(item.name ?? '')) return 'eu'
  return 'letter'
}

// What gets stored. Empty rows go, and the same size typed twice is one size
// with both numbers on it, so the summary never reads "M × 2, M × 1".
export function cleanSizes(rows: { size: string; qty: number | string }[] | null | undefined): GearOrderSize[] {
  const out: GearOrderSize[] = []
  for (const r of rows ?? []) {
    const size = String(r.size ?? '').trim().slice(0, 40)
    const qty = Math.min(99999, Math.floor(Number(r.qty)))
    if (!size || !(qty > 0)) continue
    const held = out.find((o) => o.size.toLowerCase() === size.toLowerCase())
    if (held) held.qty = Math.min(99999, held.qty + qty)
    else out.push({ size, qty })
  }
  return out.slice(0, 50)
}

// A line that comes in sizes has its quantity worked out from them, so there is
// never a typed number to disagree with the breakdown.
export function isSized(line: { size_options?: string[] | null; sizes?: GearOrderSize[] | null }): boolean {
  return (line.size_options?.length ?? 0) > 0 || (line.sizes?.length ?? 0) > 0
}

export const sizesTotal = (sizes: { qty: number | string }[]): number =>
  sizes.reduce((sum, s) => sum + (Number(s.qty) > 0 ? Math.floor(Number(s.qty)) : 0), 0)

export function sizesSummary(sizes: GearOrderSize[] | null | undefined): string | null {
  return sizes?.length ? sizes.map((s) => `${s.size} × ${s.qty}`).join(', ') : null
}

// The rows to draw: one per known size, then anything answered that the list no
// longer holds, so a number somebody gave never silently stops showing.
export function sizeRows(
  options: string[] | null | undefined,
  sizes: GearOrderSize[] | null | undefined
): SizeRow[] {
  const given = sizes ?? []
  const known = (options ?? []).map((size) => ({
    size,
    qty: String(given.find((s) => s.size.toLowerCase() === size.toLowerCase())?.qty ?? ''),
  }))
  const extra = given
    .filter((s) => !known.some((k) => k.size.toLowerCase() === s.size.toLowerCase()))
    .map((s) => ({ size: s.size, qty: String(s.qty) }))
  return [...known, ...extra]
}

// A line still naming only what is needed. A one-off has no catalog item to
// choose a product under, and a struck-off line needs nothing.
export function needsProduct(line: Pick<GearOrderLine, 'gear_item_id' | 'product' | 'removed'>): boolean {
  return !line.removed && Boolean(line.gear_item_id) && !line.product
}

// What is left to do comes first: lines with no product, then the rest not yet
// checked off, then what is finished. The list's own order within each.
export function workFirst<T extends Parameters<typeof needsProduct>[0] & { sort_order: number; checked?: boolean }>(lines: T[]): T[] {
  const rank = (l: T) => (l.removed ? 3 : l.checked ? 2 : needsProduct(l) ? 0 : 1)
  return [...lines].sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order)
}

// What one unit costs after discounts: the line's, then the order's on top.
// Rounded per unit, so a total is always a whole number of a price someone can
// read, and the budget split and the total can never disagree by a cent.
export function netUnitPrice(
  unitPrice: number,
  linePercent?: number | null,
  orderPercent?: number | null
): number {
  const after = Number(unitPrice) * (1 - Number(linePercent ?? 0) / 100) * (1 - Number(orderPercent ?? 0) / 100)
  return Math.round(after * 100) / 100
}

// The money on the lines still wanted. `unpriced` is reported rather than
// quietly left out, because a total that skips a line reads as the whole cost.
export function orderTotal(
  lines: { qty: number | null; removed: boolean; unit_price?: number | null; discount_percent?: number | null }[],
  orderPercent?: number | null
): { total: number; subtotal: number; saved: number; unpriced: number; anyPriced: boolean } {
  let net = 0
  let gross = 0
  let unpriced = 0
  for (const l of lines) {
    if (l.removed || !(Number(l.qty ?? 0) > 0)) continue
    if (l.unit_price == null) { unpriced++; continue }
    gross += Math.round(Number(l.unit_price) * 100) * Number(l.qty)
    net += Math.round(netUnitPrice(l.unit_price, l.discount_percent, orderPercent) * 100) * Number(l.qty)
  }
  return {
    total: Math.round(net) / 100,
    subtotal: Math.round(gross) / 100,
    saved: Math.round(gross - net) / 100,
    unpriced,
    anyPriced: lines.some((l) => l.unit_price != null),
  }
}

// What purchasing actually buys: the lines still wanted, with the number the
// client asked for. A struck-out line is kept on the record but is not an order.
export function orderedLines(order: Pick<GearOrder, 'gear_order_lines'>): GearOrderLine[] {
  return [...order.gear_order_lines]
    .filter((l) => !l.removed && (l.qty_wanted ?? 0) > 0)
    .sort((a, b) => a.sort_order - b.sort_order)
}
