'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { after } from 'next/server'
import { syncCourseCalendar } from '@/lib/google-calendar'
import { parseContacts, primaryContactEmail, ccEmailOptions } from '@/lib/contacts'
import { guessSeedQty, type SeedCounts } from '@/lib/estimates'

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
  rate_id: string | null // library rate the line came from — survives renames
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      rate_id: i.rate_id && UUID_RE.test(i.rate_id) ? i.rate_id : null,
      sort_order: idx,
    }))
  if (rows.length > 0) {
    const { error } = await admin.from('estimate_items').insert(rows)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  return { id: id! }
}

// Persists a new COA seeded with the default-line rates (quantities guessed
// from the course, same as the virtual estimate the course page shows before
// anything is saved). Returns it shaped like createQuote's estimate query.
async function seedDefaultCoa(admin: Awaited<ReturnType<typeof requireAdmin>>, instanceId: string) {
  const [{ data: inst }, { count }, { data: defaults }, { count: assignedCount }] = await Promise.all([
    admin.from('course_instances').select('starts_at, ends_at, max_students').eq('id', instanceId).single(),
    admin.from('course_estimates').select('id', { count: 'exact', head: true }).eq('instance_id', instanceId),
    admin.from('pricing_rates').select('id, label, unit, rate').eq('active', true).eq('default_line', true).order('sort_order'),
    admin.from('instance_instructors').select('id', { count: 'exact', head: true }).eq('instance_id', instanceId),
  ])
  if (!inst) throw new Error('Course not found')

  const counts: SeedCounts = {
    instructors: Math.max(assignedCount ?? 0, 1),
    days:
      inst.starts_at && inst.ends_at
        ? Math.max(Math.round((Date.parse(inst.ends_at) - Date.parse(inst.starts_at)) / 86_400_000) + 1, 1)
        : 1,
    students: inst.max_students,
  }

  const { data: estimate, error } = await admin
    .from('course_estimates')
    .insert({ instance_id: instanceId, title: `COA ${(count ?? 0) + 1}` })
    .select('id, title, margin')
    .single()
  if (error || !estimate) throw new Error(error?.message ?? 'Could not create estimate')

  const rows = (defaults ?? []).map((r, idx) => {
    const guess = guessSeedQty(r, counts)
    return {
      estimate_id: estimate.id,
      label: r.label,
      qty: guess.qty,
      qty_factors: guess.factors,
      rate: Number(r.rate),
      rate_id: r.id,
      sort_order: idx,
    }
  })
  if (rows.length > 0) await admin.from('estimate_items').insert(rows)

  return { title: estimate.title as string, margin: estimate.margin as number | null, estimate_items: rows }
}

// Adds another COA, seeded with the default-line rates (quantities guessed
// from the course, same as a fresh estimate).
export async function createEstimateCoa(instanceId: string) {
  const admin = await requireAdmin()

  // A course with no saved estimate shows a virtual default COA. Adding "another"
  // COA there must persist that one too, or the page re-renders with a single
  // panel and the click looks like it did nothing.
  const { count } = await admin
    .from('course_estimates')
    .select('id', { count: 'exact', head: true })
    .eq('instance_id', instanceId)
  await seedDefaultCoa(admin, instanceId)
  if ((count ?? 0) === 0) await seedDefaultCoa(admin, instanceId)

  revalidatePath(`/admin/courses/${instanceId}`)
}

// "Copy of current estimate" on a course whose panel is still the virtual
// default COA: persist those defaults and replicate them. If an autosave
// landed since the page rendered, copy that saved estimate instead.
export async function duplicateCurrentEstimate(instanceId: string) {
  const admin = await requireAdmin()
  const { data: existing } = await admin
    .from('course_estimates')
    .select('id')
    .eq('instance_id', instanceId)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (existing) {
    await duplicateEstimateCoa(instanceId, existing.id)
    return
  }
  await seedDefaultCoa(admin, instanceId)
  await seedDefaultCoa(admin, instanceId)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Copies one COA (items, notes, breakdowns) into a new COA on the same
// course — the "similar option, tweak from here" workflow.
export async function duplicateEstimateCoa(instanceId: string, estimateId: string) {
  const admin = await requireAdmin()
  const { data: src } = await admin
    .from('course_estimates')
    .select('title, margin, estimate_items(label, qty, rate, notes, qty_factors, rate_id, sort_order)')
    .eq('id', estimateId)
    .eq('instance_id', instanceId)
    .single()
  if (!src) throw new Error('Estimate not found')

  const { data: created, error } = await admin
    .from('course_estimates')
    .insert({
      instance_id: instanceId,
      title: `${src.title} (copy)`.slice(0, 80),
      margin: src.margin,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(error?.message ?? 'Could not duplicate estimate')

  const items = ((src.estimate_items ?? []) as { label: string; qty: number; rate: number; notes: string | null; qty_factors: unknown; rate_id: string | null; sort_order: number }[])
    .map((i) => ({ estimate_id: created.id, label: i.label, qty: i.qty, rate: i.rate, notes: i.notes, qty_factors: i.qty_factors, rate_id: i.rate_id, sort_order: i.sort_order }))
  if (items.length > 0) {
    const { error: itemsError } = await admin.from('estimate_items').insert(items)
    if (itemsError) throw new Error(itemsError.message)
  }

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
  const label = String(formData.get('label') ?? '').trim().slice(0, 80)
  if (!label) throw new Error('Label is required')
  const unit = String(formData.get('unit') ?? '').trim().slice(0, 60) || null

  const { error } = await admin.from('pricing_rates').update({ rate, label, unit }).eq('id', rateId)
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

// ─── Estimate reviews ────────────────────────────────────────────────────────

// Pings another admin by email with a link to this course's estimate; the
// review row drives the "please take a look" banner they see on the page.
export async function requestEstimateReview(instanceId: string, formData: FormData) {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const reviewerId = String(formData.get('reviewer_id') ?? '')
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null
  if (!reviewerId) throw new Error('Pick who should review')
  if (reviewerId === user.id) throw new Error('Pick someone other than yourself')
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured in this environment')

  const [{ data: reviewer }, { data: requester }, { data: inst }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, email, role').eq('id', reviewerId).single(),
    admin.from('profiles').select('first_name, last_name, email').eq('id', user.id).single(),
    admin.from('course_instances').select('ref_number, course_type, custom_title, client_name, starts_at').eq('id', instanceId).single(),
  ])
  if (!inst) throw new Error('Course not found')
  if (reviewer?.role !== 'admin' || !reviewer.email) throw new Error('Reviewer must be an admin with an email')

  const { error } = await admin.from('estimate_reviews').insert({
    instance_id: instanceId,
    requested_by: user.id,
    reviewer_id: reviewerId,
    note,
  })
  if (error) throw new Error(error.message)

  const { courseShortName } = await import('@/lib/courses')
  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const requesterName = [requester?.first_name, requester?.last_name].filter(Boolean).join(' ') || 'An admin'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
  const link = `${siteUrl}/admin/courses/${instanceId}#estimates`

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
    to: [reviewer.email],
    replyTo: requester?.email ?? undefined,
    subject: `Estimate review — ${courseName}${inst.client_name ? ` (${inst.client_name})` : ''}`,
    text: [
      `${requesterName} asked you to look over the price estimate for ${courseName}${inst.client_name ? ` (${inst.client_name})` : ''}${inst.starts_at ? `, starting ${inst.starts_at}` : ''}.`,
      '',
      note ? `"${note}"` : null,
      note ? '' : null,
      link,
      '',
      'The Estimates section has a banner where you can approve it or send notes back — or just edit the numbers directly.',
    ].filter((l): l is string => l !== null).join('\n'),
  })
  if (sendError) throw new Error(`Email failed: ${sendError.message}`)

  revalidatePath(`/admin/courses/${instanceId}`)
}

// Reviewer approves or sends notes back; the requester gets an email either way.
export async function respondEstimateReview(reviewId: string, formData: FormData) {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: review } = await admin
    .from('estimate_reviews')
    .select('id, instance_id, requested_by, reviewer_id, responded_at')
    .eq('id', reviewId)
    .single()
  if (!review || review.reviewer_id !== user.id) throw new Error('Review not found')
  if (review.responded_at) throw new Error('This review was already answered')

  const approved = formData.get('approved') === 'true'
  const responseNote = String(formData.get('response_note') ?? '').trim().slice(0, 2000) || null
  if (!approved && !responseNote) throw new Error('Approve it or write a note first')

  const { error } = await admin
    .from('estimate_reviews')
    .update({ approved, response_note: responseNote, responded_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)

  if (process.env.RESEND_API_KEY) {
    const [{ data: requester }, { data: reviewer }, { data: inst }] = await Promise.all([
      admin.from('profiles').select('email').eq('id', review.requested_by).single(),
      admin.from('profiles').select('first_name, last_name, email').eq('id', user.id).single(),
      admin.from('course_instances').select('course_type, custom_title, client_name').eq('id', review.instance_id).single(),
    ])
    if (requester?.email && inst) {
      const { courseShortName } = await import('@/lib/courses')
      const courseName = courseShortName(inst.course_type, inst.custom_title)
      const reviewerName = [reviewer?.first_name, reviewer?.last_name].filter(Boolean).join(' ') || 'The reviewer'
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
        to: [requester.email],
        replyTo: reviewer?.email ?? undefined,
        subject: `${reviewerName} ${approved ? 'approved' : 'left notes on'} the estimate — ${courseName}${inst.client_name ? ` (${inst.client_name})` : ''}`,
        text: [
          approved ? `${reviewerName} looked over the estimate and it's good to go.` : `${reviewerName} looked over the estimate and left notes:`,
          '',
          responseNote ? `"${responseNote}"` : null,
          responseNote ? '' : null,
          `${siteUrl}/admin/courses/${review.instance_id}#estimates`,
        ].filter((l): l is string => l !== null).join('\n'),
      })
    }
  }

  revalidatePath(`/admin/courses/${review.instance_id}`)
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export async function createQuote(instanceId: string, formData: FormData) {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Which COA prices this quote: explicit choice, else the newest estimate.
  // "__all__" presents every COA as a priced option the client picks from.
  const estimateId = String(formData.get('estimate_id') ?? '')
  const allCoas = estimateId === '__all__'
  let estimateQuery = admin
    .from('course_estimates')
    .select('title, margin, estimate_items(qty, rate)')
    .eq('instance_id', instanceId)
  if (allCoas) {
    estimateQuery = estimateQuery.order('created_at')
  } else if (estimateId) {
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
  let estimate = (estimates ?? [])[0] ?? null

  // No persisted estimate: the course page shows a virtual default COA that
  // only saves once touched. Persist those same defaults so the quote prices
  // from real lines instead of silently coming out $0.
  if (!allCoas && !estimate) {
    if (estimateId) throw new Error('That estimate no longer exists — reload the page and try again')
    estimate = await seedDefaultCoa(admin, instanceId)
  }

  const quotePrice = (e: { margin: number | null; estimate_items: unknown } | null) => {
    const items = (e?.estimate_items ?? []) as { qty: number; rate: number }[]
    const subtotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0)
    return Math.round(subtotal * (1 + Number(e?.margin ?? 0.25)) * 100) / 100
  }

  // Multi-option: snapshot every COA as { title, total }; the quote's own
  // total stays 0 until the client picks (it becomes the sum of the chosen).
  const options = allCoas
    ? (estimates ?? []).map((e) => ({ title: e.title, total: quotePrice(e) }))
    : null
  if (allCoas && (options?.length ?? 0) < 2) throw new Error('Need at least two COAs for an options quote')
  const total = allCoas ? 0 : quotePrice(estimate)

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
    options,
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

  // Options quotes edit per-option titles/prices; classic quotes edit the
  // single total. The stored options array is authoritative for count.
  const { data: existing } = await admin
    .from('course_quotes')
    .select('options')
    .eq('id', quoteId)
    .eq('instance_id', instanceId)
    .single()
  const existingOptions = (existing?.options ?? null) as { title: string; total: number; chosen?: boolean }[] | null

  let total = 0
  let optionsPatch: Record<string, unknown> = {}
  if (existingOptions) {
    const options = existingOptions.map((o, i) => {
      const title = String(formData.get(`opt_title_${i}`) ?? o.title).trim().slice(0, 80) || o.title
      const t = Number(formData.get(`opt_total_${i}`))
      return { ...o, title, total: Number.isFinite(t) && t >= 0 ? Math.round(t * 100) / 100 : o.total }
    })
    optionsPatch = { options }
  } else {
    total = Number(formData.get('total'))
    if (!Number.isFinite(total) || total < 0) throw new Error('Total must be a non-negative number')
  }

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
      ...(existingOptions ? optionsPatch : { total }),
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
// Accepting a multi-option quote manually (client committed by phone/email)
// records which options they chose via the form's checkboxes, same shape as
// the client-side accept.
export async function setQuoteStatus(instanceId: string, quoteId: string, status: 'sent' | 'accepted' | 'declined', formData?: FormData) {
  const admin = await requireAdmin()

  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  if (status === 'accepted') patch.accepted_at = new Date().toISOString()
  if (status === 'declined') patch.declined_at = new Date().toISOString()

  if (status === 'accepted') {
    const { data: quote } = await admin
      .from('course_quotes')
      .select('options')
      .eq('id', quoteId)
      .eq('instance_id', instanceId)
      .single()
    const options = (quote?.options ?? null) as { title: string; total: number; chosen?: boolean }[] | null
    if (options) {
      const selected = new Set(
        (formData?.getAll('chosen_opt') ?? [])
          .map(Number)
          .filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)
      )
      if (selected.size === 0) throw new Error('Check which option(s) the client accepted first')
      const flagged = options.map((o, i) => ({ ...o, chosen: selected.has(i) }))
      patch.options = flagged
      patch.total = Math.round(flagged.filter((o) => o.chosen).reduce((s, o) => s + Number(o.total), 0) * 100) / 100
    }
  }

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
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
// Copies one COA from another course into this one (the picker's per-COA copy).
export async function copyEstimateCoaFrom(instanceId: string, estimateId: string) {
  const admin = await requireAdmin()
  const { data: src } = await admin
    .from('course_estimates')
    .select('title, margin, instance_id, estimate_items(label, qty, rate, notes, qty_factors, rate_id, sort_order)')
    .eq('id', estimateId)
    .single()
  if (!src || src.instance_id === instanceId) throw new Error('Estimate not found')

  const { data: source } = await admin.from('course_instances').select('ref_number').eq('id', src.instance_id).single()
  const suffix = source ? ` (from PR-${String(source.ref_number).padStart(4, '0')})` : ' (copy)'

  const { data: created, error } = await admin
    .from('course_estimates')
    .insert({ instance_id: instanceId, title: `${src.title}${suffix}`.slice(0, 80), margin: src.margin })
    .select('id')
    .single()
  if (error || !created) throw new Error(error?.message ?? 'Could not copy estimate')

  const items = ((src.estimate_items ?? []) as { label: string; qty: number; rate: number; notes: string | null; qty_factors: unknown; rate_id: string | null; sort_order: number }[])
    .map((i) => ({ estimate_id: created.id, label: i.label, qty: i.qty, rate: i.rate, notes: i.notes, qty_factors: i.qty_factors, rate_id: i.rate_id, sort_order: i.sort_order }))
  if (items.length > 0) {
    const { error: itemsError } = await admin.from('estimate_items').insert(items)
    if (itemsError) throw new Error(itemsError.message)
  }

  revalidatePath(`/admin/courses/${instanceId}`)
}

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
