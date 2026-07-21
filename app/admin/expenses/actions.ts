'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
