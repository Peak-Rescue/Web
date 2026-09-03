import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName, courseDayCounts } from '@/lib/courses'
import { coaPrice, guessSeedQty, DEFAULT_MARGIN } from '@/lib/estimates'
import { HERO_CHOICES } from '@/lib/quote-heroes'
import { primaryContactEmail, ccEmailOptions, type CoursePOC } from '@/lib/contacts'
import EstimatePanel, { type PricingRate } from '@/components/EstimatePanel'
import { EstimateReviewBanner, EstimateReviewRequest, type EstimateReviewRow } from './EstimateReviewBar'
import CoaComparison from './CoaComparison'
import NewCoaMenu, { type CopySource } from './NewCoaMenu'
import QuoteHeroPicker from './QuoteHeroPicker'
import QuotesSection, { type QuoteRow } from './QuotesSection'

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
    { data: adminRows }, { data: galleryImageRows }, { data: estimateReviewRows },
    { data: sourceRows }, { data: offDayRows },
  ] = await Promise.all([
    admin.from('course_estimates')
      .select('id, title, margin, price_override, created_at, estimate_items(label, qty, rate, notes, qty_factors, rate_id, drift_ack, sort_order)')
      .eq('instance_id', instanceId).order('created_at'),
    admin.from('pricing_rates').select('id, label, unit, rate, default_line').eq('active', true).order('sort_order'),
    admin.from('course_quotes')
      .select('id, accept_token, estimate_id, prepared_by, prepared_by_name, quote_seq, status, issue_date, valid_until, total, options, unit_rate_note, scope_bullets, course_blurb, sent_at, accepted_at, accepted_name')
      .eq('instance_id', instanceId).order('quote_seq', { ascending: false }),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'admin').order('first_name'),
    admin.from('gallery_images').select('url, caption, categories').order('created_at', { ascending: false }),
    admin.from('estimate_reviews')
      .select('id, created_at, requested_by, reviewer_id, note, responded_at, approved, response_note, subject')
      .eq('instance_id', instanceId).order('created_at', { ascending: false }).limit(16),
    (async () => {
      // Somewhere to copy a COA from: recent courses, then this offering, then
      // this client — deduped, most recent first.
      const sel = 'id, ref_number, course_type, custom_title, client_name, starts_at, course_estimates(id, title, margin, price_override, created_at, estimate_items(qty, rate))'
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
  const lengths = courseDayCounts(course.starts_at, course.ends_at, offDayRows ?? [])
  const estimateCounts = {
    instructors: instructorCount,
    students: course.max_students,
    days: lengths.days,
    calendarDays: lengths.calendarDays,
  }

  // Copy-picker sources: each course's COAs with their quote prices, plus the
  // relevance flags the picker groups by (same type first, then same client).
  type SourceEstimate = { id: string; title: string; margin: number; price_override: number | null; created_at: string; estimate_items: { qty: number | null; rate: number }[] }
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
  let estimatePanels = (estimateRows ?? []).map((e) => ({
    id: e.id as string | null,
    title: e.title as string,
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


  // Quote-hero photo pool: the curated static shots plus every gallery upload,
  // each carrying the category tags the picker filters by.
  const heroChoices = [
    ...HERO_CHOICES,
    ...(galleryImageRows ?? [])
      .filter((g) => !HERO_CHOICES.some((c) => c.value === g.url))
      .map((g) => ({ value: g.url, label: g.caption || 'Gallery photo', categories: g.categories ?? [] })),
  ]

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
      title: 'COA 1',
      margin: DEFAULT_MARGIN,
      priceOverride: null,
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

  return (
    <div>
      <EstimateReviewBanner reviews={estimateReviews} admins={reviewAdmins} currentUserId={currentUserId} subject="estimate" />
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
            solo={estimatePanels.length === 1}
            counts={estimateCounts}
          />
        ))}
      </div>
      {estimatePanels.length > 1 && <CoaComparison coas={estimatePanels} />}
      <div className="mt-4">
        <NewCoaMenu
          instanceId={instanceId}
          coas={persistedCoas.map((e) => ({ id: e.id!, title: e.title }))}
          sources={copySources}
        />
      </div>
      <EstimateReviewRequest instanceId={instanceId} reviews={estimateReviews} admins={reviewAdmins} currentUserId={currentUserId} subject="estimate" />

      <div className="mt-10 pt-8 border-t border-zinc-800">
      <h2 className="text-lg font-semibold mb-4">Quotes</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Marking a quote sent or accepted moves the course to Quoted or Confirmed.
      </p>
      <QuotesSection
        instanceId={instanceId}
        refNumber={course.ref_number}
        quotes={quotes}
        contactEmail={primaryContactEmail(contacts)}
        ccOptions={ccEmailOptions(contacts)}
        adminCcOptions={adminCcOptions}
        people={quotePeople}
        estimates={estimatePanels
          .filter((e) => e.id)
          .map((e) => ({
            id: e.id!,
            title: e.title,
            price: coaPrice({ margin: e.margin, price_override: e.priceOverride, items: e.items }),
          }))}
      />
      </div>
    </div>
  )
}
