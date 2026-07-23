'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { after } from 'next/server'
import { syncCourseCalendar } from '@/lib/google-calendar'
import { parseContacts, primaryContactEmail, ccEmailOptions } from '@/lib/contacts'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

export type EstimateItemInput = {
  label: string
  qty: number
  rate: number
  notes: string | null
  factors: number[] | null
  factor_labels: (string | null)[] | null
}

// A breakdown is only meaningful with ≥2 factors; anything else stores null.
// Stored as { f: numbers, l: labels } — labels name explicitly added
// multipliers (null where the rate's unit already provides the name).
function cleanFactors(
  factors: number[] | null,
  labels: (string | null)[] | null
): { f: number[]; l: (string | null)[] } | null {
  if (!Array.isArray(factors)) return null
  const nums = factors.slice(0, 4).map(Number).filter((n) => Number.isFinite(n))
  if (nums.length < 2) return null
  const l = nums.map((_, i) => {
    const raw = labels?.[i]
    return raw ? String(raw).trim().slice(0, 40) || null : null
  })
  return { f: nums, l }
}

// Replace-style save keeps the action simple and the client authoritative
// while typing (the panel debounces calls, expense-editor style).
// estimateId null = first save of a not-yet-persisted COA; returns the id.
export async function saveEstimate(
  instanceId: string,
  estimateId: string | null,
  input: { title: string; margin: number; items: EstimateItemInput[] }
): Promise<{ id: string }> {
  const admin = await requireAdmin()
  if (!Number.isFinite(input.margin) || input.margin < 0 || input.margin > 5) {
    throw new Error('Invalid margin')
  }
  const title = input.title.trim().slice(0, 80) || 'COA 1'

  let id = estimateId
  if (id) {
    const { error } = await admin
      .from('course_estimates')
      .update({ margin: input.margin, title })
      .eq('id', id)
      .eq('instance_id', instanceId)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await admin
      .from('course_estimates')
      .insert({ instance_id: instanceId, margin: input.margin, title })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Could not save estimate')
    id = data.id
  }

  const { error: delError } = await admin.from('estimate_items').delete().eq('estimate_id', id)
  if (delError) throw new Error(delError.message)

  const rows = input.items
    .filter((i) => i.label.trim())
    .map((i, idx) => ({
      estimate_id: id,
      label: i.label.trim().slice(0, 200),
      qty: Number.isFinite(i.qty) ? i.qty : 0,
      rate: Number.isFinite(i.rate) ? i.rate : 0,
      notes: i.notes?.trim().slice(0, 500) || null,
      qty_factors: cleanFactors(i.factors, i.factor_labels),
      sort_order: idx,
    }))
  if (rows.length > 0) {
    const { error } = await admin.from('estimate_items').insert(rows)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  return { id: id! }
}

// Adds another COA, seeded with the default-line rates (quantities guessed
// from the course, same as a fresh estimate).
export async function createEstimateCoa(instanceId: string) {
  const admin = await requireAdmin()

  const [{ data: inst }, { count }, { data: defaults }, { count: assignedCount }] = await Promise.all([
    admin.from('course_instances').select('starts_at, ends_at, max_students').eq('id', instanceId).single(),
    admin.from('course_estimates').select('id', { count: 'exact', head: true }).eq('instance_id', instanceId),
    admin.from('pricing_rates').select('label, rate').eq('active', true).eq('default_line', true).order('sort_order'),
    admin.from('instance_instructors').select('id', { count: 'exact', head: true }).eq('instance_id', instanceId),
  ])
  if (!inst) throw new Error('Course not found')

  const instructorCount = Math.max(assignedCount ?? 0, 1)
  const courseDays =
    inst.starts_at && inst.ends_at
      ? Math.max(Math.round((Date.parse(inst.ends_at) - Date.parse(inst.starts_at)) / 86_400_000) + 1, 1)
      : 1
  const guessQty = (label: string): { qty: number; factors: number[] | null } => {
    if (label === 'Instructor field day') return { qty: instructorCount * courseDays, factors: [instructorCount, courseDays] }
    if (label === 'Instructor travel day') return { qty: instructorCount * 2, factors: [instructorCount, 2] }
    if (label === 'Lodging') return { qty: instructorCount * courseDays, factors: [instructorCount, courseDays] }
    if (label === 'Permits' && inst.max_students) return { qty: inst.max_students * courseDays, factors: [inst.max_students, courseDays] }
    return { qty: 1, factors: null }
  }

  const { data: estimate, error } = await admin
    .from('course_estimates')
    .insert({ instance_id: instanceId, title: `COA ${(count ?? 0) + 1}` })
    .select('id')
    .single()
  if (error || !estimate) throw new Error(error?.message ?? 'Could not create estimate')

  const rows = (defaults ?? []).map((r, idx) => {
    const guess = guessQty(r.label)
    return {
      estimate_id: estimate.id,
      label: r.label,
      qty: guess.qty,
      qty_factors: guess.factors,
      rate: Number(r.rate),
      sort_order: idx,
    }
  })
  if (rows.length > 0) await admin.from('estimate_items').insert(rows)

  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function deleteEstimateCoa(instanceId: string, estimateId: string) {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('course_estimates')
    .delete()
    .eq('id', estimateId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// ─── Pricing rates library ───────────────────────────────────────────────────

export async function addPricingRate(formData: FormData) {
  const admin = await requireAdmin()
  const label = String(formData.get('label') ?? '').trim()
  const unit = String(formData.get('unit') ?? '').trim() || null
  const rate = Number(formData.get('rate'))
  if (!label || !Number.isFinite(rate) || rate < 0) throw new Error('Label and a non-negative rate are required')

  const { error } = await admin.from('pricing_rates').insert({ label, unit, rate, sort_order: 900 })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
}

export async function updatePricingRate(rateId: string, formData: FormData) {
  const admin = await requireAdmin()
  const rate = Number(formData.get('rate'))
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Rate must be a non-negative number')

  const { error } = await admin.from('pricing_rates').update({ rate }).eq('id', rateId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
}

export async function deletePricingRate(rateId: string) {
  const admin = await requireAdmin()

  // Mileage/meal rows drive expense-report math — they can be re-priced but not removed.
  const { data: target } = await admin.from('pricing_rates').select('reimb_type').eq('id', rateId).single()
  if (target?.reimb_type) throw new Error('This rate is used for expense reports and cannot be deleted')

  const { error } = await admin.from('pricing_rates').update({ active: false }).eq('id', rateId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
}

export async function setPricingRateDefault(rateId: string, defaultLine: boolean) {
  const admin = await requireAdmin()
  const { error } = await admin.from('pricing_rates').update({ default_line: defaultLine }).eq('id', rateId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export async function createQuote(instanceId: string, formData: FormData) {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Which COA prices this quote: explicit choice, else the newest estimate.
  const estimateId = String(formData.get('estimate_id') ?? '')
  let estimateQuery = admin
    .from('course_estimates')
    .select('margin, estimate_items(qty, rate)')
    .eq('instance_id', instanceId)
  if (estimateId) {
    estimateQuery = estimateQuery.eq('id', estimateId)
  } else {
    estimateQuery = estimateQuery.order('created_at', { ascending: false }).limit(1)
  }

  const [{ data: inst }, { data: estimates }, { data: lastQuote }, { data: profile }] = await Promise.all([
    admin
      .from('course_instances')
      .select('course_type, custom_title, client_name, location, starts_at, ends_at, max_students')
      .eq('id', instanceId)
      .single(),
    estimateQuery,
    admin.from('course_quotes').select('quote_seq').eq('instance_id', instanceId).order('quote_seq', { ascending: false }).limit(1).maybeSingle(),
    user ? admin.from('profiles').select('first_name, last_name, email').eq('id', user.id).single() : { data: null },
  ])
  if (!inst) throw new Error('Course not found')
  const estimate = (estimates ?? [])[0] ?? null

  const items = (estimate?.estimate_items ?? []) as { qty: number; rate: number }[]
  const subtotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0)
  const total = Math.round(subtotal * (1 + Number(estimate?.margin ?? 0.25)) * 100) / 100

  const days =
    inst.starts_at && inst.ends_at
      ? Math.max(Math.round((Date.parse(inst.ends_at) - Date.parse(inst.starts_at)) / 86_400_000) + 1, 1)
      : null
  const bullets = [
    days ? `Duration: ${days} days of training` : null,
    inst.max_students ? `Participants: up to ${inst.max_students} students` : null,
    inst.location ? `Location: ${inst.location}` : null,
  ].filter((b): b is string => Boolean(b))

  const { services } = await import('@/lib/data/services')
  const blurb = services.find((s) => s.slug === inst.course_type)?.description ?? null

  const { QUOTE_VALIDITY_DAYS } = await import('@/lib/quotes')
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + QUOTE_VALIDITY_DAYS)

  const { error } = await admin.from('course_quotes').insert({
    instance_id: instanceId,
    quote_seq: (lastQuote?.quote_seq ?? 0) + 1,
    total,
    valid_until: validUntil.toISOString().slice(0, 10),
    scope_bullets: bullets,
    course_blurb: blurb,
    prepared_by: user?.id ?? null,
    prepared_by_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
    prepared_by_email: profile?.email ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function updateQuote(instanceId: string, quoteId: string, formData: FormData) {
  const admin = await requireAdmin()
  const total = Number(formData.get('total'))
  if (!Number.isFinite(total) || total < 0) throw new Error('Total must be a non-negative number')

  const bullets = String(formData.get('scope_bullets') ?? '')
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)

  // "From" — re-snapshot name/email when a different preparer is chosen.
  const preparedBy = String(formData.get('prepared_by') ?? '')
  let preparerPatch: Record<string, unknown> = {}
  if (preparedBy) {
    const { data: p } = await admin.from('profiles').select('first_name, last_name, email').eq('id', preparedBy).eq('role', 'admin').single()
    if (p) {
      preparerPatch = {
        prepared_by: preparedBy,
        prepared_by_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
        prepared_by_email: p.email ?? null,
      }
    }
  }

  const { error } = await admin
    .from('course_quotes')
    .update({
      ...preparerPatch,
      total,
      valid_until: String(formData.get('valid_until') ?? '') || null,
      unit_rate_note: String(formData.get('unit_rate_note') ?? '').trim() || null,
      scope_bullets: bullets,
      course_blurb: String(formData.get('course_blurb') ?? '').trim() || null,
    })
    .eq('id', quoteId)
    .eq('instance_id', instanceId)
    .eq('status', 'draft')
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Manual transitions for now (the send/accept flow automates these later).
// Sent syncs the course to 'quoted'; accepted syncs it to 'confirmed'.
export async function setQuoteStatus(instanceId: string, quoteId: string, status: 'sent' | 'accepted' | 'declined') {
  const admin = await requireAdmin()

  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  if (status === 'accepted') patch.accepted_at = new Date().toISOString()
  if (status === 'declined') patch.declined_at = new Date().toISOString()

  const { error } = await admin.from('course_quotes').update(patch).eq('id', quoteId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)

  const { data: inst } = await admin.from('course_instances').select('status').eq('id', instanceId).single()
  if (status === 'sent' && inst?.status === 'tentative') {
    await admin.from('course_instances').update({ status: 'quoted' }).eq('id', instanceId)
    after(() => syncCourseCalendar(admin, instanceId))
  }
  if (status === 'accepted' && inst && ['tentative', 'quoted'].includes(inst.status)) {
    await admin.from('course_instances').update({ status: 'confirmed' }).eq('id', instanceId)
    after(() => syncCourseCalendar(admin, instanceId))
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath('/admin/courses')
  revalidatePath('/admin')
}

export async function deleteQuote(instanceId: string, quoteId: string) {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('course_quotes')
    .delete()
    .eq('id', quoteId)
    .eq('instance_id', instanceId)
    .eq('status', 'draft')
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Emails the quote link to the course's primary POC and marks it sent. The
// form's "cc" checkboxes add any of the course's other contact emails.
export async function sendQuote(instanceId: string, quoteId: string, formData?: FormData) {
  const admin = await requireAdmin()

  const [{ data: quote }, { data: inst }] = await Promise.all([
    admin.from('course_quotes').select('quote_seq, status, accept_token, total, prepared_by_name, prepared_by_email').eq('id', quoteId).eq('instance_id', instanceId).single(),
    admin.from('course_instances').select('ref_number, course_type, custom_title, client_name, contacts, starts_at, ends_at').eq('id', instanceId).single(),
  ])
  if (!quote || !inst) throw new Error('Quote not found')
  if (quote.status !== 'draft') throw new Error('Only draft quotes can be sent')
  const contacts = parseContacts(inst.contacts)
  const toEmail = primaryContactEmail(contacts)
  if (!toEmail) throw new Error('The course has no point-of-contact email — add one in Details first')
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured in this environment')

  const { quoteNumber } = await import('@/lib/quotes')
  const { courseShortName } = await import('@/lib/courses')
  const qNum = quoteNumber(inst.ref_number, quote.quote_seq)
  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.peakrescuemountainguides.com'
  const link = `${siteUrl}/quote/${quote.accept_token}`
  const dates = inst.starts_at
    ? `${inst.starts_at}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${inst.ends_at}` : ''}`
    : 'dates TBD'

  // Only emails actually on the course's contacts can be CC'd.
  const allowedCc = new Set(ccEmailOptions(contacts))
  const requestedCc = (formData?.getAll('cc_extra') ?? []).map(String).filter((e) => allowedCc.has(e))
  const cc = [...new Set([...(quote.prepared_by_email ? [quote.prepared_by_email] : []), ...requestedCc])]

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: 'Peak Rescue Mountain Guides <noreply@peak-rescue.com>',
    to: [toEmail],
    cc: cc.length > 0 ? cc : undefined,
    replyTo: quote.prepared_by_email ?? undefined,
    subject: `Peak Rescue Quote ${qNum} — ${courseName}`,
    text: [
      `${contacts[0]?.name || 'Hello'},`,
      '',
      `Thank you for the opportunity — your quote for ${courseName}${inst.client_name ? ` (${inst.client_name})` : ''}, ${dates}, is ready:`,
      '',
      link,
      '',
      'The page has the full details and a button to accept and lock in your dates.',
      '',
      `Questions? Just reply to this email.`,
      '',
      quote.prepared_by_name ?? 'Peak Rescue Mountain Guides',
    ].join('\n'),
  })
  if (sendError) throw new Error(`Email failed: ${sendError.message}`)

  await admin.from('course_quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quoteId)
  const { data: cur } = await admin.from('course_instances').select('status').eq('id', instanceId).single()
  if (cur?.status === 'tentative') {
    await admin.from('course_instances').update({ status: 'quoted' }).eq('id', instanceId)
    after(() => syncCourseCalendar(admin, instanceId))
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath('/admin/courses')
  revalidatePath('/admin')
}

// Copies all COAs from another course into this one (for pricing a course
// similar to one already run).
export async function copyEstimatesFrom(instanceId: string, formData: FormData) {
  const admin = await requireAdmin()
  const sourceId = String(formData.get('source_instance_id') ?? '')
  if (!sourceId || sourceId === instanceId) throw new Error('Pick a course to copy from')

  const { data: source } = await admin
    .from('course_instances')
    .select('ref_number')
    .eq('id', sourceId)
    .single()
  if (!source) throw new Error('Source course not found')

  const { cloneEstimates } = await import('@/lib/estimates')
  await cloneEstimates(admin, sourceId, instanceId, ` (from PR-${String(source.ref_number).padStart(4, '0')})`)
  revalidatePath(`/admin/courses/${instanceId}`)
}
