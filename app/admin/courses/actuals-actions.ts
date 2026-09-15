'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { round2 } from '@/lib/expenses'

// Writes for the course's actuals — what it really cost and what we really
// billed. Admin-only, like the whole of the pricing page: requireAdminUser
// gates every one of these, because a server action is callable directly and
// the page's own gate protects nothing.

function revalidateCourse(instanceId: string) {
  revalidatePath(`/portal/${instanceId}`)
  revalidatePath('/admin/courses')
}

/** The actuals row, made on first touch. Every write below goes through here,
    so a course that has never been reconciled carries no row at all — an
    empty row and no row would otherwise be two ways of saying nothing, and
    the year's totals would have to know the difference. */
async function ensureActuals(instanceId: string) {
  const { admin } = await requireAdminUser()
  const { data: existing } = await admin
    .from('course_actuals')
    .select('id')
    .eq('instance_id', instanceId)
    .maybeSingle()
  if (existing) return { admin, id: existing.id as string }

  const { data, error } = await admin
    .from('course_actuals')
    .insert({ instance_id: instanceId })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not start the actuals for this course')
  return { admin, id: data.id as string }
}

function money(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).replace(/[$,\s]/g, '')
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) throw new Error('That is not an amount')
  return round2(n)
}

// ─── The course's own numbers ────────────────────────────────────────────────

export async function saveActualsHeader(
  instanceId: string,
  input: { invoiced: string | null; payrollLoadPct: number | null; notes: string | null }
) {
  const { admin } = await ensureActuals(instanceId)
  // Null is the ordinary case: this course follows the org-wide load. A
  // number here is a deliberate override of it.
  if (input.payrollLoadPct !== null && !(input.payrollLoadPct >= 0 && input.payrollLoadPct < 10)) {
    throw new Error('Payroll load has to be a percentage')
  }
  const { error } = await admin
    .from('course_actuals')
    .update({
      invoiced: money(input.invoiced),
      payroll_load_pct: input.payrollLoadPct,
      notes: input.notes?.trim() || null,
    })
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
}

/** Says the books on this course are done. Locks nothing — a number that
    turns out wrong still has to be fixable — it only tells a year-end total
    which courses have stopped moving. */
export async function setActualsClosed(instanceId: string, closed: boolean) {
  const { admin } = await ensureActuals(instanceId)
  const { error } = await admin
    .from('course_actuals')
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
}

// ─── Pay ─────────────────────────────────────────────────────────────────────

export type PayItemInput = {
  profile_id: string | null
  work_date: string | null
  description: string | null
  amount: string
}

export async function savePayItem(instanceId: string, itemId: string | null, input: PayItemInput) {
  const { admin } = await ensureActuals(instanceId)
  const row = {
    instance_id: instanceId,
    profile_id: input.profile_id || null,
    work_date: input.work_date || null,
    description: input.description?.trim() || null,
    amount: money(input.amount) ?? 0,
  }
  if (itemId) {
    const { error } = await admin.from('course_pay_items').update(row).eq('id', itemId).eq('instance_id', instanceId)
    if (error) throw new Error(error.message)
    revalidateCourse(instanceId)
    return { id: itemId }
  }
  const { data, error } = await admin.from('course_pay_items').insert(row).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Could not save that pay line')
  revalidateCourse(instanceId)
  return { id: data.id as string }
}

/** Accepts the suggestion built from the course's shape, as ordinary lines.
    They arrive editable and unmarked — once accepted they are what we paid,
    not what we guessed, and a line that remembered being a guess would invite
    the next reader to trust it less than the ones typed beside it. */
export async function addSuggestedPayLines(
  instanceId: string,
  lines: { description: string; amount: number }[]
) {
  const { admin } = await ensureActuals(instanceId)
  if (lines.length === 0) return
  const { error } = await admin.from('course_pay_items').insert(
    lines.map((l, i) => ({
      instance_id: instanceId,
      description: l.description.slice(0, 200),
      amount: round2(l.amount),
      sort_order: i,
    }))
  )
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
}

export async function deletePayItem(instanceId: string, itemId: string) {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('course_pay_items').delete().eq('id', itemId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
}

// ─── Costs typed straight onto the course ────────────────────────────────────

export type CostItemInput = {
  account_id: string | null
  spend_date: string | null
  description: string | null
  amount: string
}

export async function saveCostItem(instanceId: string, itemId: string | null, input: CostItemInput) {
  const { admin } = await ensureActuals(instanceId)
  const row = {
    instance_id: instanceId,
    account_id: input.account_id || null,
    spend_date: input.spend_date || null,
    description: input.description?.trim() || null,
    amount: money(input.amount) ?? 0,
  }
  if (itemId) {
    const { error } = await admin.from('course_cost_items').update(row).eq('id', itemId).eq('instance_id', instanceId)
    if (error) throw new Error(error.message)
    revalidateCourse(instanceId)
    return { id: itemId }
  }
  const { data, error } = await admin.from('course_cost_items').insert(row).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Could not save that cost')
  revalidateCourse(instanceId)
  return { id: data.id as string }
}

export async function deleteCostItem(instanceId: string, itemId: string) {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('course_cost_items').delete().eq('id', itemId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
}

// ─── Filing an expense line under a different account ────────────────────────

/** Moves one expense-report line to another account, or back to whatever its
    category says. Only the exceptions are stored, so a line following its
    category keeps following it when the category's account changes.
    The expense itself is never touched: the instructor filed a fact, and
    which ledger column it lands in is the bookkeeper's decision, not a
    correction to their report. */
export async function setExpenseItemAccount(
  instanceId: string,
  expenseItemId: string,
  accountId: string | null
) {
  const { admin } = await requireAdminUser()
  if (accountId) {
    const { error } = await admin
      .from('expense_item_accounts')
      .upsert({ expense_item_id: expenseItemId, account_id: accountId }, { onConflict: 'expense_item_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from('expense_item_accounts').delete().eq('expense_item_id', expenseItemId)
    if (error) throw new Error(error.message)
  }
  revalidateCourse(instanceId)
}

// ─── The chart of accounts ───────────────────────────────────────────────────

/** Adds an account from the panel, because the moment you need one is the
    moment you are looking at a cost that has nowhere to go. The full library
    (renaming, retiring, which expense categories route where) lives with the
    rates on the expense admin page. */
export async function addCostAccount(instanceId: string, label: string) {
  const { admin } = await requireAdminUser()
  const trimmed = label.trim()
  if (!trimmed) throw new Error('An account needs a name')

  const { data: last } = await admin
    .from('cost_accounts')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('cost_accounts')
    .insert({ label: trimmed, sort_order: (last?.sort_order ?? 0) + 10 })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not add that account')
  revalidateCourse(instanceId)
  return { id: data.id as string }
}

// ─── Sending the actuals out ─────────────────────────────────────────────────

/** Mints the unguessable address for the read-only page, or revokes it.
    Returns the token so the panel can show the link without a round trip
    through the server component.

    Minted on request rather than at creation, and revocable, because this is
    the course's profit and loss: it should not have a public address until
    somebody decides to send it, and that decision has to be reversible. */
export async function setActualsShared(instanceId: string, shared: boolean): Promise<string | null> {
  const { admin } = await ensureActuals(instanceId)

  if (!shared) {
    const { error } = await admin
      .from('course_actuals')
      .update({ share_token: null, share_created_at: null })
      .eq('instance_id', instanceId)
    if (error) throw new Error(error.message)
    revalidateCourse(instanceId)
    return null
  }

  // An existing link is kept rather than rolled: the whole point is that the
  // address in somebody's inbox keeps working.
  const { data: existing } = await admin
    .from('course_actuals')
    .select('share_token')
    .eq('instance_id', instanceId)
    .maybeSingle()
  if (existing?.share_token) return existing.share_token as string

  const token = randomUUID()
  const { error } = await admin
    .from('course_actuals')
    .update({ share_token: token, share_created_at: new Date().toISOString() })
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
  return token
}

// ─── Org-wide numbers ────────────────────────────────────────────────────────

/** One number, edited once, for every course. Lives beside the mileage and
    meal rates on the expense admin page — same page, its own block, because
    nothing here is a rate you multiply a quantity by. */
export async function updateOrgSetting(key: string, formData: FormData) {
  const { admin } = await requireAdminUser()
  const raw = String(formData.get('value') ?? '').trim()
  const percent = Number(raw)
  if (raw === '' || !Number.isFinite(percent) || percent < 0 || percent >= 1000) {
    throw new Error('That is not a percentage')
  }
  const { error } = await admin
    .from('org_settings')
    .update({ value: percent / 100, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
  // Every course's actuals read this number, and any of them may be on screen.
  revalidatePath('/portal', 'layout')
}
