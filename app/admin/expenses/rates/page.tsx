import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SaveButton from '@/components/SaveButton'
import { addPricingRate, updatePricingRate } from '@/app/admin/courses/finance-actions'
import { updateOrgSetting, addCostAccountToLibrary } from '@/app/admin/courses/actuals-actions'
import CostCategoryRow from './CostCategoryRow'
import { CATEGORY_LABELS, categoriesFor, type ExpenseCategory } from '@/lib/expenses'
import DeletePricingRateButton from './DeletePricingRateButton'
import DefaultLineToggle from './DefaultLineToggle'

// One template for the header and every row of each table. The rows were
// flex, so each one ended wherever its own contents happened to run out and
// no two boxes lined up down the page. Declared once here because a header
// aligned to a different template than its rows is worse than no header.
// The grid alone, and the grid on a row. A header cannot reuse the row class:
// it is hidden below md, and `hidden` and `flex` are the same CSS property
// fighting over one element.
const RATE_GRID = 'md:grid md:grid-cols-[1fr_6.5rem_9rem_5.5rem_4.5rem_auto] md:gap-2 md:items-center'
const RATE_COLS = `flex flex-wrap items-center gap-2 ${RATE_GRID}`
const CATEGORY_GRID = 'md:grid md:grid-cols-[1fr_9rem_auto_1.25rem] md:gap-2 md:items-center'
const CATEGORY_COLS = `flex flex-wrap items-center gap-2 ${CATEGORY_GRID}`
// Width of the trailing actions, reserved so they line up too.
const RATE_ACTIONS = 'w-48'

export default async function AdminExpenseRatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: costAccountRows } = await admin
    .from('cost_accounts')
    .select('id, label, categories, sort_order')
    .eq('active', true)
    .order('sort_order')

  const { data: orgRows } = await admin
    .from('org_settings')
    .select('key, value, label, unit, notes')
    .order('label')

  const { data: pricingRateRows } = await admin
    .from('pricing_rates')
    .select('id, label, unit, rate, pay_rate, default_line, reimb_type')
    .eq('active', true)
    .order('sort_order')
  const pricingRates = (pricingRateRows ?? []).map((r) => ({
    ...r,
    rate: Number(r.rate),
    pay_rate: r.pay_rate === null ? null : Number(r.pay_rate),
  }))

  // Every expense type an instructor can file, offered for routing. The
  // exempt-only one is included: routing says where money lands, not who is
  // allowed to claim it.
  const expenseChoices = categoriesFor(true).map((c: ExpenseCategory) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/expenses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Expense Admin
        </Link>
        <h1 className="text-2xl font-bold mb-2">Rates Library</h1>
        <p className="text-zinc-400 mb-10">
          Shared numbers. Estimates, expense reports and course actuals all read from here, and changing one
          never rewrites what&apos;s already saved.
        </p>

        <h2 className="text-sm font-semibold text-zinc-200 mb-1">Rates</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Prices an estimate is built from, times a quantity.
        </p>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800 scroll-mt-24" id="pay-rates">
          {/* Column names, so the two money boxes do not need a paragraph
              above the table explaining which is which. */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2 text-[10px] uppercase tracking-wide text-zinc-500">
            <div className={`${RATE_GRID} flex-1 min-w-0`}>
              <span>Name</span>
              <span />
              <span>Unit</span>
              <span className="text-right">Quote</span>
              <span className="text-right">Pay</span>
              <span />
            </div>
            <div className={`${RATE_ACTIONS} shrink-0`} />
          </div>
          {pricingRates.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-4 py-2.5 flex-wrap md:flex-nowrap">
              <form action={updatePricingRate.bind(null, r.id)} className={`${RATE_COLS} flex-1 min-w-0`}>
                <input
                  name="label"
                  required
                  defaultValue={r.label}
                  title="Shown on estimate lines"
                  className="w-full md:w-auto md:min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-500"
                />
                {/* Its own column, empty on most rows. Inline, it pushed every
                    box after it along on the two rows that have one. */}
                <span className="min-w-0">
                  {r.reimb_type && (
                    <span
                      className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-teal-900/60 text-teal-300 truncate max-w-full"
                      title="Used by expense reports"
                    >
                      Reimbursed
                    </span>
                  )}
                </span>
                <input
                  name="unit"
                  defaultValue={r.unit ?? ''}
                  placeholder="per day"
                  title='Drives the quantity calculator — "per instructor per day"'
                  className="w-full md:w-auto md:min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-zinc-500"
                />
                <input
                  type="number"
                  name="rate"
                  step="0.01"
                  min="0"
                  defaultValue={r.rate}
                  title="What we quote this at"
                  className="w-full md:w-auto md:min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500"
                />
                {/* What we actually pay, where that is a different number.
                    The quoted rate is padded on purpose; course actuals need
                    the unpadded one to suggest what a course's pay came to. */}
                <input
                  type="number"
                  name="pay_rate"
                  step="0.01"
                  min="0"
                  defaultValue={r.pay_rate ?? ''}
                  placeholder="pay"
                  title="What we actually pay. Blank if this isn't somebody's time."
                  className="w-full md:w-auto md:min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <SaveButton className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors">
                  Save
                </SaveButton>
              </form>
              <div className={`${RATE_ACTIONS} shrink-0 flex items-center justify-between gap-3`}>
                <DefaultLineToggle rateId={r.id} initialValue={r.default_line} />
                {!r.reimb_type && <DeletePricingRateButton rateId={r.id} label={r.label} />}
              </div>
            </div>
          ))}
          {pricingRates.length === 0 && (
            <p className="px-4 py-3 text-sm text-zinc-500">No rates yet.</p>
          )}
        </div>
        {/* Numbers that apply to everything, which is why they are not in the
            list above: nothing here is multiplied by a quantity, and a rate in
            that list is also an estimate line waiting to be added. */}
        {(orgRows ?? []).length > 0 && (
          <div className="mt-10 scroll-mt-24" id="org-wide">
            <h2 className="text-sm font-semibold text-zinc-200 mb-1">Org-wide numbers</h2>
            <p className="text-xs text-zinc-500 mb-3">
              One value, every course — a course can override it on its actuals.
            </p>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {(orgRows ?? []).map((o) => (
                <form
                  key={o.key}
                  action={updateOrgSetting.bind(null, o.key as string)}
                  className="flex items-center justify-between gap-4 px-4 py-3 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{o.label}</p>
                    {o.notes && <p className="text-xs text-zinc-500 mt-0.5">{o.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      name="value"
                      step="0.01"
                      min="0"
                      defaultValue={Math.round(Number(o.value) * 10000) / 100}
                      className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500"
                    />
                    <span className="text-xs text-zinc-500 w-28">{o.unit}</span>
                    <SaveButton className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors">
                      Save
                    </SaveButton>
                  </div>
                </form>
              ))}
            </div>
          </div>
        )}

        {/* What a course's costs get sorted into, and how expense-report
            money finds its way there on its own. */}
        <div className="mt-10 scroll-mt-24" id="cost-categories">
          <h2 className="text-sm font-semibold text-zinc-200 mb-1">Cost categories</h2>
          {/* The contrast with Rates, stated by sitting beside it: a rate is a
              price you multiply, a category is a bucket money lands in. */}
          <p className="text-xs text-zinc-500 mb-3">
            Buckets a course&apos;s actual spending is grouped into.
          </p>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
            <div className={`hidden ${CATEGORY_GRID} px-4 py-2 text-[10px] uppercase tracking-wide text-zinc-500`}>
              <span>Category</span>
              <span>Expenses routed in</span>
              <span />
              <span />
            </div>
            {(costAccountRows ?? []).map((a) => (
              <CostCategoryRow
                columns={CATEGORY_COLS}
                key={a.id as string}
                id={a.id as string}
                label={a.label as string}
                categories={((a.categories as string[] | null) ?? [])}
                choices={expenseChoices}
                claimedElsewhere={Object.fromEntries(
                  (costAccountRows ?? [])
                    .filter((o) => o.id !== a.id)
                    .flatMap((o) => ((o.categories as string[] | null) ?? []).map((c) => [c, o.label as string]))
                )}
              />
            ))}
            {(costAccountRows ?? []).length === 0 && (
              <p className="px-4 py-3 text-sm text-zinc-500">No categories yet.</p>
            )}
          </div>
          <form action={addCostAccountToLibrary} className="mt-3 flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="block text-xs text-zinc-400 mb-1">New cost category</label>
              <input name="label" required placeholder="e.g. Gear shipping" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <SaveButton className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium transition-colors">
              Add category
            </SaveButton>
          </form>
        </div>

        <form action={addPricingRate} className="mt-10 flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-zinc-400 mb-1">New rate label</label>
            <input name="label" required placeholder="e.g. Boat rental" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Unit</label>
            <input name="unit" placeholder="per day" className="w-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Rate</label>
            <input name="rate" type="number" step="0.01" min="0" required className="w-28 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
            Add rate
          </SaveButton>
        </form>
      </div>
    </main>
  )
}
