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
