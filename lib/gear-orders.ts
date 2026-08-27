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
}

export type GearOrder = {
  id: string
  instance_id: string
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
  gear_order_lines: GearOrderLine[]
}

export const GEAR_ORDER_STATUS_LABEL: Record<GearOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent — awaiting the client',
  responded: 'Client responded',
  closed: 'Closed',
}

// What purchasing actually buys: the lines still wanted, with the number the
// client asked for. A struck-out line is kept on the record but is not an order.
export function orderedLines(order: Pick<GearOrder, 'gear_order_lines'>): GearOrderLine[] {
  return [...order.gear_order_lines]
    .filter((l) => !l.removed && (l.qty_wanted ?? 0) > 0)
    .sort((a, b) => a.sort_order - b.sort_order)
}
