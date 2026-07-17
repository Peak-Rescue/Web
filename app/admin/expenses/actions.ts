'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type RateType } from '@/lib/expenses'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user
}

function revalidateExpenses() {
  revalidatePath('/admin/expenses')
  revalidatePath('/admin/expenses/rates')
  revalidatePath('/instructor/expenses')
}

export async function adminAddRate(formData: FormData) {
  await requireAdmin()

  const rateType = String(formData.get('rate_type') ?? '') as RateType
  const rate = Number(formData.get('rate'))
  const effectiveDate = String(formData.get('effective_date') ?? '')

  if (!['mileage', 'per_diem_meal'].includes(rateType)) throw new Error('Invalid rate type')
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Rate must be a non-negative number')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error('Effective date is required')

  const { error } = await createAdminClient()
    .from('expense_rates')
    .upsert(
      { rate_type: rateType, rate, effective_date: effectiveDate },
      { onConflict: 'rate_type,effective_date' }
    )

  if (error) throw new Error(error.message)
  revalidateExpenses()
}

export async function adminDeleteRate(rateId: string) {
  await requireAdmin()

  const admin = createAdminClient()

  // Never delete the last remaining rate of a type — the form math needs one.
  const { data: target } = await admin
    .from('expense_rates')
    .select('rate_type')
    .eq('id', rateId)
    .single()
  if (!target) return

  const { count } = await admin
    .from('expense_rates')
    .select('id', { count: 'exact', head: true })
    .eq('rate_type', target.rate_type)
  if ((count ?? 0) <= 1) throw new Error('Cannot delete the only rate of this type')

  const { error } = await admin.from('expense_rates').delete().eq('id', rateId)
  if (error) throw new Error(error.message)
  revalidateExpenses()
}

export async function adminDeleteReport(reportId: string) {
  await requireAdmin()

  const admin = createAdminClient()

  // Remove receipt files from storage first, then the report (items/receipts cascade).
  const { data: items } = await admin
    .from('expense_items')
    .select('id, expense_receipts(path)')
    .eq('report_id', reportId)
  const paths = (items ?? []).flatMap((i) =>
    ((i.expense_receipts ?? []) as { path: string }[]).map((r) => r.path)
  )
  if (paths.length > 0) {
    await admin.storage.from('expense-receipts').remove(paths)
  }

  const { error } = await admin.from('expense_reports').delete().eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidateExpenses()
}
