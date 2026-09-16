// The handoff to Harken: what to bill, who to bill, and what came back.
//
// Shared between the three screens that touch it — the biller's tokenized
// queue, the admin history, and the Send button on a course — because all
// three have to agree on what "open" means and what each status is called.

export type InvoiceStatus = 'pending' | 'sent' | 'invoiced' | 'paid' | 'cancelled'

export type InvoiceRequest = {
  id: string
  instance_id: string
  quote_id: string | null
  /** As the client knows it: "PR-0042-Q2". Copied in at send. */
  quote_number: string | null
  amount: number
  description: string | null
  bill_to_org: string | null
  bill_to_name: string | null
  bill_to_email: string | null
  bill_to_phone: string | null
  bill_to_note: string | null
  status: InvoiceStatus
  sent_at: string | null
  invoiced_at: string | null
  invoice_number: string | null
  paid_at: string | null
  amount_received: number | null
  biller_note: string | null
  admin_note: string | null
  created_at: string
}

export type BillingRecipient = {
  id: string
  name: string
  email: string
  org: string
  token: string
  active: boolean
  notes: string | null
}

// Said from our side. The biller's page says them from hers ("to raise",
// "raised", "paid"), because "sent" is not a state of anything she does.
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: 'Not sent',
  sent: 'With Harken',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

// Still owed an action by somebody. `pending` is ours to act on and the rest
// of these are Harken's, which is exactly why the biller's queue filters on
// its own subset rather than reusing this one.
export const OPEN_STATUSES: InvoiceStatus[] = ['pending', 'sent', 'invoiced']

// What lands in the biller's queue: sent to her and not yet finished. A
// `pending` request has not been checked by us, and showing it to her would be
// asking her to bill against a number nobody has approved.
export const BILLER_QUEUE_STATUSES: InvoiceStatus[] = ['sent', 'invoiced']

export const isOpen = (r: { status: InvoiceStatus }) => OPEN_STATUSES.includes(r.status)

// The course in the words a biller needs, so a row reads without a lookup.
// Built once at send and stored, never re-derived: the request is a record of
// what Harken was told, and a course renamed in March must not rewrite what
// went out in January.
export function describeForBiller(input: {
  refNumber: number
  courseName: string
  clientName: string | null
  startsAt: string | null
  endsAt: string | null
}): string {
  const ref = `PR-${String(input.refNumber).padStart(4, '0')}`
  const dates = input.startsAt
    ? input.endsAt && input.endsAt !== input.startsAt
      ? `${input.startsAt} – ${input.endsAt}`
      : input.startsAt
    : null
  return [ref, input.courseName, input.clientName, dates].filter(Boolean).join(' · ')
}

// Money a person typed. Anything unparseable is "they did not answer", which
// is not the same as zero — a zero payment is a fact someone could mean.
export function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}
