'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { round2 } from '@/lib/expenses'
import { routeReassignments, DEFAULT_PAYROLL_LOAD } from '@/lib/actuals'
import { type PayTerms } from '@/lib/pay'
import { chooseRecipients, describeForBiller } from '@/lib/billing'
import { courseShortName } from '@/lib/courses'
import { sendMail } from '@/lib/mailer'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'

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

  // The payroll load is stamped on, not followed. The org-wide figure is
  // where a course starts; from here it is this course's own, so putting the
  // org number up next season cannot move a net that has already been read
  // and closed against. Re-adopting today's figure is one click in the panel.
  const { data: orgLoad } = await admin
    .from('org_settings')
    .select('value')
    .eq('key', 'payroll_load_pct')
    .maybeSingle()

  const { data, error } = await admin
    .from('course_actuals')
    .insert({
      instance_id: instanceId,
      payroll_load_pct: orgLoad ? Number(orgLoad.value) : DEFAULT_PAYROLL_LOAD,
    })
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
  instructor_id?: string | null
  profile_id: string | null
  description: string | null
  amount: string
  /** The hours and the rate behind the amount, on a line that was worked out
      rather than typed. Kept only while they still explain the figure: edit
      the amount by hand and they are dropped, because a line claiming 50 h @
      $50 beside $2,000 is worse than one that admits it is just a total. */
  hours?: number | null
  hourly_rate?: number | null
}

/** A pay line as the hourly calculator hands it over. `amount` is what the
    books add; hours and the rate ride along so the line can be checked and so
    payroll can be given hours. */
export type PayLineWrite = {
  /** Which of the staffed crew it pays. Set on everything the hourly
      calculator writes, so one person's lines can be found again when their
      rate for this course changes. */
  instructor_id?: string | null
  profile_id?: string | null
  description: string
  amount: number
  hours?: number | null
  hourly_rate?: number | null
}

/** Hours and a rate, kept only if they still multiply out to the amount —
    within a cent, because both sides are rounded money. */
function reconciledHours(
  amount: number,
  hours: number | null | undefined,
  rate: number | null | undefined
): { hours: number | null; hourly_rate: number | null } {
  if (hours === null || hours === undefined || rate === null || rate === undefined) {
    return { hours: null, hourly_rate: null }
  }
  return Math.abs(round2(hours * rate) - amount) <= 0.01
    ? { hours: round2(hours), hourly_rate: round2(rate) }
    : { hours: null, hourly_rate: null }
}

export async function savePayItem(instanceId: string, itemId: string | null, input: PayItemInput) {
  const { admin } = await ensureActuals(instanceId)
  const amount = money(input.amount) ?? 0
  const row = {
    instance_id: instanceId,
    instructor_id: input.instructor_id || null,
    profile_id: input.profile_id || null,
    description: input.description?.trim() || null,
    amount,
    ...reconciledHours(amount, input.hours, input.hourly_rate),
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
    the next reader to trust it less than the ones typed beside it.

    Returns the rows it made. The panel puts them straight into the list:
    asking the page to reload instead meant re-running every query the course
    page has, and the panel's own state would not have picked the new lines up
    anyway — so they landed in the database and appeared nowhere. */
const PAY_ITEM_COLUMNS = 'id, instructor_id, profile_id, description, amount, hours, hourly_rate'

export type SavedPayLine = {
  id: string
  instructor_id: string | null
  profile_id: string | null
  description: string | null
  amount: number
  hours: number | null
  hourly_rate: number | null
}

function savedPayLine(r: Record<string, unknown>): SavedPayLine {
  return {
    id: r.id as string,
    instructor_id: (r.instructor_id as string | null) ?? null,
    profile_id: (r.profile_id as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    amount: Number(r.amount),
    hours: r.hours === null || r.hours === undefined ? null : Number(r.hours),
    hourly_rate: r.hourly_rate === null || r.hourly_rate === undefined ? null : Number(r.hourly_rate),
  }
}

export async function addSuggestedPayLines(
  instanceId: string,
  lines: PayLineWrite[]
): Promise<SavedPayLine[]> {
  const { admin } = await ensureActuals(instanceId)
  if (lines.length === 0) return []
  const { data, error } = await admin
    .from('course_pay_items')
    .insert(lines.map((l, i) => ({ instance_id: instanceId, sort_order: i, ...payRow(l) })))
    .select(PAY_ITEM_COLUMNS)
  if (error || !data) throw new Error(error?.message ?? 'Could not add those lines')
  revalidateCourse(instanceId)
  return data.map(savedPayLine)
}

/** One written pay line, from a calculated one. Whose it is comes along: the
    hourly calculator knows the person, and a line that lands unattributed is
    one somebody has to match back to a name by reading it. */
function payRow(l: PayLineWrite) {
  const amount = round2(l.amount)
  return {
    instructor_id: l.instructor_id ?? null,
    profile_id: l.profile_id ?? null,
    description: l.description.slice(0, 200),
    amount,
    ...reconciledHours(amount, l.hours, l.hourly_rate),
  }
}

/** What this course pays somebody, and for which days — the only place those
    answers live. The rate follows the role and the course type, and the dates
    are whose week it actually was, so there is nothing standing to inherit
    and nothing here is an override of a person.

    Re-prices what is already in the list. Terms checked before anybody
    accepted anything only change the preview; changed afterwards they have to
    move the lines too, or the figure on screen and the figure in the books
    would disagree about the same week. Only the lines this calculator wrote
    are touched — a line somebody typed a total into has no hours on it, and
    stays exactly as they left it.

    `lines` is that person's pay, recomputed from the new terms by the same
    library the screen previews with.

    Returns which rows went and which arrived, so the panel can swap them
    without reloading the course page. */
export async function savePersonPayTerms(
  instanceId: string,
  instructorId: string,
  terms: PayTerms,
  lines: PayLineWrite[]
): Promise<{ removed: string[]; added: SavedPayLine[] }> {
  const { admin } = await ensureActuals(instanceId)

  const hourly = terms.fieldHourly
  if (hourly !== null && (!Number.isFinite(hourly) || hourly <= 0)) throw new Error('That is not an hourly rate')
  if (terms.travelDays !== null && (!Number.isInteger(terms.travelDays) || terms.travelDays < 0 || terms.travelDays > 10)) {
    throw new Error('That is not a number of travel days')
  }
  if (terms.hoursPerDay !== null && (!Number.isFinite(terms.hoursPerDay) || terms.hoursPerDay <= 0 || terms.hoursPerDay > 24)) {
    throw new Error('A day cannot be that many hours')
  }
  if (terms.startsAt && terms.endsAt && terms.endsAt < terms.startsAt) {
    throw new Error('Those dates are the wrong way round')
  }

  // Nothing said is no row: the terms are stored as exceptions, so a person
  // who worked the course as it stands carries nothing at all.
  const said =
    hourly !== null || terms.startsAt || terms.endsAt || terms.travelDays !== null || terms.hoursPerDay !== null
  if (!said) {
    const { error } = await admin
      .from('course_pay_rates')
      .delete()
      .eq('instance_id', instanceId)
      .eq('instructor_id', instructorId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from('course_pay_rates').upsert(
      {
        instance_id: instanceId,
        instructor_id: instructorId,
        field_hourly: hourly,
        starts_at: terms.startsAt,
        ends_at: terms.endsAt,
        travel_days: terms.travelDays,
        hours_per_day: terms.hoursPerDay,
      },
      { onConflict: 'instance_id,instructor_id' }
    )
    if (error) throw new Error(error.message)
  }

  // Their calculated lines, if any. Nothing in the list means nothing to
  // re-price: the terms are saved, and the preview says the rest.
  const { data: existing, error: findError } = await admin
    .from('course_pay_items')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('instructor_id', instructorId)
    .not('hours', 'is', null)
  if (findError) throw new Error(findError.message)
  const removed = (existing ?? []).map((r) => r.id as string)
  if (removed.length === 0) {
    revalidateCourse(instanceId)
    return { removed: [], added: [] }
  }

  // Written first, so a failure between the two leaves the old lines rather
  // than none: money missing from a page of accounts is the worse of the two
  // ways to be wrong, and a duplicate is visible.
  const { data: added, error: insertError } =
    lines.length === 0
      ? { data: [] as Record<string, unknown>[], error: null }
      : await admin
          .from('course_pay_items')
          .insert(lines.map((l, i) => ({ instance_id: instanceId, sort_order: i, ...payRow(l) })))
          .select(PAY_ITEM_COLUMNS)
  if (insertError) throw new Error(insertError.message)

  const { error: deleteError } = await admin.from('course_pay_items').delete().in('id', removed)
  if (deleteError) throw new Error(deleteError.message)

  revalidateCourse(instanceId)
  return { removed, added: (added ?? []).map(savedPayLine) }
}

/** Writes the estimate in as the actuals' starting point: its lines as costs
    at cost, and the pay suggestion beside them at the rates we actually pay.
    Called by the panel the first time anybody opens the actuals on a course
    that has a COA, so the reconciliation starts from the list somebody
    already typed upstairs instead of from an empty screen.

    Seeded once, whatever happens next. The stamp goes on even when there was
    nothing to write, because the point of it is not "lines exist" — it is
    "this course has had its chance": a line deleted on purpose must not
    reappear the next time the page is opened.

    Refuses if anything has been typed already, or if a seed has run before.
    The panel checks both before calling; this is the check that counts,
    because two tabs open on the same course would otherwise both call. */
export async function seedActualsFromEstimate(
  instanceId: string,
  seed: {
    pay: PayLineWrite[]
    costs: { account_id: string | null; description: string; amount: number }[]
  }
): Promise<{
  pay: SavedPayLine[]
  costs: { id: string; account_id: string | null; description: string | null; amount: number }[]
} | null> {
  const { admin } = await ensureActuals(instanceId)

  const [{ data: row }, { count: payCount }, { count: costCount }] = await Promise.all([
    admin.from('course_actuals').select('seeded_at').eq('instance_id', instanceId).maybeSingle(),
    admin.from('course_pay_items').select('id', { count: 'exact', head: true }).eq('instance_id', instanceId),
    admin.from('course_cost_items').select('id', { count: 'exact', head: true }).eq('instance_id', instanceId),
  ])
  if (row?.seeded_at || (payCount ?? 0) > 0 || (costCount ?? 0) > 0) return null

  // The stamp goes on first, and only onto a row that has none — so of two
  // tabs that both got past the check above, exactly one comes back holding a
  // row and the other writes nothing. Claiming the seed before writing the
  // lines is the safe order: the worst case is a course that was never seeded
  // and never will be, which is an empty list somebody types into, rather
  // than two copies of every line.
  const { data: claimed, error: stampError } = await admin
    .from('course_actuals')
    .update({ seeded_at: new Date().toISOString() })
    .eq('instance_id', instanceId)
    .is('seeded_at', null)
    .select('id')
  if (stampError) throw new Error(stampError.message)
  if ((claimed ?? []).length === 0) return null

  const [payRows, costRows] = await Promise.all([
    seed.pay.length === 0
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : admin
          .from('course_pay_items')
          .insert(seed.pay.map((l, i) => ({ instance_id: instanceId, sort_order: i, ...payRow(l) })))
          .select(PAY_ITEM_COLUMNS),
    seed.costs.length === 0
      ? Promise.resolve({ data: [] as { id: string; account_id: string | null; description: string | null; amount: number }[] })
      : admin
          .from('course_cost_items')
          .insert(
            seed.costs.map((l, i) => ({
              instance_id: instanceId,
              account_id: l.account_id,
              description: l.description.slice(0, 200),
              amount: round2(l.amount),
              sort_order: i,
            }))
          )
          .select('id, account_id, description, amount'),
  ])

  revalidateCourse(instanceId)
  return {
    pay: (payRows.data ?? []).map(savedPayLine),
    costs: (costRows.data ?? []).map((r) => ({
      id: r.id as string,
      account_id: (r.account_id as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      amount: Number(r.amount),
    })),
  }
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
  description: string | null
  amount: string
  /** How it went out, for money no feed will ever announce — a check, an ACH,
      an invoice paid from the bank. Optional: most lines are typed in a hurry
      and the method is not the point of them. */
  payment_method?: string | null
  payment_ref?: string | null
}

const PAYMENT_METHODS = ['check', 'ach', 'card', 'other']

export async function saveCostItem(instanceId: string, itemId: string | null, input: CostItemInput) {
  const { admin } = await ensureActuals(instanceId)
  const method = input.payment_method?.trim() || null
  if (method && !PAYMENT_METHODS.includes(method)) throw new Error('That is not a way of paying')
  const row = {
    instance_id: instanceId,
    account_id: input.account_id || null,
    description: input.description?.trim() || null,
    amount: money(input.amount) ?? 0,
    payment_method: method,
    payment_ref: input.payment_ref?.trim().slice(0, 60) || null,
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

// ─── Company-card charges, as seen from the course ───────────────────────────
//
// The charge itself lives with the statement it came in on (see the card
// import screen); a course only ever reads it. So the two things a course can
// say about one are the two below — which category it belongs in, and that it
// does not belong to this course at all.

/** Files a card charge under a different cost category. */
export async function setCardChargeAccount(instanceId: string, chargeId: string, accountId: string | null) {
  const { admin } = await requireAdminUser()
  const { error } = await admin
    .from('card_charges')
    .update({ account_id: accountId })
    .eq('id', chargeId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateCourse(instanceId)
}

/** Takes a charge off this course and puts it back in the pile waiting to be
    filed — rather than marking it overhead, which is a different claim than
    "not this one" and belongs to whoever works that pile. */
export async function unfileCardCharge(instanceId: string, chargeId: string) {
  const { admin } = await requireAdminUser()
  const { error } = await admin
    .from('card_charges')
    .update({ instance_id: null, non_course: false })
    .eq('id', chargeId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/card')
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

// ─── Cost categories ─────────────────────────────────────────────────────────
//
// The books call these accounts and the schema keeps that word. On screen they
// are categories: the person filling in a course's costs is sorting them into
// buckets, not keeping a ledger, and "account" read to them as a login.

/** Adds one from the panel, because the moment you need a category is the
    moment you are looking at a cost that has nowhere to go. Renaming,
    retiring and routing live on the rates page. */
export async function addCostAccount(instanceId: string, label: string) {
  const { admin } = await requireAdminUser()
  const trimmed = label.trim()
  if (!trimmed) throw new Error('A category needs a name')

  const { data: last } = await admin
    .from('cost_accounts')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('cost_accounts')
    .insert({ label: trimmed, sort_order: (last?.sort_order ?? 0) + 10 })
    .select('id, label, categories, sort_order')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not add that category')
  revalidateCourse(instanceId)
  // The whole row, so the panel can offer it in every dropdown without
  // reloading the course page to find out what it just created.
  return {
    id: data.id as string,
    label: data.label as string,
    categories: ((data.categories as string[] | null) ?? []),
    sort_order: data.sort_order as number,
  }
}

// ─── The category library, on the rates page ─────────────────────────────────

/** Rename a category, and set which expense-report categories land in it.
    Routing is exclusive: an expense category can only feed one cost category,
    so claiming one takes it off whoever had it. Two categories both claiming
    lodging would double-count it, which is worse than it landing in the wrong
    one — that at least can be seen and moved. */
export async function updateCostAccount(accountId: string, formData: FormData) {
  const { admin } = await requireAdminUser()

  const label = String(formData.get('label') ?? '').trim().slice(0, 60)
  if (!label) throw new Error('A category needs a name')
  const claimed = formData.getAll('categories').map((c) => String(c))

  const { data: all } = await admin.from('cost_accounts').select('id, categories')
  const displaced = routeReassignments(
    (all ?? []).map((a) => ({ id: a.id as string, categories: (a.categories as string[] | null) ?? [] })),
    accountId,
    claimed
  )
  for (const row of displaced) {
    const { error } = await admin.from('cost_accounts').update({ categories: row.categories }).eq('id', row.id)
    if (error) throw new Error(error.message)
  }

  const { error } = await admin
    .from('cost_accounts')
    .update({ label, categories: claimed })
    .eq('id', accountId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
  revalidatePath('/portal', 'layout')
}

/** Takes a category out of use, one of two ways depending on whether it has
    ever been used.

    Nothing has touched it: deleted outright. A category typed by mistake has
    no history worth keeping, and retiring it would leave it greyed out on
    this page for somebody to wonder about next year.

    Money has been sorted into it: retired, never deleted. Those costs keep
    pointing at it, and a course whose books are closed must not have its
    numbers move because somebody tidied the library. It stops being offered,
    and money still sitting in it surfaces on the course as needing a
    category. */
export async function retireCostAccount(accountId: string) {
  const { admin } = await requireAdminUser()

  const [{ count: costCount }, { count: filedCount }] = await Promise.all([
    admin.from('course_cost_items').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    admin.from('expense_item_accounts').select('expense_item_id', { count: 'exact', head: true }).eq('account_id', accountId),
  ])
  const used = (costCount ?? 0) > 0 || (filedCount ?? 0) > 0

  const { error } = used
    ? await admin.from('cost_accounts').update({ active: false }).eq('id', accountId)
    : await admin.from('cost_accounts').delete().eq('id', accountId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/expenses/rates')
  revalidatePath('/portal', 'layout')
}

export async function addCostAccountToLibrary(formData: FormData) {
  const { admin } = await requireAdminUser()
  const label = String(formData.get('label') ?? '').trim().slice(0, 60)
  if (!label) throw new Error('A category needs a name')

  const { data: last } = await admin
    .from('cost_accounts')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await admin
    .from('cost_accounts')
    .insert({ label, sort_order: (last?.sort_order ?? 0) + 10 })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
  revalidatePath('/portal', 'layout')
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

// ─── Sending the numbers to somebody outside ─────────────────────────────────

/** Emails the read-only actuals page to the people ticked for a course's
    numbers, with a note from whoever sent it.

    Separate from the billing handoff on purpose and in every respect: a
    different list (report_recipients, which holds no tokens), a different
    page, and a
    different thing being asked. Harken's biller is shown what an invoice
    needs; these are the numbers with pay and margin in them, sent to whoever
    is entitled to read them.

    The note is the reason this is a send and not a link to copy. A P&L
    arriving on its own invites the question it does not answer — why the
    course came in where it did — and the answer is a sentence somebody types
    while they are looking at it, not a document.

    Reports back rather than revalidating: the panel holds the link and the
    stamp, and this is not worth re-rendering the course for. */
export async function emailActuals(
  instanceId: string,
  input: { note: string; recipientIds: string[] }
): Promise<{ ok: true; token: string; sentAt: string; sentTo: string[] } | { ok: false; error: string }> {
  const { admin } = await ensureActuals(instanceId)

  const [{ data: row }, { data: inst }, { data: readers }] = await Promise.all([
    admin.from('course_actuals').select('share_token').eq('instance_id', instanceId).maybeSingle(),
    admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, starts_at, ends_at')
      .eq('id', instanceId)
      .maybeSingle(),
    admin.from('report_recipients').select('id, name, email').eq('active', true).order('name'),
  ])
  if (!inst) return { ok: false, error: 'Course not found' }

  const chosen = chooseRecipients(
    (readers ?? []).map((r) => ({ id: r.id as string, name: r.name as string, email: r.email as string })),
    input.recipientIds
  )
  if (chosen.length === 0) {
    return { ok: false, error: 'Nobody is on the list for a course\'s numbers — add somebody in Portal → Billing' }
  }
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'Email is not configured on this server' }

  // The same address every time: the point of the link is that it keeps
  // working, and a second send to the same person must not strand the first.
  let token = (row?.share_token as string | null) ?? null
  if (!token) {
    token = randomUUID()
    const { error } = await admin
      .from('course_actuals')
      .update({ share_token: token, share_created_at: new Date().toISOString() })
      .eq('instance_id', instanceId)
    if (error) return { ok: false, error: error.message }
  }

  const description = describeForBiller({
    refNumber: inst.ref_number as number,
    courseName: courseShortName(inst.course_type as string, inst.custom_title as string | null),
    clientName: inst.client_name as string | null,
    startsAt: inst.starts_at as string | null,
    endsAt: inst.ends_at as string | null,
  })
  const url = `${siteUrl()}/actuals/${token}`
  const note = input.note.trim()

  // One at a time, because a failure to reach one person is not a reason to
  // tell the sender that nobody got it.
  const sentTo: string[] = []
  for (const r of chosen) {
    const { error } = await sendMail({
      from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
      to: [r.email],
      subject: `Course numbers — ${description}`,
      text: [
        `Hi ${r.name.split(' ')[0]},`,
        '',
        'Click the link below to view the P&L for this course.',
        '',
        description,
        ...(note ? ['', note] : []),
        '',
        url,
        '',
        'Thank you,',
        'Peak Rescue',
      ].join('\n'),
    })
    if (!error) sentTo.push(r.name)
  }
  if (sentTo.length === 0) return { ok: false, error: 'Could not send that email — please try again' }

  const sentAt = new Date().toISOString()
  await admin.from('course_actuals').update({ share_sent_at: sentAt }).eq('instance_id', instanceId)
  return { ok: true, token, sentAt, sentTo }
}

// ─── Org-wide numbers ────────────────────────────────────────────────────────

/** One number, edited once, for every course. Lives beside the mileage and
    meal rates on the expense admin page — same page, its own block, because
    nothing here is a rate you multiply a quantity by. */
export async function updateOrgSetting(key: string, formData: FormData) {
  const { admin } = await requireAdminUser()
  const raw = String(formData.get('value') ?? '').trim()
  const typed = Number(raw)
  if (raw === '' || !Number.isFinite(typed) || typed < 0 || typed >= 100000) {
    throw new Error('That is not a number')
  }

  // A percentage is stored as the fraction it multiplies by; everything else
  // — dollars an hour, hours in a day, the overtime multiplier — is stored as
  // typed. The row itself says which, because the table stopped holding only
  // percentages the moment pay went hourly.
  const { data: row } = await admin.from('org_settings').select('format').eq('key', key).maybeSingle()
  const value = (row?.format ?? 'percent') === 'percent' ? typed / 100 : typed

  const { error } = await admin
    .from('org_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
  // Every course's actuals read this number, and any of them may be on screen.
  revalidatePath('/portal', 'layout')
}

// ─── The hourly rates people can be on ──────────────────────────────────────
// A library of a few numbers, because a raise is a row. The rate is its own
// key: two rows both saying $40 would be one rate entered twice.

export async function addPayFieldRate(formData: FormData) {
  const { admin } = await requireAdminUser()
  const hourly = Number(String(formData.get('hourly') ?? '').trim())
  if (!Number.isFinite(hourly) || hourly <= 0 || hourly > 10000) throw new Error('That is not an hourly rate')
  // Re-adding a retired rate brings it back rather than failing on the key.
  const { error } = await admin
    .from('pay_field_rates')
    .upsert({ hourly: round2(hourly), active: true }, { onConflict: 'hourly' })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
  revalidatePath('/portal', 'layout')
}

/** Retires a rate rather than deleting it. Somebody is on it, or was on a
    course last season that is still being read, and the number in those lines
    must not depend on this library still listing it. */
export async function retirePayFieldRate(hourly: number) {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('pay_field_rates').update({ active: false }).eq('hourly', hourly)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/expenses/rates')
  revalidatePath('/portal', 'layout')
}
