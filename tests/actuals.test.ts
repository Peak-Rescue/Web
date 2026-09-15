import { describe, it, expect } from 'vitest'
import {
  accountForExpense,
  expenseLineLabel,
  payRatesFrom,
  actualsAreLive,
  paySuggestion,
  rollUpActuals,
  type ActualExpenseLine,
  type CostAccount,
} from '@/lib/actuals'
import { itemIsUnclassified } from '@/lib/expenses'

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
    payLines: [{ id: 'p1', profile_id: null, work_date: null, description: 'Team Pay', amount: 3050 }],
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
    expect(roll({ payLines: [{ id: 'p', profile_id: null, work_date: null, description: null, amount: 500 }] }).netPct)
      .toBeNull()
  })
})

describe('the pay suggestion', () => {
  it('prices field days and two travel days per instructor', () => {
    const s = paySuggestion({ instructors: 2, days: 5 }, { fieldDay: 500, travelDay: 200 })
    expect(s?.total).toBe(5800)
    expect(s?.lines.map((l) => l.amount)).toEqual([5000, 800])
  })

  it('says what it assumed, because the crew is the authority', () => {
    expect(paySuggestion({ instructors: 1, days: 1 }, { fieldDay: 500, travelDay: 200 })?.assumptions)
      .toBe('1 instructor, 1 field day, 2 travel days each')
  })

  it('has nothing to offer a course with no dates', () => {
    expect(paySuggestion({ instructors: 2, days: null }, { fieldDay: 500, travelDay: 200 })).toBeNull()
  })

  it('has nothing to offer when the library carries no pay rates', () => {
    expect(paySuggestion({ instructors: 2, days: 5 }, { fieldDay: null, travelDay: null })).toBeNull()
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

describe('finding the pay rates in the library', () => {
  const LIBRARY = [
    { label: 'Instructor field day', pay_rate: 500 },
    { label: 'Instructor travel day', pay_rate: 200 },
    { label: 'Lodging', pay_rate: null },
  ]

  it('reads what we pay, not what we quote', () => {
    expect(payRatesFrom(LIBRARY)).toEqual({ fieldDay: 500, travelDay: 200 })
  })

  it('does not mistake the travel line for the field line', () => {
    // "Instructor travel day" matches a loose /instructor.*day/ too, so the
    // travel rate is claimed first and the field lookup cannot swallow it.
    expect(payRatesFrom([...LIBRARY].reverse()).fieldDay).toBe(500)
  })

  it('survives a rename, because it tests meaning and not spelling', () => {
    expect(payRatesFrom([{ label: 'Instructor day in the field', pay_rate: 550 }]).fieldDay).toBe(550)
  })

  it('has no rate to offer when the library carries none', () => {
    expect(payRatesFrom([{ label: 'Lodging', pay_rate: null }])).toEqual({ fieldDay: null, travelDay: null })
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
