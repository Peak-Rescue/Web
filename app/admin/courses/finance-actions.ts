'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

export type EstimateItemInput = { label: string; qty: number; rate: number }

// Replace-style save keeps the action simple and the client authoritative
// while typing (the panel debounces calls, expense-editor style).
export async function saveEstimate(
  instanceId: string,
  input: { margin: number; items: EstimateItemInput[] }
) {
  const admin = await requireAdmin()
  if (!Number.isFinite(input.margin) || input.margin < 0 || input.margin > 5) {
    throw new Error('Invalid margin')
  }

  const { data: estimate, error: upsertError } = await admin
    .from('course_estimates')
    .upsert({ instance_id: instanceId, margin: input.margin }, { onConflict: 'instance_id' })
    .select('id')
    .single()
  if (upsertError || !estimate) throw new Error(upsertError?.message ?? 'Could not save estimate')

  const { error: delError } = await admin.from('estimate_items').delete().eq('estimate_id', estimate.id)
  if (delError) throw new Error(delError.message)

  const rows = input.items
    .filter((i) => i.label.trim())
    .map((i, idx) => ({
      estimate_id: estimate.id,
      label: i.label.trim().slice(0, 200),
      qty: Number.isFinite(i.qty) ? i.qty : 0,
      rate: Number.isFinite(i.rate) ? i.rate : 0,
      sort_order: idx,
    }))
  if (rows.length > 0) {
    const { error } = await admin.from('estimate_items').insert(rows)
    if (error) throw new Error(error.message)
  }

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

export async function createQuote(instanceId: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: inst }, { data: estimate }, { data: lastQuote }, { data: profile }] = await Promise.all([
    admin
      .from('course_instances')
      .select('course_type, custom_title, client_name, location, starts_at, ends_at, max_students')
      .eq('id', instanceId)
      .single(),
    admin.from('course_estimates').select('margin, estimate_items(qty, rate)').eq('instance_id', instanceId).maybeSingle(),
    admin.from('course_quotes').select('quote_seq').eq('instance_id', instanceId).order('quote_seq', { ascending: false }).limit(1).maybeSingle(),
    user ? admin.from('profiles').select('first_name, last_name, email').eq('id', user.id).single() : { data: null },
  ])
  if (!inst) throw new Error('Course not found')

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
  }
  if (status === 'accepted' && inst && ['tentative', 'quoted'].includes(inst.status)) {
    await admin.from('course_instances').update({ status: 'confirmed' }).eq('id', instanceId)
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

// Emails the quote link to the course's point of contact and marks it sent.
export async function sendQuote(instanceId: string, quoteId: string) {
  const admin = await requireAdmin()

  const [{ data: quote }, { data: inst }] = await Promise.all([
    admin.from('course_quotes').select('quote_seq, status, accept_token, total, prepared_by_name, prepared_by_email').eq('id', quoteId).eq('instance_id', instanceId).single(),
    admin.from('course_instances').select('ref_number, course_type, custom_title, client_name, contact_name, contact_email, starts_at, ends_at').eq('id', instanceId).single(),
  ])
  if (!quote || !inst) throw new Error('Quote not found')
  if (quote.status !== 'draft') throw new Error('Only draft quotes can be sent')
  if (!inst.contact_email) throw new Error('The course has no point-of-contact email — add one in Details first')
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

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: 'Peak Rescue Mountain Guides <noreply@peak-rescue.com>',
    to: [inst.contact_email],
    cc: quote.prepared_by_email ? [quote.prepared_by_email] : undefined,
    replyTo: quote.prepared_by_email ?? undefined,
    subject: `Peak Rescue Quote ${qNum} — ${courseName}`,
    text: [
      `${inst.contact_name ?? 'Hello'},`,
      '',
      `Thank you for the opportunity — your quote for ${courseName}${inst.client_name ? ` (${inst.client_name})` : ''}, ${dates}, is ready:`,
      '',
      link,
      '',
      'The page has the full details and a button to accept and lock in your dates. You can also print or save it as a PDF from your browser.',
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
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath('/admin/courses')
  revalidatePath('/admin')
}
