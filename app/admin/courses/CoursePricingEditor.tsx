import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName, courseDayCounts } from '@/lib/courses'
import { coaPrice, guessSeedQty, coaSpan, coaHasOwnSpan, DEFAULT_MARGIN } from '@/lib/estimates'
import { type OptionRelation } from '@/lib/quotes'
import { describeForBiller, numberSoFar } from '@/lib/billing'
import { billingState, pickBillableQuote, pickSeedCoa } from '@/lib/billing-handoff'
import { QUOTE_ROW_COLUMNS } from '@/lib/quotes'
import { primaryContactEmail, ccEmailOptions, billTo, type CoursePOC } from '@/lib/contacts'
import EstimatePanel, { type PricingRate } from '@/components/EstimatePanel'
import { EstimateReviewBanner, EstimateReviewRequest, type EstimateReviewRow } from './EstimateReviewBar'
import CoaComparison from './CoaComparison'
import ArchivedCoas from './ArchivedCoas'
import NewCoaMenu, { type CopySource } from './NewCoaMenu'
import QuotesSection, { type QuoteRow } from './QuotesSection'
import BillingSection from './BillingSection'
import { type InvoiceRequest } from '@/lib/billing'
import ActualsPanel from '@/components/ActualsPanel'
import PricingFold from '@/components/PricingFold'
import { actualsAreLive, estimateCostSeed } from '@/lib/actuals'
import { courseFieldDates, payPlan } from '@/lib/pay'
import { loadActuals } from '@/lib/actuals-data'
import { courseZone, todayIn } from '@/lib/course-clock'
import { fmtMoney, round2 } from '@/lib/expenses'
import { sectionRule, sectionTitle } from '@/lib/ui'

// What a course costs and what we told the client it costs.
//
// Internal in the strongest sense on this page: instructors never see it, and
// the toggle takes it away rather than dimming it.
//
// Self-loading, like staffing and students and for a bigger version of the
// same reason — estimates, rates, quotes, reviewers, the hero photo pool and
// the copy-from-another-course picker are seven queries and a hundred lines of
// derivation used nowhere else. Threading that through two screens as props
// would put all of it in both.
export default async function CoursePricingEditor({
  instanceId,
  course,
  contacts,
  instructorCount,
  currentUserId,
}: {
  instanceId: string
  course: {
    ref_number: number
    client_name: string | null
    course_type: string | null
    max_students: number | null
    starts_at: string | null
    ends_at: string | null
    breaks_paid?: boolean | null
    /** Both only so the page can tell whether the course has reached the
        point where actuals are the live question and the estimate is
        history — the status, and the clock the answer is asked on. */
    status?: string | null
    region?: string | null
    hero_image: string | null
    hero_position: string | null
    hero_scale: string | number | null
  }
  contacts: CoursePOC[]
  /** Instructor slots from the course details — what the course is planned to
      need, not who is assigned yet. At least one, because a course with nobody
      on it still costs a day of somebody's time to quote. */
  instructorCount: number
  currentUserId: string
}) {
  const admin = createAdminClient()
  const [
    { data: estimateRows }, { data: pricingRateRows }, { data: quoteRows },
    { data: adminRows }, { data: estimateReviewRows },
    { data: sourceRows }, { data: offDayRows },
    actuals,
    { data: invoiceRows }, { data: billerRows }, { data: readerRows },
  ] = await Promise.all([
    admin.from('course_estimates')
      .select('id, title, margin, price_override, created_at, archived_at, starts_at, ends_at, extends_id, relation, estimate_items(label, qty, rate, notes, qty_factors, rate_id, drift_ack, sort_order)')
      .eq('instance_id', instanceId).order('created_at'),
    admin.from('pricing_rates').select('id, label, unit, rate, pay_rate, own_time, default_line').eq('active', true).order('sort_order'),
    admin.from('course_quotes')
      .select(QUOTE_ROW_COLUMNS)
      .eq('instance_id', instanceId).order('quote_seq', { ascending: false }),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'admin').order('first_name'),
    admin.from('estimate_reviews')
      .select('id, created_at, requested_by, reviewer_id, note, responded_at, approved, response_note, subject')
      .eq('instance_id', instanceId).order('created_at', { ascending: false }).limit(16),
    (async () => {
      // Somewhere to copy a COA from: recent courses, then this offering, then
      // this client — deduped, most recent first.
      const sel = 'id, ref_number, course_type, custom_title, client_name, starts_at, course_estimates(id, title, margin, price_override, created_at, archived_at, estimate_items(qty, rate))'
      const q = () => admin.from('course_instances').select(sel).neq('id', instanceId)
        .order('starts_at', { ascending: false, nullsFirst: false })
      const client = (course.client_name ?? '').trim()
      const [recent, sameType, sameClient] = await Promise.all([
        q().limit(60),
        course.course_type !== 'custom' && course.course_type ? q().eq('course_type', course.course_type).limit(40) : { data: [] },
        client ? q().ilike('client_name', `%${client}%`).limit(40) : { data: [] },
      ])
      const seen = new Set<string>()
      const rows = [...(recent.data ?? []), ...(sameType.data ?? []), ...(sameClient.data ?? [])]
        .filter((r) => !seen.has(r.id) && Boolean(seen.add(r.id)))
        .sort((a, b) => ((b.starts_at as string | null) ?? '').localeCompare((a.starts_at as string | null) ?? ''))
      return { data: rows }
    })(),
    admin.from('instance_off_days').select('off_date, end_date').eq('instance_id', instanceId),
    // Everything the actuals need, assembled by the one loader the emailed
    // page and the PDF also go through — as a single entry here so it still
    // rides in this page's existing round trip.
    loadActuals(admin, instanceId),
    admin.from('invoice_requests').select('*').eq('instance_id', instanceId).order('created_at', { ascending: false }),
    admin.from('billing_recipients').select('id, name').eq('active', true).order('name'),
    admin.from('report_recipients').select('id, name').eq('active', true).order('name'),
  ])

  const quotePeople = (adminRows ?? [])
    .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' '), email: p.email ?? null }))
    .filter((p) => p.name)
  const pricingRates: PricingRate[] = (pricingRateRows ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))
  const quotes: QuoteRow[] = (quoteRows ?? []).map((q) => ({ ...q, total: Number(q.total) }))

  // Two lengths, because they stop being the same number as soon as a break
  // is in the middle: people are paid for the days the course runs, while the
  // vehicle and the lodging are held across the whole span plus a day at each
  // end.
  const lengths = courseDayCounts(course.starts_at, course.ends_at, offDayRows ?? [], course.breaks_paid ?? true)
  const estimateCounts = {
    instructors: instructorCount,
    students: course.max_students,
    days: lengths.days,
    calendarDays: lengths.calendarDays,
  }

  // A COA that prices part of the course answers its own day counts. The
  // course's off days are passed through rather than filtered: courseDayCounts
  // only counts the ones inside the window it is given, so a break in the
  // second week does not shorten a COA that covers the first.
  const countsForCoa = (coa: { starts_at?: string | null; ends_at?: string | null } | null) => {
    if (!coaHasOwnSpan(coa)) return estimateCounts
    const span = coaSpan(coa, { starts_at: course.starts_at as string | null, ends_at: course.ends_at as string | null })
    const own = courseDayCounts(span.starts_at, span.ends_at, offDayRows ?? [], course.breaks_paid ?? true)
    return { ...estimateCounts, days: own.days, calendarDays: own.calendarDays }
  }

  // Copy-picker sources: each course's COAs with their quote prices, plus the
  // relevance flags the picker groups by (same type first, then same client).
  type SourceEstimate = { id: string; title: string; margin: number; price_override: number | null; created_at: string; archived_at: string | null; estimate_items: { qty: number | null; rate: number }[] }
  const currentClient = ((course.client_name as string | null) ?? '').trim().toLowerCase()
  const copySources: CopySource[] = (sourceRows ?? [])
    .map((s) => ({
      id: s.id,
      name: courseShortName(s.course_type, s.custom_title),
      typeKey: s.course_type,
      typeLabel: s.course_type === 'custom' ? 'Custom' : courseShortName(s.course_type, null),
      client: s.client_name?.trim() || null,
      month: s.starts_at
        ? new Date(s.starts_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : null,
      sameType: s.course_type === course.course_type && s.course_type !== 'custom',
      sameClient: Boolean(currentClient) && (s.client_name ?? '').trim().toLowerCase() === currentClient,
      coas: ((s.course_estimates ?? []) as SourceEstimate[])
        // An option that course set aside is its history, not a template.
        .filter((e) => !e.archived_at)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({
          id: e.id,
          title: e.title,
          price: Math.round(
            coaPrice({ margin: e.margin, price_override: e.price_override, items: e.estimate_items ?? [] })
          ),
        })),
    }))
    .filter((s) => s.coas.length > 0)

  type EstimateItemRow = { label: string; qty: number | null; rate: number; notes: string | null; qty_factors: unknown; rate_id: string | null; drift_ack: { i: number; s: number | null; d: number | null } | null; sort_order: number }
  const normalizeFactors = (qf: unknown): { f: number[]; l: (string | null)[] } | null => {
    if (Array.isArray(qf)) return { f: qf.map(Number), l: [] }
    if (qf && typeof qf === 'object' && Array.isArray((qf as { f?: unknown }).f)) {
      const o = qf as { f: number[]; l?: (string | null)[] }
      return { f: o.f.map(Number), l: o.l ?? [] }
    }
    return null
  }
  const allCoas = (estimateRows ?? []).map((e) => ({
    id: e.id as string | null,
    title: e.title as string,
    archivedAt: (e.archived_at as string | null) ?? null,
    startsAt: (e.starts_at as string | null) ?? null,
    endsAt: (e.ends_at as string | null) ?? null,
    extendsId: (e.extends_id as string | null) ?? null,
    relation: ((e.relation as string | null) ?? null) as OptionRelation | null,
    margin: Number(e.margin),
    priceOverride: e.price_override === null ? null : Number(e.price_override),
    items: ((e.estimate_items ?? []) as EstimateItemRow[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        label: i.label,
        qty: i.qty === null ? null : Number(i.qty),
        rate: Number(i.rate),
        notes: i.notes,
        factors: normalizeFactors(i.qty_factors)?.f ?? null,
        factor_labels: normalizeFactors(i.qty_factors)?.l ?? null,
        rate_id: i.rate_id,
        drift_ack: i.drift_ack,
      })),
  }))

  // Set-aside COAs come out of the working set entirely: no panel, no column
  // in the comparison, no price to pull a quote from. They collapse to a
  // summary line under the live ones.
  const archivedCoas = allCoas.filter((e) => e.archivedAt)
  let estimatePanels = allCoas.filter((e) => !e.archivedAt)

  const estimateReviews = (estimateReviewRows ?? []) as EstimateReviewRow[]
  // Same people as the reviewers, minus anyone without an address to copy.
  const adminCcOptions = (adminRows ?? [])
    .filter((a) => Boolean(a.email))
    .map((a) => ({
      id: a.id,
      name: [a.first_name, a.last_name].filter(Boolean).join(' ') || (a.email as string),
      email: a.email as string,
    }))
  const reviewAdmins = (adminRows ?? []).map((a) => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || 'Admin',
  }))


  // No estimates yet: show a virtual first COA pre-populated with the
  // always-recurring lines, quantities guessed from the course (nothing
  // saves until touched).
  if (estimatePanels.length === 0) {
    const seedCounts = {
      instructors: instructorCount,
      days: lengths.days ?? 1,
      calendarDays: lengths.calendarDays ?? 1,
      students: (course.max_students as number | null) ?? null,
    }
    estimatePanels = [{
      id: null,
      title: `COA ${allCoas.length + 1}`,
      margin: DEFAULT_MARGIN,
      priceOverride: null,
      archivedAt: null,
      startsAt: null,
      endsAt: null,
      extendsId: null,
      relation: null,
      items: (pricingRateRows ?? [])
        .filter((r) => r.default_line)
        .map((r) => {
          const guess = guessSeedQty(r, seedCounts)
          return { label: r.label, qty: guess.qty, rate: Number(r.rate), notes: null, factors: guess.factors, factor_labels: null, rate_id: r.id as string, drift_ack: null }
        }),
    }]
  }

  // COAs that exist in the DB — the virtual first COA (id null) can't be
  // duplicated until it's been touched and saved.
  const persistedCoas = estimatePanels.filter((e) => e.id !== null)

  // ── Actuals ───────────────────────────────────────────────────────────────

  // Where the conversation landed, offered to the invoiced field as a
  // starting point. Shared with the courses list, which offers the same
  // handoff from a drawer under the row — see lib/billing-handoff.
  const accepted = quotes.find((q) => q.status === 'accepted' && !q.archived_at)
  const suggested = pickBillableQuote(quotes)

  // The handoff to Harken. The payee is the POC tagged billing in Details, or
  // the course's own contact when nobody is tagged —
  // read here rather than in the client component so the section can say which
  // of the two prerequisites is missing before anyone clicks anything.
  const payee = billTo(contacts)
  const invoiceRequests: InvoiceRequest[] = (invoiceRows ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    amount_received: r.amount_received === null || r.amount_received === undefined ? null : Number(r.amount_received),
  })) as InvoiceRequest[]
  // How far this course has got with Harken. "not sent" whether or not a quote
  // was accepted: a course can be billed against a typed figure, so a missing
  // quote is no longer a reason for the folded section to say nothing at all.
  const handedToHarken = billingState(invoiceRequests) !== 'not-sent'
  const billingSummary = {
    'not-sent': 'not sent', 'with-harken': 'with Harken', invoiced: 'invoiced', paid: 'paid',
  }[billingState(invoiceRequests)]

  // ── What the actuals start as ─────────────────────────────────────────────
  //
  // An empty actuals list meant retyping the COA from memory, two folds up
  // the page. So the first time anybody opens the section on a course that
  // has a COA, its lines are written in as costs and the pay suggestion
  // beside them — a guess to correct, every row deletable. Not the whole COA:
  // estimateCostSeed leaves out our own time and everything an expense report
  // is going to bring in by itself, which is the difference between a starting
  // point and a double count. The panel does the writing (and the seeding only
  // ever happens once); the numbers are worked out here, where the COA, the
  // rates and the chart of accounts are already loaded.
  //
  // Which COA: the one the client actually accepted, else the one the latest
  // quote was priced from, else the first live one. A course with two live
  // COAs and no quote has no right answer, and the first is the working one.
  const seedCoa = pickSeedCoa(estimatePanels, accepted?.estimate_id, quotes[0]?.estimate_id)

  // What each of the last two steps offers as its number.
  //
  // Both read the same chain — billed ← quote ← estimate — and take the
  // furthest link down that exists, rather than only the step immediately
  // above. A course booked against a PO has no quote and a course handed over
  // early has no estimate, and a step that only looks one row up finds
  // nothing on those and leaves somebody retyping a figure the page is
  // already holding. The answer names its own source, which is what keeps an
  // estimate from reading as an agreed price.
  const billedLink = (() => {
    const live = invoiceRequests.filter((r) => r.status !== 'cancelled')
    return live.length > 0
      ? { total: round2(live.reduce((t, r) => t + r.amount, 0)), count: live.length }
      : null
  })()
  const quoteLink = suggested
    ? { seq: suggested.quote_seq as number, total: suggested.total, status: suggested.status }
    : null
  // The COA this course would be billed from, priced as it stands. The same
  // one the actuals seed their costs from — whichever the client accepted,
  // else the latest quoted, else the first live one.
  const estimateLink = seedCoa
    ? {
        title: seedCoa.title,
        total: coaPrice({ margin: seedCoa.margin, price_override: seedCoa.priceOverride, items: seedCoa.items }),
      }
    : null

  const invoicedSuggestion = numberSoFar({ billed: billedLink, quote: quoteLink, estimate: estimateLink })
  // The handoff is the step being taken, so it never suggests itself — it
  // reads the quote, and the estimate behind it.
  const billingSuggestion = numberSoFar({ quote: quoteLink, estimate: estimateLink })

  const actualsLive = actualsAreLive(
    { starts_at: course.starts_at, status: course.status ?? null },
    todayIn(courseZone(course.region))
  )
  // What the crew is owed, worked out from the course's own dates rather than
  // from a count of days: pay is hourly, the hourly differs per person, and
  // overtime past 40 hours belongs to a Sunday-to-Saturday week — so which
  // week each day falls in decides the money. Offered, never applied.
  // The days the course itself runs, which each person's own row then trims
  // or extends: somebody arrived late, somebody left after the practical.
  const fieldDates = courseFieldDates(
    { starts_at: course.starts_at, ends_at: course.ends_at, breaks_paid: course.breaks_paid },
    offDayRows ?? []
  )
  const plan = payPlan(actuals.payPeople, fieldDates, actuals.paySettings)

  // A rate marked as somebody's time is quoted at a padded number on purpose
  // — those lines are left to the pay section, which prices the same time at
  // the hourly rates people are actually on.
  const ownTimeRateIds = new Set(
    (pricingRateRows ?? []).filter((r) => r.own_time).map((r) => r.id as string)
  )

  const actualsSeed =
    seedCoa && !actuals.seededAt && actuals.payLines.length === 0 && actuals.costLines.length === 0
      ? {
          from: seedCoa.title,
          // Pay is seeded only when every person staffed has an hourly. A
          // plan missing somebody's field days would be written in as though
          // it were the answer, and the panel would then hide the box that
          // asks for the rate — so an incomplete plan is left to be picked
          // over on screen instead.
          pay: plan && plan.missingRates.length === 0 ? plan.lines : [],
          costs: estimateCostSeed(
            seedCoa.items.map((i) => ({ label: i.label, qty: i.qty, rate: i.rate, rate_id: i.rate_id })),
            actuals.accounts,
            ownTimeRateIds
          ),
        }
      : null

  // What each folded section says while shut, so folding one away costs
  // nothing at a glance.
  const liveCoaPrices = estimatePanels.map((e) =>
    coaPrice({ margin: e.margin, price_override: e.priceOverride, items: e.items })
  )
  const costSummary =
    liveCoaPrices.length === 0
      ? undefined
      : liveCoaPrices.length === 1
        ? fmtMoney(liveCoaPrices[0])
        : `${liveCoaPrices.length} COAs · ${fmtMoney(Math.min(...liveCoaPrices))}–${fmtMoney(Math.max(...liveCoaPrices))}`
  const latestQuote = quotes[0]
  const quoteSummary = latestQuote
    ? `Quote ${latestQuote.quote_seq} ${latestQuote.status} · ${fmtMoney(latestQuote.total)}`
    : undefined

  // Nothing reconciled yet says so, rather than showing a net of zero as
  // though the course had broken even.
  const actualsSummary =
    actuals.rolled.invoiced === 0 && actuals.rolled.costsTotal === 0
      ? 'nothing entered yet'
      : `${fmtMoney(actuals.rolled.net)}${actuals.rolled.netPct === null ? '' : ` · ${(actuals.rolled.netPct * 100).toFixed(1)}%`}`

  return (
    <div>
      <EstimateReviewBanner reviews={estimateReviews} admins={reviewAdmins} currentUserId={currentUserId} subject="estimate" />

      {/* Three sections, one live at a time. Which one is open follows the
          course: before it runs the question is what to charge, and from the
          first day the question is what it cost. Defaults only — a course
          that already ran still gets its estimate argued about. */}
      {/* Each part of the fold is separated the same way and named the same
          way — the rhythm was four different gaps (space-y-8 between COAs,
          mt-6 for the comparison, mt-4 for the menu, mt-5 for the review
          bar), which reads as four unrelated things stacked rather than one
          section with parts. */}
      <PricingFold title="Cost" summary={costSummary} defaultOpen={!actualsLive}>
      <div className="space-y-8">
        {estimatePanels.map((e) => (
          <EstimatePanel
            key={e.id ?? `${instanceId}-new`}
            instanceId={instanceId}
            estimateId={e.id}
            initialTitle={e.title}
            initialMargin={e.margin}
            initialPriceOverride={e.priceOverride}
            initialItems={e.items}
            rates={pricingRates}
            canDelete={estimatePanels.length > 1}
            canArchive={estimatePanels.length > 1}
            solo={estimatePanels.length === 1 && archivedCoas.length === 0}
            counts={countsForCoa({ starts_at: e.startsAt, ends_at: e.endsAt })}
            initialStartsAt={e.startsAt}
            initialEndsAt={e.endsAt}
            initialExtendsId={e.extendsId}
            initialRelation={e.relation}
            siblings={estimatePanels
              .filter((o) => o.id && o.id !== e.id && o.relation !== 'addition')
              .map((o) => ({ id: o.id as string, title: o.title }))}
            courseSpan={{ starts_at: course.starts_at as string | null, ends_at: course.ends_at as string | null }}
          />
        ))}
      </div>
      {estimatePanels.length > 1 && (
        <div className={`${sectionRule} mt-6`}>
          <h4 className={`${sectionTitle} mb-3`}>Side by side</h4>
          <CoaComparison coas={estimatePanels} courseSpan={{ starts_at: course.starts_at as string | null, ends_at: course.ends_at as string | null }} />
        </div>
      )}
      {archivedCoas.length > 0 && (
        <ArchivedCoas
          instanceId={instanceId}
          coas={archivedCoas.map((e) => ({
            id: e.id!,
            title: e.title,
            price: coaPrice({ margin: e.margin, price_override: e.priceOverride, items: e.items }),
            archivedAt: e.archivedAt,
          }))}
        />
      )}
      <div className={`${sectionRule} mt-6`}>
        <h4 className={`${sectionTitle} mb-3`}>Another option</h4>
        <NewCoaMenu
          instanceId={instanceId}
          coas={persistedCoas.map((e) => ({ id: e.id!, title: e.title }))}
          sources={copySources}
        />
      </div>
      <EstimateReviewRequest instanceId={instanceId} reviews={estimateReviews} admins={reviewAdmins} currentUserId={currentUserId} subject="estimate" />
      </PricingFold>

      <PricingFold title="Quotes" summary={quoteSummary} defaultOpen={!actualsLive}>
      <QuotesSection
        instanceId={instanceId}
        refNumber={course.ref_number}
        quotes={quotes}
        contactEmail={primaryContactEmail(contacts)}
        ccOptions={ccEmailOptions(contacts)}
        adminCcOptions={adminCcOptions}
        people={quotePeople}
        coaTitles={Object.fromEntries(allCoas.filter((e) => e.id).map((e) => [e.id!, e.title]))}
        estimates={estimatePanels
          .filter((e) => e.id)
          .map((e) => ({
            id: e.id!,
            title: e.title,
            price: coaPrice({ margin: e.margin, price_override: e.priceOverride, items: e.items }),
          }))}
      />
      </PricingFold>

      {/* Between the quote and the actuals, because that is where it happens:
          the number has been agreed and the money has not arrived yet. */}
      {/* Open until the course has actually been handed over. Anything else
          is a fold shut over work still to do — including the case where
          there is no accepted quote yet, which is not "nothing to see here",
          it is the first half of the job. It shuts once a request exists,
          and the summary then says where the money has got to. */}
      <PricingFold title="Billing" summary={billingSummary} defaultOpen={!handedToHarken}>
      <BillingSection
        instanceId={instanceId}
        requests={invoiceRequests}
        billTo={
          payee
            ? { name: payee.contact.name, email: payee.contact.emails[0] ?? null, tagged: payee.tagged }
            : null
        }
        suggested={billingSuggestion}
        forWhat={describeForBiller({
          refNumber: course.ref_number,
          courseName: courseShortName(course.course_type ?? 'custom', null),
          clientName: course.client_name,
          startsAt: course.starts_at,
          endsAt: course.ends_at,
        })}
        recipients={(billerRows ?? []).map((r) => ({ id: r.id as string, name: r.name as string }))}
      />
      </PricingFold>

      <PricingFold
        title="Actuals"
        summary={actualsSummary}
        defaultOpen={actualsLive}
      >
        <ActualsPanel
          instanceId={instanceId}
          actuals={actuals}
          fieldDates={fieldDates}
          seed={actualsSeed}
          invoicedSuggestion={invoicedSuggestion}
          readers={(readerRows ?? []).map((r) => ({ id: r.id as string, name: r.name as string }))}
        />
      </PricingFold>
    </div>
  )
}
