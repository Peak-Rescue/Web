import { type createAdminClient } from '@/lib/supabase/admin'
import { coaPrice } from '@/lib/estimates'
import { round2 } from '@/lib/expenses'
import { billTo, parseContacts } from '@/lib/contacts'
import { courseShortName } from '@/lib/courses'
import { describeForBiller, numberSoFar, type ChainLink, type InvoiceRequest, type InvoiceStatus } from '@/lib/billing'

// The handoff to Harken, worked out once.
//
// Which quote the money chain reads, which COA stands behind it, and how far
// down the chain a course has got are three questions the pricing page has
// always answered inside its own render. They are now asked from two places —
// that page, and the Billing drawer under a row on the courses list — so the
// answers moved here. Two screens quietly disagreeing about which quote counts
// is how a course gets billed twice.

/** How far a course has got with Harken, in one word. */
export type BillingState = 'not-sent' | 'with-harken' | 'invoiced' | 'paid'

/** Where the money chain has reached: the quote it reads, and the COA behind
    that. `pickBillableQuote` and `pickSeedCoa` between them decide both. */
export function billingState(requests: { status: InvoiceStatus }[]): BillingState {
  // A withdrawn request does not count: withdrawing is how we say the ask was
  // a mistake, and a mistake is not a handover.
  const live = requests.filter((r) => r.status !== 'cancelled')
  if (live.length === 0) return 'not-sent'
  if (live.every((r) => r.status === 'paid')) return 'paid'
  return live.some((r) => r.status === 'invoiced') ? 'invoiced' : 'with-harken'
}

/** What the invoiced and billing boxes offer as a number, and what a handoff
 *  stamps as the quote it was billed against.
 *
 *  The last quote the client actually received, and no further back. A course
 *  gets re-quoted because the first answer stopped being true — details
 *  changed, days moved — and the moment Q3 goes out, Q2 is history whether or
 *  not anybody accepted it. Reaching past a live re-quote to the accepted one
 *  behind it is how a client gets invoiced for the course we are no longer
 *  running.
 *
 *  Which is why a sent quote outranks an accepted older one rather than the
 *  other way around. The number arrives saying "Quote 3 was sent at", not
 *  "was accepted at", so nobody mistakes it for an agreed figure — an
 *  unagreed number that names the right course beats an agreed one that
 *  prices the wrong one.
 *
 *  A draft is not out of the building and does not supersede anything; it is
 *  offered only when nothing has ever been sent, because plenty of courses
 *  are agreed on the phone off a quote that was never marked. Declined and
 *  expired quotes are skipped entirely — that number was refused — and so is
 *  an options re-quote nobody has picked from, whose total is still 0. That
 *  last one offers nothing at all rather than falling back: the client is
 *  holding a quote with no figure on it yet, and the honest answer is the COA
 *  underneath, not the superseded price.
 *
 *  Quotes come in newest first.
 */
export function pickBillableQuote<T extends { status: string; total: number; archived_at: string | null }>(
  quotesNewestFirst: T[]
): T | null {
  const live = quotesNewestFirst.filter((q) => !q.archived_at)
  const issued = live.find((q) => q.status === 'accepted' || q.status === 'sent')
  if (issued) return issued.total > 0 ? issued : null
  return live.find((q) => q.status === 'draft' && q.total > 0) ?? null
}

/** The COA this course would be billed from: the one behind the quote that
 *  would be billed, else the one the latest quote was priced from, else the
 *  first live one. It follows `pickBillableQuote` rather than the accepted
 *  quote directly, so a re-quote moves the money and the costs underneath it
 *  together. A course with two live COAs and no quote has no right answer,
 *  and the first is the working one. */
export function pickSeedCoa<T extends { id: string | null }>(
  liveCoas: T[],
  billableEstimateId: string | null | undefined,
  latestQuoteEstimateId: string | null | undefined
): T | null {
  const live = liveCoas.filter((e) => e.id)
  if (live.length === 0) return null
  const named = (id: string | null | undefined) => (id ? live.find((e) => e.id === id) : undefined)
  return named(billableEstimateId) ?? named(latestQuoteEstimateId) ?? live[0]
}

/** Everything `BillingSection` needs, in the shape it takes it. */
export type BillingPanelData = {
  instanceId: string
  requests: InvoiceRequest[]
  billTo: { name: string; email: string | null; tagged: boolean } | null
  suggested: ChainLink | null
  forWhat: string
  recipients: { id: string; name: string }[]
}

export async function loadBillingPanel(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string
): Promise<BillingPanelData> {
  const [{ data: inst }, { data: invoiceRows }, { data: quoteRows }, { data: coaRows }, { data: billerRows }] =
    await Promise.all([
      admin
        .from('course_instances')
        .select('ref_number, course_type, custom_title, client_name, contacts, starts_at, ends_at')
        .eq('id', instanceId)
        .single(),
      admin
        .from('invoice_requests')
        .select('*')
        .eq('instance_id', instanceId)
        .order('created_at'),
      admin
        .from('course_quotes')
        .select('id, estimate_id, quote_seq, status, total, archived_at')
        .eq('instance_id', instanceId)
        .order('quote_seq', { ascending: false }),
      admin
        .from('course_estimates')
        .select('id, title, margin, price_override, archived_at, created_at, estimate_items(qty, rate)')
        .eq('instance_id', instanceId)
        .order('created_at'),
      admin.from('billing_recipients').select('id, name').eq('active', true).order('name'),
    ])
  if (!inst) throw new Error('Course not found')

  const requests: InvoiceRequest[] = ((invoiceRows ?? []) as Record<string, unknown>[]).map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    amount_received: r.amount_received === null || r.amount_received === undefined ? null : Number(r.amount_received),
  })) as InvoiceRequest[]

  const quotes = (quoteRows ?? []).map((q) => ({ ...q, total: Number(q.total ?? 0) }))
  const quote = pickBillableQuote(quotes)

  const liveCoas = (coaRows ?? [])
    .filter((e) => !e.archived_at)
    .map((e) => ({
      id: e.id as string,
      title: e.title as string,
      margin: e.margin as number | null,
      price_override: e.price_override as number | null,
      items: ((e.estimate_items ?? []) as { qty: number | null; rate: number }[]).map((i) => ({
        qty: i.qty === null ? null : Number(i.qty),
        rate: Number(i.rate),
      })),
    }))
  const seedCoa = pickSeedCoa(liveCoas, quote?.estimate_id as string | null | undefined, quotes[0]?.estimate_id)

  const payee = billTo(parseContacts(inst.contacts))

  return {
    instanceId,
    requests,
    billTo: payee
      ? { name: payee.contact.name, email: payee.contact.emails[0] ?? null, tagged: payee.tagged }
      : null,
    // The handoff is the step being taken, so it never suggests itself — it
    // reads the quote, and the estimate behind it.
    suggested: numberSoFar({
      quote: quote ? { seq: quote.quote_seq as number, total: quote.total, status: quote.status } : null,
      estimate: seedCoa
        ? {
            title: seedCoa.title,
            total: round2(coaPrice({ margin: seedCoa.margin, price_override: seedCoa.price_override, items: seedCoa.items })),
          }
        : null,
    }),
    forWhat: describeForBiller({
      refNumber: inst.ref_number as number,
      courseName: courseShortName((inst.course_type as string) ?? 'custom', null),
      clientName: inst.client_name as string | null,
      startsAt: inst.starts_at as string | null,
      endsAt: inst.ends_at as string | null,
    }),
    recipients: (billerRows ?? []).map((r) => ({ id: r.id as string, name: r.name as string })),
  }
}
