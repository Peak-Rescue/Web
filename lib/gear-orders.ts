import { productName } from '@/lib/gear'

// A gear order is the client's answer to a gear list: what they actually want
// us to supply, how many, and what they said about it.
//
// It is deliberately not a document. Purchasing gets a PDF, but the PDF is a
// rendering of the current record — the client rings back wanting two fewer
// harnesses and that is an edit, not a second artefact.

export type GearOrderStatus = 'draft' | 'sent' | 'responded' | 'closed'

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
}

export type GearOrder = {
  id: string
  /** Null for an order that belongs to no course; then `title` names it. */
  instance_id: string | null
  title?: string | null
  client_id?: string | null
  contact_name?: string | null
  contact_email?: string | null
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

// The money on the lines still wanted. `unpriced` is reported rather than
// quietly left out, because a total that skips a line reads as the whole cost.
export function orderTotal(
  lines: { qty: number | null; removed: boolean; unit_price?: number | null }[]
): { total: number; unpriced: number; anyPriced: boolean } {
  let cents = 0
  let unpriced = 0
  for (const l of lines) {
    if (l.removed || !(Number(l.qty ?? 0) > 0)) continue
    if (l.unit_price == null) { unpriced++; continue }
    cents += Math.round(Number(l.unit_price) * 100) * Number(l.qty)
  }
  return {
    total: Math.round(cents) / 100,
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
