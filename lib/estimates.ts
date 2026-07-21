// Server-side helper: clone every estimate (COA) from one course instance to
// another, items and notes included. Used when creating a course from a
// similar past one and by the "copy from previous course" action.

import { type createAdminClient } from '@/lib/supabase/admin'

export async function cloneEstimates(
  admin: ReturnType<typeof createAdminClient>,
  sourceInstanceId: string,
  targetInstanceId: string,
  titleSuffix?: string
): Promise<number> {
  const { data: sources } = await admin
    .from('course_estimates')
    .select('title, margin, estimate_items(label, qty, rate, notes, qty_factors, sort_order)')
    .eq('instance_id', sourceInstanceId)
    .order('created_at')

  let cloned = 0
  for (const src of sources ?? []) {
    const { data: created, error } = await admin
      .from('course_estimates')
      .insert({
        instance_id: targetInstanceId,
        title: `${src.title}${titleSuffix ?? ''}`.slice(0, 80),
        margin: src.margin,
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(error?.message ?? 'Could not copy estimate')

    const items = ((src.estimate_items ?? []) as { label: string; qty: number; rate: number; notes: string | null; qty_factors: number[] | null; sort_order: number }[])
      .map((i) => ({ estimate_id: created.id, label: i.label, qty: i.qty, rate: i.rate, notes: i.notes, qty_factors: i.qty_factors, sort_order: i.sort_order }))
    if (items.length > 0) {
      const { error: itemsError } = await admin.from('estimate_items').insert(items)
      if (itemsError) throw new Error(itemsError.message)
    }
    cloned++
  }
  return cloned
}
