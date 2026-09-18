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

/** What the invoiced and billing boxes offer as a number.
 *
 *  An accepted quote first, and failing that the newest live quote that names
 *  a figure — plenty of courses are billed off a quote that was agreed on the
 *  phone and never marked, and offering nothing there only means retyping a
 *  number the page is already holding. A declined or expired one is not
 *  offered: that number was refused. Nor is an options quote nobody has picked
 *  from, whose total is still 0.
 *
 *  Quotes come in newest first, so the highest-numbered accepted one wins —
 *  a re-quote that was also accepted supersedes.
 */
export function pickBillableQuote<T extends { status: string; total: number; archived_at: string | null }>(
  quotesNewestFirst: T[]
): T | null {
  const accepted = quotesNewestFirst.find((q) => q.status === 'accepted' && !q.archived_at)
  const offerable = quotesNewestFirst.find(
    (q) => !q.archived_at && ['accepted', 'sent', 'draft'].includes(q.status) && q.total > 0
  )
  return accepted ?? offerable ?? null
}

/** The COA this course would be billed from: the one the client actually
 *  accepted, else the one the latest quote was priced from, else the first
 *  live one. A course with two live COAs and no quote has no right answer,
 *  and the first is the working one. */
export function pickSeedCoa<T extends { id: string | null }>(
  liveCoas: T[],
  acceptedEstimateId: string | null | undefined,
  latestQuoteEstimateId: string | null | undefined
): T | null {
  const live = liveCoas.filter((e) => e.id)
  if (live.length === 0) return null
  const named = (id: string | null | undefined) => (id ? live.find((e) => e.id === id) : undefined)
  return named(acceptedEstimateId) ?? named(latestQuoteEstimateId) ?? live[0]
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
  const accepted = quotes.find((q) => q.status === 'accepted' && !q.archived_at)

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
  const seedCoa = pickSeedCoa(liveCoas, accepted?.estimate_id, quotes[0]?.estimate_id)

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
