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
  per_diem: 'Meals covered',
  other: 'Other',
}

// Retired receipt-based meal categories: no longer selectable (meal receipts
// go under 'Other'), kept so existing reports and PDFs still render.
export const MEAL_CATEGORIES: ExpenseCategory[] = ['breakfast', 'lunch', 'dinner']

// Categories whose amount is computed from a quantity × rate, not typed in.
export const COMPUTED_CATEGORIES: ExpenseCategory[] = ['personal_auto', 'per_diem']

// Flat meal coverage is restricted to FLSA-exempt employees.
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
