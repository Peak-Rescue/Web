// Server-side helper: clone every estimate (COA) from one course instance to
// another, items and notes included. Used when creating a course from a
// similar past one and by the "copy from previous course" action.

import { type createAdminClient } from '@/lib/supabase/admin'
import { round2 } from '@/lib/expenses'

// The one place that answers "what does this COA quote at?" — the calculated
// cost + margin, unless a hand-set price_override replaces it. The panel, the
// COA comparison, the copy picker and quote creation all go through here, so
// they can't drift into showing different numbers for the same COA.
export function coaPrice(e: {
  margin: number | null
  price_override?: number | string | null
  items: { qty: number | null; rate: number }[]
}): number {
  if (e.price_override !== null && e.price_override !== undefined) return round2(Number(e.price_override))
  const subtotal = e.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
  return round2(subtotal * (1 + Number(e.margin ?? 0.25)))
}

// The margin an overridden price actually implies, so setting one doesn't
// silently hide what it did to the margin. Null when there is no cost to
// measure against.
export function impliedMargin(subtotal: number, price: number): number | null {
  if (subtotal <= 0) return null
  return price / subtotal - 1
}

// How many instructors an estimate is built for. The course details govern,
// always: instructor_slots is the number the course is planned around, and it
// is what the client is quoted for. The staffing roster deliberately does not
// win — quoting happens before anyone is assigned (so the roster is usually
// empty), partial staffing does not mean the plan shrank, and an instructor
// added late for auditing or shadowing arrives after the quote went out and
// must not move its price. The roster is only a fallback for a course whose
// details never got a slot count, and one is the floor either way, because a
// course with nobody on it still costs a day of somebody's time to quote.
export function plannedInstructorCount(
  course: { instructor_slots: number | null },
  assignedCount: number
): number {
  return Math.max(course.instructor_slots ?? assignedCount, 1)
}

// One place that answers "what number does the course itself put on this
// factor?" — for both the quantity a new line is prefilled with and the check
// for lines still carrying the numbers the course had when they were written.
// Two copies of these rules is how the estimator came to seed lodging with a
// night at each end while insisting those nights were stale.
//
// Word tests rather than exact labels, so renaming a rate in the library does
// not silently change what it means.
export type FactorCounts = { instructors: number; students: number | null; days: number | null }

// Costs that run a day longer at each end of the course: people arrive the
// night before the first day and leave the morning after the last, so they
// sleep, eat, and keep the vehicle for two days the course itself does not
// have.
export function spansTravelDays(label: string): boolean {
  return /lodging|hotel|meal|vehicle|rental|fuel/i.test(label)
}

export function daysForLine(label: string, days: number): number {
  return days + (spansTravelDays(label) ? 2 : 0)
}

// Travel days are out and back — two, whatever the course's length.
function isTravelLine(label: string): boolean {
  return /travel/i.test(label)
}

// Filler for the admin burden a complicated course carries, priced by feel.
// The course length says nothing about it: twelve field days are not twelve
// days of paperwork. Nothing is derived, so nothing is ever called stale.
function isJudgmentLine(label: string): boolean {
  return /admin|miscellan|\bmisc\b/i.test(label)
}

// The course's own value for a named factor, or null when the course cannot
// know it — an unknown name, a number nobody can derive, or a count the
// details never got.
export function factorValue(name: string, label: string, counts: FactorCounts): number | null {
  const n = name.trim().toLowerCase()
  // The library says instructor, student or participant — never "person",
  // which read as staff to the code and as everybody to the person adding a
  // rate. "person" is still understood, for lines written before the rename
  // and for factor names typed by hand, and still means staff.
  if (n.startsWith('instructor') || n.startsWith('person') || n.startsWith('people') || n.startsWith('staff')) {
    return counts.instructors || null
  }
  if (n.startsWith('participant') || n.startsWith('attendee')) {
    return counts.students === null ? null : counts.instructors + counts.students
  }
  if (n.startsWith('student')) return counts.students
  if (n.startsWith('day') || n.startsWith('night')) {
    if (isTravelLine(label) || isJudgmentLine(label) || counts.days === null) return null
    return daysForLine(label, counts.days)
  }
  return null
}

// What to put in the box when a line is first added, or null for a number
// only a person can supply — miles driven, days of admin burden, meals bought.
// Those arrive blank and say they need a number, because a plausible-looking
// 1 is the kind of wrong that survives all the way into a quote: it prices a
// five-hundred-mile drive at one mile and reads, at a glance, like a figure
// somebody chose.
//
// Travel is the one number known without the course: out and back.
export function prefillFactor(name: string, label: string, counts: FactorCounts): number | null {
  const known = factorValue(name, label, counts)
  if (known !== null) return known
  const n = name.trim().toLowerCase()
  if ((n.startsWith('day') || n.startsWith('night')) && isTravelLine(label)) return 2
  return null
}

// A rate's unit as factor names: "per instructor per day" → ['instructors',
// 'days'].
export function unitFactorNames(unit: string | null): string[] {
  if (!unit) return []
  return unit
    .replace(/^per\s+/, '')
    .split(/\s+per\s+/)
    .map((f) => (f.endsWith('s') ? f : `${f}s`))
}

export type SeedCounts = { instructors: number; days: number; students: number | null }

// Quantity for a seeded default estimate line, from the rate's unit and the
// same rules the panel prefills with. Null quantity = nobody can guess this
// one; the line is seeded blank and asks to be filled in.
export function guessSeedQty(
  rate: { label: string; unit: string | null },
  counts: SeedCounts
): { qty: number | null; factors: number[] | null } {
  const names = unitFactorNames(rate.unit)
  if (names.length === 0) return { qty: null, factors: null }
  const values = names.map((n) => prefillFactor(n, rate.label, counts))
  if (values.some((v) => v === null)) return { qty: null, factors: null }
  const known = values as number[]
  return { qty: known.reduce((p, v) => p * v, 1), factors: known.length >= 2 ? known : null }
}

export async function cloneEstimates(
  admin: ReturnType<typeof createAdminClient>,
  sourceInstanceId: string,
  targetInstanceId: string,
  titleSuffix?: string
): Promise<number> {
  const { data: sources } = await admin
    .from('course_estimates')
    .select('title, margin, estimate_items(label, qty, rate, notes, qty_factors, rate_id, drift_ack, sort_order)')
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

    const items = ((src.estimate_items ?? []) as { label: string; qty: number | null; rate: number; notes: string | null; qty_factors: unknown; rate_id: string | null; drift_ack: unknown; sort_order: number }[])
      .map((i) => ({ estimate_id: created.id, label: i.label, qty: i.qty, rate: i.rate, notes: i.notes, qty_factors: i.qty_factors, rate_id: i.rate_id, drift_ack: i.drift_ack, sort_order: i.sort_order }))
    if (items.length > 0) {
      const { error: itemsError } = await admin.from('estimate_items').insert(items)
      if (itemsError) throw new Error(itemsError.message)
    }
    cloned++
  }
  return cloned
}
