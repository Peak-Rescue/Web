// Shared expense-report logic: categories, rate lookup, and amount math.
// Pure functions — used server-side for authoritative amounts and client-side
// for live preview in the form. The server always recomputes; the client
// preview is cosmetic.

export type RateType = 'mileage' | 'per_diem_meal'

export type ExpenseRate = {
  id: string
  rate_type: RateType
  rate: number
  effective_date: string // yyyy-mm-dd
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

export const MEAL_CATEGORIES: ExpenseCategory[] = ['breakfast', 'lunch', 'dinner']

// Categories whose amount is computed from a quantity × rate, not typed in.
export const COMPUTED_CATEGORIES: ExpenseCategory[] = ['personal_auto', 'per_diem']

// Per diem is restricted to FLSA-exempt employees.
export function categoriesFor(isExempt: boolean): ExpenseCategory[] {
  const all = Object.keys(CATEGORY_LABELS) as ExpenseCategory[]
  return isExempt ? all : all.filter((c) => c !== 'per_diem')
}

// Latest rate whose effective_date is on or before the expense date.
export function rateFor(rates: ExpenseRate[], type: RateType, date: string): ExpenseRate | null {
  const applicable = rates
    .filter((r) => r.rate_type === type && r.effective_date <= date)
    .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))
  return applicable[0] ?? null
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

// Authoritative amount + rate snapshot for an item. Mirrors the sheet's
// ROUND(miles * rate, 2); per diem is meals × per-meal rate.
export function computeItem(
  item: ItemInput,
  rates: ExpenseRate[]
): { amount: number; rate_used: number | null } {
  if (item.category === 'personal_auto') {
    const rate = rateFor(rates, 'mileage', item.start_date)
    const miles = item.miles ?? 0
    return { amount: round2(miles * (rate?.rate ?? 0)), rate_used: rate?.rate ?? null }
  }
  if (item.category === 'per_diem') {
    const rate = rateFor(rates, 'per_diem_meal', item.start_date)
    const meals = item.meal_count ?? 0
    return { amount: round2(meals * (rate?.rate ?? 0)), rate_used: rate?.rate ?? null }
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
