// Server-side helper: clone every estimate (COA) from one course instance to
// another, items and notes included. Used when creating a course from a
// similar past one and by the "copy from previous course" action.

import { type createAdminClient } from '@/lib/supabase/admin'

// Quantity guess for a seeded default estimate line. Label rules cover lines
// whose math isn't literal (travel days are out + back, lodging adds a travel
// night on each end); everything else derives factors from the rate's unit
// ("per person", "per student per day") the same way the panel's library
// picker does, multiplying only when the course can supply every factor.
export type SeedCounts = { instructors: number; days: number; students: number | null }

export function guessSeedQty(
  rate: { label: string; unit: string | null },
  counts: SeedCounts
): { qty: number; factors: number[] | null } {
  const { instructors, days, students } = counts
  if (rate.label === 'Instructor travel day') return { qty: instructors * 2, factors: [instructors, 2] }
  if (rate.label === 'Lodging') return { qty: instructors * (days + 2), factors: [instructors, days + 2] }

  const parts = (rate.unit ?? '').toLowerCase().replace(/^per\s+/, '').split(/\s+per\s+/).filter(Boolean)
  const factors = parts.map((name): number | null => {
    if (name.startsWith('instructor') || name.startsWith('person')) return instructors
    if (name.startsWith('day') || name.startsWith('night')) return /travel/i.test(rate.label) ? 2 : days
    if (name.startsWith('student')) return students
    return null
  })
  if (factors.length === 0 || factors.some((f) => f === null || f <= 0)) return { qty: 1, factors: null }
  const known = factors as number[]
  return { qty: known.reduce((p, f) => p * f, 1), factors: known.length >= 2 ? known : null }
}

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

    const items = ((src.estimate_items ?? []) as { label: string; qty: number; rate: number; notes: string | null; qty_factors: unknown; sort_order: number }[])
      .map((i) => ({ estimate_id: created.id, label: i.label, qty: i.qty, rate: i.rate, notes: i.notes, qty_factors: i.qty_factors, sort_order: i.sort_order }))
    if (items.length > 0) {
      const { error: itemsError } = await admin.from('estimate_items').insert(items)
      if (itemsError) throw new Error(itemsError.message)
    }
    cloned++
  }
  return cloned
}
