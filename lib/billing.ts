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
  /** Set when one of us recorded a milestone rather than the biller marking
      it on her own page. Kept apart from the biller's own hand, because "we
      were told it is invoiced" and "Harken says it is invoiced" are not the
      same claim. */
  invoiced_by_admin: string | null
  paid_by_admin: string | null
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

/** Which billers a handoff is mailed to.
 
    Nobody chosen means everybody active — which is what a single biller has
    always meant, and what a course sent before this control existed meant
    too. An id that no longer names an active biller is dropped rather than
    failing the send: a screen left open across a deactivation should not lose
    the request, it should just stop mailing somebody who is gone.
 
    The queue is shared whatever this says. It is a list of what Harken has to
    do, not a per-person inbox, so this decides who is told. */
export function chooseRecipients<T extends { id: string }>(active: T[], ids?: string[] | null): T[] {
  if (!ids || ids.length === 0) return active
  const chosen = active.filter((r) => ids.includes(r.id))
  return chosen.length > 0 ? chosen : []
}

// ─── The number, as far along the chain as it has got ────────────────────────
//
// One chain runs the length of a course's money: the estimate prices it, the
// quote is offered from the estimate, the handoff is offered from the quote,
// and what we billed is offered from the handoff. Each step can be overridden
// at its own step, and each reads the step before it.
//
// Which breaks the moment a step is skipped, and steps get skipped all the
// time — a course booked against a PO with no quote, a course handed to
// Harken before anybody typed an estimate. A link that reads only the step
// immediately above it then finds nothing and offers nothing, which leaves
// somebody retyping a number the page is already holding one row up.
//
// So each step falls through the whole chain above it and takes the furthest
// one down that exists. What makes that safe rather than sloppy is that the
// answer always says out loud where it came from: an estimate offered as
// "what we billed" would be a lie if it arrived as a bare figure, and is
// merely a starting point when it arrives saying "COA 1 prices this at".

export type ChainLink = { total: number; text: string }

export function numberSoFar(input: {
  /** Requests sent to Harken and not withdrawn. Two invoices are two
      invoices, so these add. */
  billed?: { total: number; count: number } | null
  quote?: { seq: number; total: number; status: string } | null
  estimate?: { title: string; total: number } | null
}): ChainLink | null {
  const { billed, quote, estimate } = input
  if (billed && billed.count > 0) {
    return {
      total: billed.total,
      text:
        billed.count === 1
          ? 'Harken was asked to invoice'
          : `${billed.count} invoices went to Harken totalling`,
    }
  }
  if (quote && quote.total > 0) {
    const phrase =
      quote.status === 'accepted'
        ? 'was accepted at'
        : quote.status === 'sent'
          ? 'was sent at'
          : 'is a draft at'
    return { total: quote.total, text: `Quote ${quote.seq} ${phrase}` }
  }
  // The estimate is a price nobody outside this building has ever seen, so it
  // is named rather than presented as an agreed figure.
  if (estimate && estimate.total > 0) {
    return { total: estimate.total, text: `${estimate.title} prices this at` }
  }
  return null
}

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
