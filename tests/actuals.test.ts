import { describe, it, expect } from 'vitest'
import { amountValue } from '@/components/ActualsPanel'
import {
  accountsWorthShowing,
  accountForExpense,
  groupByReport,
  expenseLineLabel,
  payLineName,
  routeReassignments,
  actualsAreLive,
  estimateCostSeed,
  accountForEstimateLine,
  rollUpActuals,
  type AccountRollup,
  type ActualExpenseLine,
  type CostAccount,
} from '@/lib/actuals'
import { itemIsUnclassified } from '@/lib/expenses'
import { isJob, workNoun, WorkNoun } from '@/lib/courses'

const TRAVEL: CostAccount = { id: 'travel', label: 'Travel expenses', categories: ['lodging', 'transport'], sort_order: 10 }
const MISC: CostAccount = { id: 'misc', label: 'Misc', categories: ['other'], sort_order: 80 }
const SWAG: CostAccount = { id: 'swag', label: 'SWAG', categories: [], sort_order: 50 }
const ACCOUNTS = [TRAVEL, SWAG, MISC]

function line(over: Partial<ActualExpenseLine> = {}): ActualExpenseLine {
  return {
    id: 'e1',
    category: 'lodging',
    amount: 100,
    start_date: '2026-06-01',
    description: null,
    details: null,
    paid_by: 'personal',
    submitted: true,
    personName: 'Nadav',
    reportId: 'r1',
    ...over,
  }
}

function roll(over: Partial<Parameters<typeof rollUpActuals>[0]> = {}) {
  return rollUpActuals({
    accounts: ACCOUNTS,
    expenseLines: [],
    expenseAccountOverrides: new Map(),
    typedLines: [],
    payLines: [],
    payrollLoadPct: 0.25,
    invoiced: 0,
    ...over,
  })
}

describe('where an expense line is filed', () => {
  it('follows its category', () => {
    expect(accountForExpense(line(), ACCOUNTS, new Map())).toBe('travel')
  })

  it('follows an override instead, which is the point of overrides', () => {
    expect(accountForExpense(line({ category: 'other' }), ACCOUNTS, new Map([['e1', 'swag']]))).toBe('swag')
  })

  it('ignores an override pointing at an account that no longer exists', () => {
    expect(accountForExpense(line(), ACCOUNTS, new Map([['e1', 'deleted']]))).toBe('travel')
  })

  it('is nowhere when no account claims the category', () => {
    expect(accountForExpense(line({ category: 'air_fare' }), ACCOUNTS, new Map())).toBeNull()
  })
})

describe('the spreadsheet this replaces', () => {
  // The numbers off the July sheet: $55,000 invoiced, $3,050 pay at a 25%
  // load, $600 of travel, $50,587.50 left, 91.98%.
  const actuals = roll({
    invoiced: 55000,
    payLines: [{ id: 'p1', profile_id: null, description: 'Team Pay', amount: 3050 }],
    expenseLines: [line({ amount: 600, category: 'transport' })],
  })

  it('loads pay by a quarter', () => {
    expect(actuals.payTotal).toBe(3050)
    expect(actuals.payrollLoad).toBe(762.5)
    expect(actuals.instructorPay).toBe(3812.5)
  })

  it('totals costs across pay and expenses', () => {
    expect(actuals.costsTotal).toBe(4412.5)
  })

  it('arrives at the same net and the same margin', () => {
    expect(actuals.net).toBe(50587.5)
    expect(actuals.netPct).toBeCloseTo(0.9198, 4)
  })
})

describe('unsubmitted money', () => {
  const actuals = roll({
    invoiced: 1000,
    expenseLines: [line({ amount: 100 }), line({ id: 'e2', amount: 250, submitted: false })],
  })

  it('stays out of every total', () => {
    expect(actuals.costsTotal).toBe(100)
    expect(actuals.net).toBe(900)
  })

  it('is still visible, so the net is read knowing what is coming', () => {
    expect(actuals.pending.amount).toBe(250)
    expect(actuals.pending.lines).toHaveLength(1)
  })
})

describe('money with no home', () => {
  it('counts even when its account was retired', () => {
    const actuals = roll({ invoiced: 1000, expenseLines: [line({ category: 'air_fare', amount: 400 })] })
    expect(actuals.unfiled.amount).toBe(400)
    expect(actuals.costsTotal).toBe(400)
    expect(actuals.net).toBe(600)
  })

  it('counts a typed cost that names no account', () => {
    const actuals = roll({
      invoiced: 1000,
      typedLines: [{ id: 't1', account_id: null, spend_date: null, description: 'Card charge', amount: 75 }],
    })
    expect(actuals.unfiled.amount).toBe(75)
    expect(actuals.costsTotal).toBe(75)
  })
})

describe('company-card expenses', () => {
  it('cost the company the same as a reimbursement does', () => {
    const actuals = roll({ expenseLines: [line({ amount: 300, paid_by: 'company_card' })] })
    expect(actuals.costsTotal).toBe(300)
  })
})

describe('net as a percentage', () => {
  it('is not a number until something was invoiced', () => {
    expect(roll({ payLines: [{ id: 'p', profile_id: null, description: null, amount: 500 }] }).netPct)
      .toBeNull()
  })
})

describe('whose pay a line is', () => {
  const names = { i1: 'Eric Christensen', u1: 'Eric C' }

  it('reads the roster first, because half the crew has no account', () => {
    expect(payLineName({ instructor_id: 'i1', profile_id: null }, names)).toBe('Eric Christensen')
  })

  it('still names a line written before the roster id existed', () => {
    expect(payLineName({ profile_id: 'u1' }, names)).toBe('Eric C')
  })

  it('is nobody on a line typed for the whole crew', () => {
    expect(payLineName({ instructor_id: null, profile_id: null }, names)).toBeNull()
  })
})

describe('when actuals become the live question', () => {
  it('is the first day, not the last — costs land as soon as the crew travels', () => {
    expect(actualsAreLive({ starts_at: '2026-09-10', status: 'confirmed' }, '2026-09-14')).toBe(true)
    expect(actualsAreLive({ starts_at: '2026-09-20', status: 'confirmed' }, '2026-09-14')).toBe(false)
  })

  it('is true of a completed course whatever its dates say', () => {
    expect(actualsAreLive({ starts_at: null, status: 'completed' }, '2026-09-14')).toBe(true)
  })

  it('is never true of a cancelled one', () => {
    expect(actualsAreLive({ starts_at: '2026-01-01', status: 'cancelled' }, '2026-09-14')).toBe(false)
  })
})

describe('an expense line that never said what it was for', () => {
  it('is unclassified when it names neither a course nor overhead', () => {
    expect(itemIsUnclassified({ instance_id: null, non_course: false }, null)).toBe(true)
  })

  it('is placed by the report default, so single-course trips need no links', () => {
    expect(itemIsUnclassified({ instance_id: null, non_course: false }, 'course-1')).toBe(false)
  })

  it('is fine once somebody says it belongs to nobody', () => {
    expect(itemIsUnclassified({ instance_id: null, non_course: true }, null)).toBe(false)
  })
})

describe('what an expense line is called on a page of accounts', () => {
  const base = { category: 'air_fare', description: null, details: null }

  it('is its description when it has one', () => {
    expect(expenseLineLabel({ ...base, description: 'Checked bag fee' })).toBe('Checked bag fee')
  })

  it('falls back to the first line of the details the story was typed into', () => {
    expect(expenseLineLabel({ ...base, details: 'Stove fuel and ice\nfor the canyon day' }))
      .toBe('Stove fuel and ice')
  })

  it('never shows the raw category key — that is how "air_fare" reached a PDF', () => {
    expect(expenseLineLabel(base)).toBe('Air fare')
  })

  it('shows an unknown category as itself rather than as nothing', () => {
    expect(expenseLineLabel({ ...base, category: 'drone_hire' })).toBe('drone_hire')
  })
})

describe('routing expense types into cost categories', () => {
  const CATS = [
    { id: 'travel', categories: ['lodging', 'air_fare'] },
    { id: 'misc', categories: ['other'] },
    { id: 'swag', categories: [] },
  ]

  it('takes a route off whoever had it, because two claims would double-count', () => {
    expect(routeReassignments(CATS, 'misc', ['lodging'])).toEqual([
      { id: 'travel', categories: ['air_fare'] },
    ])
  })

  it('writes nothing when the claim displaces nothing', () => {
    expect(routeReassignments(CATS, 'swag', [])).toEqual([])
    expect(routeReassignments(CATS, 'travel', ['lodging', 'air_fare'])).toEqual([])
  })

  it('never touches the category doing the claiming', () => {
    const out = routeReassignments(CATS, 'travel', ['lodging', 'other'])
    expect(out.map((o) => o.id)).toEqual(['misc'])
    expect(out[0].categories).toEqual([])
  })

  it('can strip a route from more than one at once', () => {
    expect(routeReassignments(CATS, 'swag', ['air_fare', 'other'])).toEqual([
      { id: 'travel', categories: ['lodging'] },
      { id: 'misc', categories: [] },
    ])
  })
})

describe('an amount box you are halfway through typing', () => {
  it('shows nothing in a row nobody has touched', () => {
    expect(amountValue({ amount: 0 })).toBe('')
  })

  it('keeps the zero in "0.5", which the parsed number cannot', () => {
    // Typing 0 then . then 5: the number is 0 until the 5 lands, so a box
    // showing the number back would eat the character as it was typed.
    expect(amountValue({ amount: 0, amountText: '0.' })).toBe('0.')
    expect(amountValue({ amount: 0.5, amountText: '0.5' })).toBe('0.5')
  })

  it('shows a saved amount that was never typed in this session', () => {
    expect(amountValue({ amount: 612.4 })).toBe('612.4')
  })

  it('lets the box be emptied', () => {
    expect(amountValue({ amount: 0, amountText: '' })).toBe('')
  })
})

describe('which categories the summary draws', () => {
  const rollup = (over: Partial<AccountRollup>): AccountRollup => ({
    account: TRAVEL,
    fromExpenses: 0,
    typed: 0,
    total: 0,
    expenseLines: [],
    typedLines: [],
    ...over,
  })

  it('leaves out a category nothing has touched', () => {
    expect(accountsWorthShowing([rollup({})])).toHaveLength(0)
  })

  it('draws one holding expense-report money', () => {
    expect(accountsWorthShowing([rollup({ expenseLines: [line()], total: 100 })])).toHaveLength(1)
  })

  it('draws one holding a typed cost', () => {
    const typed = { id: 't1', account_id: 'travel', spend_date: null, description: 'Patches', amount: 240 }
    expect(accountsWorthShowing([rollup({ typedLines: [typed], total: 240 })])).toHaveLength(1)
  })

  it('still draws one whose costs cancel out — somebody used it', () => {
    const a = { id: 'a', account_id: 'travel', spend_date: null, description: 'Charge', amount: 100 }
    const b = { id: 'b', account_id: 'travel', spend_date: null, description: 'Refund', amount: -100 }
    expect(accountsWorthShowing([rollup({ typedLines: [a, b], total: 0 })])).toHaveLength(1)
  })
})

describe('draft expense lines, grouped so you know who to ask', () => {
  const l = (over: Partial<ActualExpenseLine>) => line({ submitted: false, ...over })

  it('gathers lines into the report they belong to', () => {
    const out = groupByReport([
      l({ id: 'a', reportId: 'r1', amount: 100, personName: 'Jake Shultz' }),
      l({ id: 'b', reportId: 'r1', amount: 50, personName: 'Jake Shultz' }),
      l({ id: 'c', reportId: 'r2', amount: 400, personName: 'Nadav Oakes' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ reportId: 'r2', personName: 'Nadav Oakes', total: 400 })
    expect(out[1]).toMatchObject({ reportId: 'r1', personName: 'Jake Shultz', total: 150 })
  })

  it('puts the biggest report first — that is the one worth chasing', () => {
    const out = groupByReport([
      l({ id: 'a', reportId: 'small', amount: 12 }),
      l({ id: 'b', reportId: 'big', amount: 900 }),
    ])
    expect(out.map((g) => g.reportId)).toEqual(['big', 'small'])
  })

  it("orders a report's own lines by date, as the trip ran", () => {
    const out = groupByReport([
      l({ id: 'a', reportId: 'r1', start_date: '2026-06-05' }),
      l({ id: 'b', reportId: 'r1', start_date: '2026-06-01' }),
    ])
    expect(out[0].lines.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('still names the report when one line lost its person', () => {
    const out = groupByReport([
      l({ id: 'a', reportId: 'r1', personName: null }),
      l({ id: 'b', reportId: 'r1', personName: 'Jake Shultz' }),
    ])
    expect(out[0].personName).toBe('Jake Shultz')
  })
})

describe('the actuals starting from the estimate', () => {
  const PAY_RATES = new Set(['field-day', 'travel-day'])
  const items = [
    { label: 'Instructor field day', qty: 10, rate: 750, rate_id: 'field-day' },
    { label: 'Instructor travel day', qty: 4, rate: 300, rate_id: 'travel-day' },
    { label: 'Admin day', qty: 2, rate: 700, rate_id: 'admin-day' },
    { label: 'Lodging', qty: 14, rate: 150, rate_id: 'lodging' },
    { label: 'Meals', qty: 20, rate: 68, rate_id: 'meals' },
    { label: 'Vehicle rental', qty: 7, rate: 215, rate_id: 'vehicle' },
    { label: 'Mileage', qty: null, rate: 0.73, rate_id: 'mileage' },
    { label: 'SWAG', qty: 8, rate: 30, rate_id: 'swag' },
    { label: 'Permits', qty: 8, rate: 15, rate_id: 'permits' },
  ]

  it('copies only the money no expense report will ever bring in', () => {
    const seeded = estimateCostSeed(items, ACCOUNTS, PAY_RATES)
    // Lodging, meals, the vehicle and the mileage are all claimed back — on a
    // report of somebody's or off the company card — and those reports are
    // read live. Seeding them too would put the receipt and the guess in the
    // same total.
    expect(seeded.map((l) => l.description)).toEqual(['SWAG', 'Permits'])
  })

  it('leaves out our own time, whatever the estimator called it', () => {
    const seeded = estimateCostSeed(items, ACCOUNTS, PAY_RATES)
    expect(seeded.some((l) => /instructor|admin/i.test(l.description))).toBe(false)
  })

  it('seeds at cost, because the margin is what we keep', () => {
    const swag = estimateCostSeed(items, ACCOUNTS, PAY_RATES).find((l) => l.description === 'SWAG')
    expect(swag?.amount).toBe(240)
  })

  it('keeps a line the estimator could not put a number on, at zero', () => {
    const seeded = estimateCostSeed(
      [{ label: 'Gear shipping', qty: null, rate: 90, rate_id: 'shipping' }],
      ACCOUNTS,
      PAY_RATES
    )
    expect(seeded).toEqual([{ account_id: null, description: 'Gear shipping', amount: 0 }])
  })

  it('lets a category named after the line claim it', () => {
    expect(accountForEstimateLine('SWAG', ACCOUNTS)).toBe('swag')
  })

  it('leaves a cost the books have never heard of asking for a category', () => {
    expect(accountForEstimateLine('Permits', ACCOUNTS)).toBeNull()
  })

  it('treats a renamed pay rate as our own time, by its id', () => {
    const renamed = [{ label: 'Guide day (2027 rate)', qty: 6, rate: 800, rate_id: 'field-day' }]
    expect(estimateCostSeed(renamed, ACCOUNTS, PAY_RATES)).toEqual([])
  })
})

describe('work we are hired to do rather than to teach', () => {
  it('knows a standby shift and a set from a course', () => {
    expect(isJob('standby-rescue')).toBe(true)
    expect(isJob('tv-rigging-safety')).toBe(true)
    expect(isJob('rope-rescue')).toBe(false)
    // A custom event has nothing to read it off, so it stays a course and the
    // parts nobody fills in simply stay empty.
    expect(isJob('custom')).toBe(false)
    expect(isJob(null)).toBe(false)
  })

  it('has a word of its own for the page to use', () => {
    expect([workNoun('standby-rescue'), WorkNoun('standby-rescue')]).toEqual(['job', 'Job'])
    expect([workNoun('rope-rescue'), WorkNoun('rope-rescue')]).toEqual(['course', 'Course'])
  })
})
