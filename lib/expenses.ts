// Shared expense-report logic: categories, rate lookup, and amount math.
// Pure functions — used server-side for authoritative amounts and client-side
// for live preview in the form. The server always recomputes; the client
// preview is cosmetic.

// Current reimbursement prices, read from the pricing_rates library
// (rows tagged reimb_type). Items snapshot rate_used at save time, so
// changing a library rate never rewrites existing reports.
export type CurrentRates = {
  mileage: number // $ per mile
  meal: number // $ per meal
}

export type ExpenseCategory =
  | 'air_fare'
  | 'auto_rental'
  | 'transport'
  | 'personal_auto'
  | 'lodging'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'per_diem'
  | 'other'

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  air_fare: 'Air fare',
  auto_rental: 'Auto rental',
  transport: 'Parking, tolls, gas & other transport',
  personal_auto: 'Personal auto (mileage)',
  lodging: 'Lodging',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  per_diem: 'Per diem',
  other: 'Other',
}

// Retired receipt-based meal categories: no longer selectable (meal receipts
// go under 'Other'), kept so existing reports and PDFs still render.
export const MEAL_CATEGORIES: ExpenseCategory[] = ['breakfast', 'lunch', 'dinner']

// Categories whose amount is computed from a quantity × rate, not typed in.
export const COMPUTED_CATEGORIES: ExpenseCategory[] = ['personal_auto', 'per_diem']

// Per diem is restricted to FLSA-exempt employees.
export function categoriesFor(isExempt: boolean): ExpenseCategory[] {
  const all = (Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).filter(
    (c) => !MEAL_CATEGORIES.includes(c)
  )
  return isExempt ? all : all.filter((c) => c !== 'per_diem')
}

export function daysInRange(startDate: string, endDate: string | null): number {
  if (!endDate || endDate <= startDate) return 1
  const ms = Date.parse(endDate) - Date.parse(startDate)
  return Math.round(ms / 86_400_000) + 1
}

export type ItemInput = {
  category: ExpenseCategory
  start_date: string
  end_date: string | null
  miles: number | null
  meal_count: number | null
  amount: number | null // user-entered amount for non-computed categories
}

// Authoritative amount + rate snapshot for an item, at the current library
// rates. Mirrors the sheet's ROUND(miles * rate, 2); covered meals are
// meals × per-meal rate.
export function computeItem(
  item: ItemInput,
  rates: CurrentRates
): { amount: number; rate_used: number | null } {
  if (item.category === 'personal_auto') {
    const miles = item.miles ?? 0
    return { amount: round2(miles * rates.mileage), rate_used: rates.mileage }
  }
  if (item.category === 'per_diem') {
    const meals = item.meal_count ?? 0
    return { amount: round2(meals * rates.meal), rate_used: rates.meal }
  }
  return { amount: round2(item.amount ?? 0), rate_used: null }
}

// Whether a line is one a receipt is expected for. Mileage and per diem are
// worked out from a rate and a count — there is no receipt to have, and asking
// for one would be asking for something that does not exist. Everything else
// was bought from somebody, company card included: the card statement says an
// amount left the account, and the receipt says what it bought.
export function itemNeedsReceipt(item: { category: ExpenseCategory }): boolean {
  return !COMPUTED_CATEGORIES.includes(item.category)
}

// The lines a receipt is expected for and missing from. Not a block — a
// receipt can genuinely be lost, and a report held hostage to one is a report
// filed late or not at all — so this is what the question before submitting is
// asked about, and it names the lines rather than counting them.
export function itemsMissingReceipts<T extends { category: ExpenseCategory; receipts: unknown[] }>(
  items: T[]
): T[] {
  return items.filter((i) => itemNeedsReceipt(i) && i.receipts.length === 0)
}

// Whether a line still has to say what it was for. Course actuals roll this
// money up per course, so a line that names neither a course nor overhead is
// money the books cannot place. The report's default course counts — a
// single-course trip needs no per-item links — and `non_course` is the
// deliberate no, which is the whole reason it exists as a flag rather than as
// an empty instance_id.
export function itemIsUnclassified(
  item: { instance_id: string | null; non_course: boolean },
  reportDefaultInstanceId: string | null
): boolean {
  if (item.non_course) return false
  return !(item.instance_id ?? reportDefaultInstanceId)
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function fmtDateRange(startDate: string, endDate: string | null): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
  return endDate && endDate !== startDate ? `${fmt(startDate)}–${fmt(endDate)}` : fmt(startDate)
}

// Column totals in the Harken layout, split by payment method.
export type ReportTotals = {
  personal: number
  companyCard: number
  total: number
  byCategory: Partial<Record<ExpenseCategory, number>>
}

export function computeTotals(
  items: { category: ExpenseCategory; paid_by: 'personal' | 'company_card'; amount: number }[]
): ReportTotals {
  const t: ReportTotals = { personal: 0, companyCard: 0, total: 0, byCategory: {} }
  for (const it of items) {
    t.total = round2(t.total + it.amount)
    if (it.paid_by === 'company_card') t.companyCard = round2(t.companyCard + it.amount)
    else t.personal = round2(t.personal + it.amount)
    t.byCategory[it.category] = round2((t.byCategory[it.category] ?? 0) + it.amount)
  }
  return t
}

// Balance due to the employee = personal-paid only (company card nets to zero;
// no cash advances in practice).
export function balanceDueEmployee(totals: ReportTotals): number {
  return totals.personal
}

// One-line label for an item. Description is optional: when it's blank, the
// first line of the long-form details stands in, so an "Other" expense whose
// story is already in Details doesn't have to be typed twice.
export function itemLabel(item: { description: string | null; details: string | null }): string | null {
  const desc = item.description?.trim()
  if (desc) return desc
  const firstLine = item.details?.split('\n').map((l) => l.trim()).find(Boolean)
  return firstLine ?? null
}

// Description suggestions per category. The recurring ones come from what
// instructors have actually filed (82 line items as of Sept 2026); the rest are
// plausible additions. Offered as a datalist: the common case is one click,
// anything else is still free text. Not validated anywhere, and a fee filed
// under either of two categories has never bounced back from accounting —
// baggage appears under both air fare and transport on purpose.
export const DESCRIPTION_SUGGESTIONS: Partial<Record<ExpenseCategory, string[]>> = {
  // 14 of 24 mileage lines are one of these two runs.
  personal_auto: ['Old Colorado City to Fort Carson', 'Old Colorado City to Elevenmile Canyon'],
  air_fare: ['Airfare', 'Round trip airfare', 'Checked bag fee', 'Baggage fee', 'Seat / carry-on fee', 'Flight change fee'],
  transport: ['Airport parking', 'Parking', 'Fuel', 'Tolls', 'Taxi', 'Rideshare', 'Airport shuttle', 'Baggage fee'],
  auto_rental: ['Rental car', 'Rental car refuel', 'Rental insurance'],
  lodging: ['Lodging', 'Hotel', 'Campground fee', 'Cabin / Airbnb'],
  other: [
    'Meals — crew',
    'Meals — crew and client',
    'Shipping of course gear',
    'Student supplies',
    'Stove fuel',
    'Permit fee',
    'Ice',
    'Printing / copies',
    'Gear repair',
  ],
}

// ─── Grouping a report's lines by what they were for ──────────────────────────

/** One course's worth of lines out of a single report, with its own subtotal.
    `instanceId` is null for the two non-course groups, which is why the group
    carries a separate `key` — a Map and a React list both need one. */
export type CourseGroup<T> = {
  key: string
  instanceId: string | null
  label: string
  items: T[]
  total: number
}

type GroupableItem = {
  instance_id: string | null
  non_course: boolean
  amount: number
  start_date: string
}

/** A report's lines split by the course they were spent on, in the order the
    trips happened (earliest line first), with overhead and then anything that
    still names nothing at the end.
 *
 *  A line's own course wins; the report's default stands in where it names
 *  none, because that is what the books do with it — so a single-course report
 *  comes back as exactly one group, and callers can leave the list flat rather
 *  than dressing one group in headers and a subtotal that only repeats the
 *  report total. One report still goes to the approver as one claim; this is
 *  only about being able to read what was spent where. */
export function groupItemsByCourse<T extends GroupableItem>(
  items: T[],
  reportDefaultInstanceId: string | null,
  labelForInstance: (instanceId: string) => string | undefined
): CourseGroup<T>[] {
  const groups = new Map<string, CourseGroup<T>>()

  for (const item of items) {
    const instanceId = item.non_course ? null : item.instance_id ?? reportDefaultInstanceId
    const key = item.non_course ? 'overhead' : instanceId ?? 'unclassified'
    const label = item.non_course
      ? 'Overhead'
      : instanceId
        ? labelForInstance(instanceId) ?? 'Another course'
        : 'No course yet'

    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
      existing.total = round2(existing.total + item.amount)
    } else {
      groups.set(key, { key, instanceId, label, items: [item], total: round2(item.amount) })
    }
  }

  // Courses in trip order; the two groups that are not a course sit after them,
  // with the unanswered one last because it is the one still asking something.
  const rank = (g: CourseGroup<T>) => (g.key === 'unclassified' ? 2 : g.key === 'overhead' ? 1 : 0)
  const earliest = (g: CourseGroup<T>) => g.items.reduce((min, i) => (i.start_date < min ? i.start_date : min), g.items[0].start_date)
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (earliest(a) < earliest(b) ? -1 : 1))
}
