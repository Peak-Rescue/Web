// What the course actually cost, and what that leaves.
//
// Pure math, same arrangement as lib/expenses.ts: the panel previews with
// these functions while you type and the server recomputes with the same ones,
// so a number on screen and a number in the books cannot disagree.
//
// Three cost sources meet here (expense reports, typed costs, pay) and the
// arithmetic that joins them is the whole point — it is one screen's worth of
// rules that the year's profit and loss also has to apply, so it lives in a
// library rather than in the panel.

import { CATEGORY_LABELS, round2, type ExpenseCategory } from '@/lib/expenses'

/** Taxes, insurance and the rest, as a multiplier on pay. Matched by the
    column default on course_actuals, so a course whose row has never been
    touched shows the same number as one that has. Per course in the data
    because it is a running assumption rather than a fact of the org. */
export const DEFAULT_PAYROLL_LOAD = 0.25

export type CostAccount = {
  id: string
  label: string
  /** Expense-report categories that land here unless a line says otherwise. */
  categories: string[]
  sort_order: number
}

/** An expense line as the books see it. Whose report it was and whether that
    report is filed matter as much as the amount: a draft is money we expect
    to pay and have not, and counting it would move the net on the day
    somebody finally hits submit rather than on the day it was spent. */
export type ActualExpenseLine = {
  id: string
  category: string
  amount: number
  start_date: string
  description: string | null
  details: string | null
  paid_by: 'personal' | 'company_card'
  submitted: boolean
  personName: string | null
  reportId: string
}

/** What an expense line is called on a page of accounts. Its description if
    it has one, the first line of its details if the story was typed there
    instead, and its category as prose last of all — never the raw category
    key, which is how "air_fare" reached a printed PDF. */
export function expenseLineLabel(line: {
  category: string
  description: string | null
  details: string | null
}): string {
  const described = line.description?.trim()
  if (described) return described
  const firstLine = line.details?.split('\n').map((l) => l.trim()).find(Boolean)
  if (firstLine) return firstLine
  return CATEGORY_LABELS[line.category as ExpenseCategory] ?? line.category
}

export type TypedCostLine = {
  id: string
  account_id: string | null
  spend_date: string | null
  description: string | null
  amount: number
  /** Where the line came from. Typed straight onto the course, or a row of
      the company card's statement tagged to it.

      The books do not care — both are money out, in the same categories, and
      the roll-up adds them the same way. The screen cares a great deal: a
      typed line is somebody's sentence and can be corrected, while a card
      charge is a fact of the statement and the only thing to change about it
      is which course and which category it belongs to. Absent means typed,
      so every caller written before the card existed still means what it
      said. */
  source?: 'typed' | 'card'
  /** Whose card, where the export said. */
  cardholder?: string | null
  /** How a typed line was paid, for the money that reaches the books through
      no feed at all: a check to a venue, an ACH to a permit office, an invoice
      paid from the bank. The card has its own import and reimbursements have
      their reports; these are the ones only a person will ever enter, so the
      line says how it went out and carries the check or reference number that
      proves it. Null means nobody said. */
  payment_method?: 'check' | 'ach' | 'card' | 'other' | null
  payment_ref?: string | null
}

export type PayLine = {
  id: string
  profile_id: string | null
  work_date: string | null
  description: string | null
  amount: number
}

/** Where an expense line is filed: its own override if it has one, otherwise
    the account that claims its category, otherwise nowhere — an account can
    be renamed or retired out from under a line, and money with no home has to
    stay visible rather than quietly leaving the total. */
export function accountForExpense(
  line: { id: string; category: string },
  accounts: CostAccount[],
  overrides: Map<string, string>
): string | null {
  const override = overrides.get(line.id)
  if (override && accounts.some((a) => a.id === override)) return override
  return accounts.find((a) => a.categories.includes(line.category))?.id ?? null
}

/** Which categories have to give up a route, when one category claims a set
    of expense types.

    Routing is exclusive on purpose: two cost categories both claiming
    lodging would count every lodging receipt twice, and a total that is
    quietly double the truth is worse than one in the wrong bucket — the
    wrong bucket can at least be seen and moved.

    Returns only the rows that actually change, so a save that reshuffles
    nothing writes nothing. */
export function routeReassignments(
  accounts: { id: string; categories: string[] }[],
  targetId: string,
  claimed: string[]
): { id: string; categories: string[] }[] {
  if (claimed.length === 0) return []
  const out: { id: string; categories: string[] }[] = []
  for (const a of accounts) {
    if (a.id === targetId) continue
    const kept = a.categories.filter((c) => !claimed.includes(c))
    if (kept.length !== a.categories.length) out.push({ id: a.id, categories: kept })
  }
  return out
}

export type AccountRollup = {
  account: CostAccount
  /** Submitted expense-report money routed here. */
  fromExpenses: number
  /** Typed directly on the course — the company card, an invoice paid. */
  typed: number
  total: number
  expenseLines: ActualExpenseLine[]
  typedLines: TypedCostLine[]
}

/** Draft expense lines gathered into the reports they belong to, biggest
    first. Two lines in draft are almost always one person's unfiled report,
    and the only thing a reader can do about the money is ask that person to
    file it — so whose report it is matters more than the lines do. */
export function groupByReport(
  lines: ActualExpenseLine[]
): { reportId: string; personName: string | null; total: number; lines: ActualExpenseLine[] }[] {
  const byReport = new Map<string, ActualExpenseLine[]>()
  for (const l of lines) byReport.set(l.reportId, [...(byReport.get(l.reportId) ?? []), l])
  return [...byReport.entries()]
    .map(([reportId, group]) => ({
      reportId,
      personName: group.find((l) => l.personName)?.personName ?? null,
      total: round2(group.reduce((t, l) => t + l.amount, 0)),
      lines: [...group].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    }))
    .sort((a, b) => b.total - a.total)
}

/** Which categories the summary draws. A category earns its row by holding
    something: a chart of eight rows of $0.00 is a table of contents for an
    empty book, and the full chart is one click away in any cost row's
    dropdown.

    A total of zero is not proof of emptiness — two costs that cancel out are
    still a category somebody used — so the lines are what count. */
export function accountsWorthShowing(rollups: AccountRollup[]): AccountRollup[] {
  return rollups.filter(
    (r) => r.expenseLines.length > 0 || r.typedLines.length > 0 || r.total !== 0
  )
}

export type Actuals = {
  accounts: AccountRollup[]
  /** Submitted expense money whose account no longer exists. Counted in the
      costs total — the money was spent either way — and shown as its own row
      so it can be filed somewhere real. */
  unfiled: { amount: number; lines: ActualExpenseLine[] }
  /** Filed but not yet submitted. Excluded from every total; surfaced so the
      net is read knowing what is still coming. */
  pending: { amount: number; lines: ActualExpenseLine[] }
  payTotal: number
  payrollLoad: number
  /** Pay plus the load — the single line the old spreadsheet called
      INSTRUCTOR PAY. */
  instructorPay: number
  costsTotal: number
  invoiced: number
  net: number
  /** Net as a share of what was invoiced. Null when nothing was invoiced:
      a percentage of zero is not 0%, it is not a number yet. */
  netPct: number | null
}

export function rollUpActuals(input: {
  accounts: CostAccount[]
  expenseLines: ActualExpenseLine[]
  expenseAccountOverrides: Map<string, string>
  typedLines: TypedCostLine[]
  payLines: PayLine[]
  payrollLoadPct: number
  invoiced: number
}): Actuals {
  const { accounts, expenseLines, expenseAccountOverrides, typedLines, payLines } = input

  const sorted = [...accounts].sort((a, b) => a.sort_order - b.sort_order)
  const submitted = expenseLines.filter((l) => l.submitted)
  const drafts = expenseLines.filter((l) => !l.submitted)

  const placed = new Map<string, ActualExpenseLine[]>()
  const unfiledLines: ActualExpenseLine[] = []
  for (const line of submitted) {
    const accountId = accountForExpense(line, sorted, expenseAccountOverrides)
    if (!accountId) {
      unfiledLines.push(line)
      continue
    }
    const list = placed.get(accountId) ?? []
    list.push(line)
    placed.set(accountId, list)
  }

  const typedByAccount = new Map<string, TypedCostLine[]>()
  for (const line of typedLines) {
    // A typed cost with no account still counts. It sits under the first
    // account only if it names one; otherwise it joins the unfiled pile.
    const key = line.account_id && sorted.some((a) => a.id === line.account_id) ? line.account_id : ''
    const list = typedByAccount.get(key) ?? []
    list.push(line)
    typedByAccount.set(key, list)
  }

  const rollups: AccountRollup[] = sorted.map((account) => {
    const expense = placed.get(account.id) ?? []
    const typed = typedByAccount.get(account.id) ?? []
    const fromExpenses = sum(expense.map((l) => l.amount))
    const typedTotal = sum(typed.map((l) => l.amount))
    return {
      account,
      fromExpenses,
      typed: typedTotal,
      total: round2(fromExpenses + typedTotal),
      expenseLines: expense,
      typedLines: typed,
    }
  })

  const orphanTyped = typedByAccount.get('') ?? []
  const unfiledAmount = round2(sum(unfiledLines.map((l) => l.amount)) + sum(orphanTyped.map((l) => l.amount)))

  const payTotal = sum(payLines.map((l) => l.amount))
  const payrollLoad = round2(payTotal * input.payrollLoadPct)
  const instructorPay = round2(payTotal + payrollLoad)

  const costsTotal = round2(sum(rollups.map((r) => r.total)) + unfiledAmount + instructorPay)
  const net = round2(input.invoiced - costsTotal)

  return {
    accounts: rollups,
    unfiled: { amount: unfiledAmount, lines: unfiledLines },
    pending: { amount: sum(drafts.map((l) => l.amount)), lines: drafts },
    payTotal,
    payrollLoad,
    instructorPay,
    costsTotal,
    invoiced: input.invoiced,
    net,
    netPct: input.invoiced > 0 ? net / input.invoiced : null,
  }
}

function sum(ns: number[]): number {
  return round2(ns.reduce((s, n) => s + (Number(n) || 0), 0))
}

/** Pay rates as the library holds them: what a person is actually paid for a
    day, which is not what the estimator quotes a day at. */
export type PayRates = { fieldDay: number | null; travelDay: number | null }

/** The library's pay rates, found by what a line means rather than by an
    exact label — renaming "Instructor field day" in the library must not
    silently stop the suggestion working, the same rule the estimator's factor
    names follow. Null where the library carries no pay rate for that kind of
    day, which is how a fresh install says "nobody has told me what we pay".*/
export function payRatesFrom(
  rates: { label: string; pay_rate?: number | string | null }[]
): PayRates {
  const priced = rates.filter((r) => r.pay_rate !== null && r.pay_rate !== undefined)
  const rate = (match: (label: string) => boolean) => {
    const hit = priced.find((r) => match(r.label))
    return hit ? Number(hit.pay_rate) : null
  }
  // Travel is tested first and excluded from the field test, because a day of
  // somebody's time is spelled "... day" either way: a lone /instructor.*day/
  // happily claims "Instructor travel day" and pays a field day at the travel
  // rate, which is the kind of wrong that looks like a number somebody chose.
  const isTravel = (label: string) => /travel/i.test(label)
  return {
    travelDay: rate((l) => isTravel(l) && /instructor|day/i.test(l)),
    fieldDay: rate((l) => !isTravel(l) && /instructor/i.test(l) && /field|day/i.test(l)),
  }
}

export type PaySuggestionLine = { description: string; amount: number }

/** What the course's own shape says pay should come to — offered, never
    applied. The crew that actually worked it is the authority: somebody
    shadowed a day, somebody drove instead of flying, a day ran long. So this
    produces lines you can accept and then edit, and says out loud what it
    assumed.
    Travel is two days, out and back, matching what the estimator prefills. */
export function paySuggestion(
  counts: { instructors: number; days: number | null },
  rates: PayRates
): { lines: PaySuggestionLine[]; total: number; assumptions: string } | null {
  const { instructors, days } = counts
  if (!days || instructors < 1) return null
  if (rates.fieldDay === null && rates.travelDay === null) return null

  const lines: PaySuggestionLine[] = []
  if (rates.fieldDay !== null) {
    lines.push({
      description: `Field days — ${instructors} × ${days} day${days === 1 ? '' : 's'} @ ${rates.fieldDay}`,
      amount: round2(instructors * days * rates.fieldDay),
    })
  }
  if (rates.travelDay !== null) {
    lines.push({
      description: `Travel days — ${instructors} × 2 days @ ${rates.travelDay}`,
      amount: round2(instructors * 2 * rates.travelDay),
    })
  }
  return {
    lines,
    total: sum(lines.map((l) => l.amount)),
    assumptions: `${instructors} instructor${instructors === 1 ? '' : 's'}, ${days} field day${days === 1 ? '' : 's'}, 2 travel days each`,
  }
}

export const TRAVEL_DAYS_EACH_WAY = 2

/** Whether the course has reached the point where actuals are the live
    question and the estimate is history. The first day, not the last: costs
    start landing the moment the crew travels, and a course mid-run is already
    being reconciled. */
export function actualsAreLive(
  course: { starts_at: string | null; status?: string | null },
  today: string
): boolean {
  if (course.status === 'completed') return true
  if (course.status === 'cancelled') return false
  return Boolean(course.starts_at && course.starts_at <= today)
}

// ─── Starting the actuals from the estimate ──────────────────────────────────
//
// The COA already lists what the course is going to spend money on: lodging,
// a vehicle, flights, food, permits. Beginning the actuals from an empty list
// meant typing that list a second time, from memory, off a screen two folds
// up the page. So the estimate's lines arrive as cost lines — a guess to
// correct, not a number to trust, and deletable one row at a time.
//
// Three things the estimate says are deliberately not copied:
//
//   · the margin. It is what we keep, not what we spend, so a line seeds at
//     cost — qty × rate — and never at the price the client was quoted.
//   · our own time. An instructor day is quoted at a padded rate on purpose
//     (see pay_rate on pricing_rates), so copying it in would book a cost
//     nobody pays; pay comes in beside it from paySuggestion at the real
//     rate. An admin day is the same thing with no cash behind it at all.
//   · anything that arrives on an expense report. Lodging, flights, the
//     vehicle, fuel and food are claimed back — by an instructor or off the
//     company card, which is still a report line — and those reports are read
//     live into this screen. Seeding them too would count the same night, the
//     same flight, twice: once as a guess nobody went back to delete and once
//     as the receipt. A missing line is a gap somebody fills in; a doubled
//     one is a net that is quietly wrong.
//
// What is left is the money no report will ever carry: SWAG, permits, a
// venue, gear shipping, a contractor's invoice.

export type EstimateSeedLine = {
  label: string
  qty: number | null
  rate: number
  rate_id: string | null
}

/** Whether an estimate line is somebody on the team, rather than money going
    out of the door. Known pay rates first — the library is the authority, and
    a renamed rate keeps its pay_rate — then the words, for a line typed by
    hand or a rate that carries no pay figure. "EMT / medical" is deliberately
    not caught: that is a contractor we actually pay. */
export function isOurOwnTime(line: { label: string; rate_id: string | null }, payRateIds: Set<string>): boolean {
  if (line.rate_id && payRateIds.has(line.rate_id)) return true
  return /instructor|admin/i.test(line.label)
}

/** The expense-report category an estimate line will come back in under, if
    it comes back at all. Naming one is what disqualifies a line from being
    seeded: that money is read live off the reports, so writing a guess for it
    here would have the receipt and the guess both in the total.

    Null is the seedable answer — the estimator's line has no expense-report
    equivalent, so nothing else is ever going to bring it in. */
export function expenseCategoryForEstimateLine(label: string): string | null {
  const l = label.toLowerCase()
  if (/lodging|hotel|lodge/.test(l)) return 'lodging'
  if (/flight|air\b|airfare/.test(l)) return 'air_fare'
  if (/vehicle|rental|\bcar\b|truck|van/.test(l)) return 'auto_rental'
  if (/mileage|personal auto/.test(l)) return 'personal_auto'
  if (/fuel|gas\b|parking|toll|shuttle|transport/.test(l)) return 'transport'
  if (/meal|food|per diem/.test(l)) return 'per_diem'
  return null
}

/** Which cost category a seeded line is filed under. By name only: a seeded
    line is by definition one no expense category claims (those are left to
    the reports), so a "SWAG" line and a SWAG category being the same thing
    said twice is the whole of what can be matched on.

    Null is a real answer: it leaves the line asking for a category on screen,
    which is the honest state for a cost nobody has told the books about. */
export function accountForEstimateLine(label: string, accounts: CostAccount[]): string | null {
  const l = label.trim().toLowerCase()
  return accounts.find((a) => a.label.trim().toLowerCase() === l)?.id ?? null
}

export type CostSeedLine = { account_id: string | null; description: string; amount: number }

/** The estimate's lines as cost lines. At cost, our own time and anything an
    expense report will bring in left out, in the estimate's own order — so
    the two lists can be read side by side while the real numbers replace the
    guessed ones.

    A line the estimator never got a quantity for seeds at zero rather than
    being dropped: it is a heading saying money is expected here, and a zero
    changes no total. */
export function estimateCostSeed(
  items: EstimateSeedLine[],
  accounts: CostAccount[],
  payRateIds: Set<string>
): CostSeedLine[] {
  return items
    .filter((i) => !isOurOwnTime(i, payRateIds))
    .filter((i) => expenseCategoryForEstimateLine(i.label) === null)
    .map((i) => ({
      account_id: accountForEstimateLine(i.label, accounts),
      description: i.label,
      amount: round2((Number(i.qty) || 0) * (Number(i.rate) || 0)),
    }))
}
