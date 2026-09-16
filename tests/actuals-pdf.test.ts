import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { generateActualsPdf } from '@/lib/actuals-pdf'
import { rollUpActuals, type CostAccount } from '@/lib/actuals'
import { type LoadedActuals } from '@/lib/actuals-data'

// A smoke test with teeth: the drawing code measures text, wraps it and breaks
// pages, none of which typecheck. What it catches is the class of failure that
// only shows up on the way to a printer — an unmappable character, a heading
// drawn against a font that was never embedded, a page break inside a run.

const ACCOUNTS: CostAccount[] = [
  { id: 'travel', label: 'Travel expenses', categories: ['lodging', 'air_fare'], sort_order: 10 },
  { id: 'swag', label: 'SWAG', categories: [], sort_order: 20 },
  { id: 'misc', label: 'Misc', categories: ['other'], sort_order: 30 },
]

function loaded(over: Partial<LoadedActuals> = {}): LoadedActuals {
  const expenseLines = over.expenseLines ?? [
    {
      id: 'e1', category: 'lodging', amount: 612.4, start_date: '2026-06-02',
      description: 'Hotel — crew of three', details: null, paid_by: 'personal' as const,
      submitted: true, personName: 'Nadav Oakes', reportId: 'r1',
    },
    {
      id: 'e2', category: 'other', amount: 88, start_date: '2026-06-03',
      description: null, details: 'Stove fuel and ice\nfor the canyon day', paid_by: 'company_card' as const,
      submitted: true, personName: 'Jake Shultz', reportId: 'r1',
    },
    {
      id: 'e3', category: 'air_fare', amount: 340, start_date: '2026-06-01',
      description: 'Checked bag fee', details: null, paid_by: 'personal' as const,
      submitted: false, personName: 'Jake Shultz', reportId: 'r2',
    },
  ]
  const payLines = over.payLines ?? [
    { id: 'p1', profile_id: 'u1', work_date: '2026-06-02', description: 'Field days — 2 × 5 days @ 500', amount: 5000 },
    { id: 'p2', profile_id: null, work_date: null, description: 'Travel days — 2 × 2 days @ 200', amount: 800 },
  ]
  const costLines = over.costLines ?? [
    { id: 'c1', account_id: 'swag', spend_date: '2026-05-20', description: 'Patches', amount: 240 },
  ]
  // Company-card money reaches the books the same way typed money does, so
  // the PDF has to add it in without being told which is which.
  const cardLines = over.cardLines ?? [
    { id: 'k1', account_id: 'travel', spend_date: '2026-06-01', description: 'HAMPTON INN CASPER', amount: 312, source: 'card' as const, cardholder: 'NADAV OAKES' },
  ]
  const base: LoadedActuals = {
    exists: true,
    invoiced: 55000,
    payrollLoadOverride: null,
    orgPayrollLoad: 0.25,
    payrollLoadPct: 0.25,
    notes: 'Client added a day on site. Invoiced above the quote by agreement.',
    closedAt: null,
    seededAt: null,
    shareToken: null,
    accounts: ACCOUNTS,
    expenseLines,
    expenseAccounts: [],
    payLines,
    costLines,
    cardLines,
    peopleById: { u1: 'Nadav Oakes' },
    rolled: rollUpActuals({
      accounts: ACCOUNTS,
      expenseLines,
      expenseAccountOverrides: new Map(),
      typedLines: [...costLines, ...cardLines],
      payLines,
      payrollLoadPct: over.payrollLoadPct ?? 0.25,
      invoiced: over.invoiced ?? 55000,
    }),
    ...over,
  }
  return base
}

const pdf = (actuals: LoadedActuals) =>
  generateActualsPdf({
    courseTitle: 'Technical Rope Rescue — Advanced',
    courseSubtitle: 'Fort Carson · June 1–5, 2026',
    actuals,
    acceptedQuote: { seq: 3, total: 52000 },
    generatedOn: '2026-09-14',
  })

describe('the actuals PDF', () => {
  it('renders a real course to a valid PDF', async () => {
    const bytes = await pdf(loaded())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(2000)
  })

  it('renders a course with nothing in it at all', async () => {
    const bytes = await pdf(
      loaded({ invoiced: null, notes: null, expenseLines: [], payLines: [], costLines: [] })
    )
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('survives the characters a keyboard actually produces', async () => {
    // An em dash, a curly quote, an accent and a degree sign all reach this
    // from ordinary typing, and pdf-lib's WinAnsi encoder throws on anything
    // it cannot map.
    const bytes = await pdf(
      loaded({
        notes: 'Client’s “extra” day — 30° morning, café receipts attached. Béla drove.',
        costLines: [{ id: 'c9', account_id: 'misc', spend_date: null, description: 'Café — crew ☕', amount: 42 }],
      })
    )
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('spills onto more pages rather than off the first one', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      category: 'lodging',
      amount: 100 + i,
      start_date: '2026-06-02',
      description: `Lodging night ${i + 1} for a crew that keeps growing and a description long enough to wrap`,
      details: null,
      paid_by: 'personal' as const,
      submitted: true,
      personName: 'Nadav Oakes',
      reportId: 'r1',
    }))
    const bytes = await pdf(loaded({ expenseLines: many }))
    // Read back through pdf-lib rather than grepping the bytes: the output is
    // compressed, so the page objects are not there to be found as text.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })
})
