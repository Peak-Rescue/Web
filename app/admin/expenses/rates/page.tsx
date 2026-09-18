import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SaveButton from '@/components/SaveButton'
import { addPricingRate, updatePricingRate } from '@/app/admin/courses/finance-actions'
import { updateOrgSetting, addCostAccountToLibrary, addPayFieldRate } from '@/app/admin/courses/actuals-actions'
import RetirePayRateButton from './RetirePayRateButton'
import { fmtRate } from '@/lib/pay'
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
// One template per table, shared by the header and every row. The grid lives
// on the row; each row's <form> is display:contents so its inputs are cells of
// that grid rather than a box of their own.
//
// Columns: name · unit · quote · pay · default · save · remove
//
// DOM order matches column order, and nothing is placed by hand. col-start put
// the row on two lines: auto-placement walks forward only, so a save button
// pinned to column 6 left the cursor past column 5, and the tick box pinned
// there had to start a new row to get back.
const RATE_GRID =
  'md:grid md:grid-cols-[minmax(0,1fr)_11rem_5rem_4.5rem_3.5rem_1.75rem_1.75rem] md:gap-2 md:items-center'
const RATE_ROW = `flex flex-wrap items-center gap-2 ${RATE_GRID}`
// Columns: category · routed in · save · remove
const CATEGORY_GRID = 'md:grid md:grid-cols-[1fr_7rem_1.75rem_1.75rem] md:gap-2 md:items-center'
const CATEGORY_ROW = `flex flex-wrap items-center gap-2 ${CATEGORY_GRID}`

const HEAD = 'text-[10px] uppercase tracking-wide text-zinc-500'
const BOX = 'w-full md:w-auto md:min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-zinc-500'

// A rate that expense reports compute with — the mileage and per-meal figures.
// It sits where that row's Remove would be, because not being removable is the
// only thing the fact changes. It was a "Reimbursement" chip in a column of
// its own, which spent a sixth of the table's width to say so.
function ReimbursementLock() {
  return (
    <span
      title="Used by expense reports, so it can't be removed — only re-priced"
      className="text-zinc-700"
    >
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </span>
  )
}

/** An org-wide number as it is typed and read. A percentage is stored as the
    fraction it multiplies by, so it is shown ×100 and saved ÷100; every other
    unit — dollars an hour, hours in a day, a multiplier — is stored as typed.
    The row says which, because this table stopped being all percentages the
    moment pay went hourly. */
type OrgSetting = {
  key: string
  value: number | string
  label: string
  unit: string | null
  notes: string | null
  format: string | null
}

function settingValue(o: OrgSetting): number {
  const n = Number(o.value)
  return (o.format ?? 'percent') === 'percent' ? Math.round(n * 10000) / 100 : n
}

function OrgSettingRow({ setting }: { setting: OrgSetting }) {
  return (
    <form
      action={updateOrgSetting.bind(null, setting.key)}
      className="flex items-center justify-between gap-4 px-4 py-3 flex-wrap"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{setting.label}</p>
        {setting.notes && <p className="text-xs text-zinc-500 mt-0.5">{setting.notes}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          name="value"
          step="0.01"
          min="0"
          defaultValue={settingValue(setting)}
          className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500"
        />
        <span className="text-xs text-zinc-500 w-28">{setting.unit}</span>
        <SaveButton className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors">
          Save
        </SaveButton>
      </div>
    </form>
  )
}

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
    .select('key, value, label, unit, notes, format')
    .order('label')

  // The hourly rates somebody can be put on. Descending, because the top of
  // the scale is the common one and the list is read as a scale.
  const { data: payRateRows } = await admin
    .from('pay_field_rates')
    .select('hourly')
    .eq('active', true)
    .order('hourly', { ascending: false })

  // Pay's own numbers are shown with pay, not in the general org-wide list:
  // read together they are one rule — ten-hour days, $20 travel hours, time
  // and a half past forty — and read apart they are four loose figures.
  const payKeys = ['pay_travel_hourly', 'pay_hours_per_day', 'pay_ot_weekly_hours', 'pay_ot_multiplier']
  const paySettingRows = (orgRows ?? []).filter((o) => payKeys.includes(o.key as string))
  const otherOrgRows = (orgRows ?? []).filter((o) => !payKeys.includes(o.key as string))

  const { data: pricingRateRows } = await admin
    .from('pricing_rates')
    .select('id, label, unit, rate, pay_rate, own_time, default_line, reimb_type')
    .eq('active', true)
    .order('sort_order')
  const pricingRates = (pricingRateRows ?? []).map((r) => ({
    ...r,
    rate: Number(r.rate),
    pay_rate: r.pay_rate === null ? null : Number(r.pay_rate),
  }))

  // The units already in the library, offered as suggestions so the common
  // ones are a click and a new one is still just typing.
  const rateUnits = [...new Set(pricingRates.map((r) => r.unit?.trim()).filter((u): u is string => Boolean(u)))].sort()

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
          {/* Column names, so the two money boxes and the tick box do not each
              need a label of their own on every row. */}
          <div className={`hidden ${RATE_GRID} px-4 py-2 ${HEAD}`}>
            <span>Name</span>
            <span>Unit</span>
            <span className="text-right">Quote</span>
            <span className="text-right">Pay</span>
            <span className="text-center">Default</span>
            <span />
            <span />
          </div>

          {pricingRates.map((r) => (
            <div key={r.id} className={`${RATE_ROW} px-4 py-2.5`}>
              {/* display:contents — the inputs are cells of the row's grid,
                  so the two buttons outside the form can share it. */}
              <form action={updatePricingRate.bind(null, r.id)} className="contents">
                <input
                  name="label"
                  required
                  defaultValue={r.label}
                  title="Shown on estimate lines"
                  className={`${BOX} text-sm font-medium`}
                />
                {/* The units already in use, offered as a list. A datalist
                    rather than a dropdown because typing is how you add one,
                    and a typo here quietly stops the quantity calculator
                    recognising "instructors" or "days". */}
                <input
                  name="unit"
                  list="rate-units"
                  defaultValue={r.unit ?? ''}
                  placeholder="per day"
                  title='Drives the quantity calculator — "per instructor per day"'
                  className={`${BOX} text-xs text-zinc-400`}
                />
                <input
                  type="number"
                  name="rate"
                  step="0.01"
                  min="0"
                  defaultValue={r.rate}
                  title="What we quote this at"
                  className={`${BOX} text-sm text-right`}
                />
                {/* Our own time has no pay figure to type any more: it is
                    paid by the hour, at a rate that differs per person and
                    earns overtime past forty hours in the week. So the cell
                    points at where that is set rather than holding a number
                    that nothing would read. */}
                {r.own_time ? (
                  <a
                    href="#pay-by-the-hour"
                    title="Paid by the hour, per person — set below"
                    className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 decoration-zinc-700 transition-colors md:text-right"
                  >
                    by the hour
                  </a>
                ) : (
                  <input
                    type="number"
                    name="pay_rate"
                    step="0.01"
                    min="0"
                    defaultValue={r.pay_rate ?? ''}
                    placeholder="pay"
                    title="What we actually pay, where that is a flat figure — a contractor's day. Blank if this isn't somebody's time."
                    className={`${BOX} text-sm text-right text-zinc-400 placeholder-zinc-600`}
                  />
                )}
                {/* Inside the form only to sit in the right column. Its box
                    carries no name, so it is absent from the submitted data
                    and from what Save watches for changes — it fires its own
                    action the moment it is ticked. */}
                <DefaultLineToggle rateId={r.id} initialValue={r.default_line} />
                <SaveButton
                  icon
                  className="flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                />
              </form>
              <div className="flex items-center justify-center">
                {r.reimb_type ? <ReimbursementLock /> : <DeletePricingRateButton rateId={r.id} label={r.label} />}
              </div>
            </div>
          ))}
          {pricingRates.length === 0 && (
            <p className="px-4 py-3 text-sm text-zinc-500">No rates yet.</p>
          )}
        </div>

        <datalist id="rate-units">
          {rateUnits.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        {/* Adding one belongs at the end of the rates, not at the bottom of a
            page that has two other tables after them. */}
        <form action={addPricingRate} className="mt-3 flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-zinc-400 mb-1">New rate label</label>
            <input name="label" required placeholder="e.g. Boat rental" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Unit</label>
            <input name="unit" list="rate-units" placeholder="per day" className="w-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Rate</label>
            <input name="rate" type="number" step="0.01" min="0" required className="w-28 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <SaveButton className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium transition-colors">
            Add rate
          </SaveButton>
        </form>

        {/* What we actually pay for somebody's time. Separate from the rates
            above because those are prices with a margin in them: an
            instructor day is quoted padded on purpose, and this is the money
            that leaves. */}
        <div className="mt-10 scroll-mt-24" id="pay-by-the-hour">
          <h2 className="text-sm font-semibold text-zinc-200 mb-1">Pay by the hour</h2>
          <p className="text-xs text-zinc-500 mb-3">
            A field day and a travel day are both hours at a rate, not a flat figure — which is what makes
            overtime countable. Course actuals work pay out from these and the course&rsquo;s own dates.
          </p>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
            {paySettingRows.map((o) => (
              <OrgSettingRow key={o.key as string} setting={o as OrgSetting} />
            ))}
          </div>

          <h3 className="text-xs uppercase tracking-wide text-zinc-500 mt-6 mb-1">Field hourly rates</h3>
          <p className="text-xs text-zinc-500 mb-3">
            The rates somebody can be put on. Who is on which is set on their instructor page, and a course
            can override it for that course.
          </p>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
            {(payRateRows ?? []).map((r) => (
              <div key={String(r.hourly)} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <p className="text-sm font-medium text-zinc-200">{fmtRate(Number(r.hourly))} / hour</p>
                <RetirePayRateButton hourly={Number(r.hourly)} />
              </div>
            ))}
            {(payRateRows ?? []).length === 0 && (
              <p className="px-4 py-3 text-sm text-zinc-500">
                No hourly rates yet, so no course can work its pay out.
              </p>
            )}
          </div>
          <form action={addPayFieldRate} className="mt-3 flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">New hourly rate</label>
              <input
                name="hourly"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="45"
                className="w-28 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <SaveButton className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium transition-colors">
              Add rate
            </SaveButton>
          </form>
        </div>

        {/* Numbers that apply to everything, which is why they are not in the
            list above: nothing here is multiplied by a quantity, and a rate in
            that list is also an estimate line waiting to be added. */}
        {otherOrgRows.length > 0 && (
          <div className="mt-10 scroll-mt-24" id="org-wide">
            <h2 className="text-sm font-semibold text-zinc-200 mb-1">Org-wide numbers</h2>
            <p className="text-xs text-zinc-500 mb-3">
              Where a course starts. Each one takes these when its actuals are first opened and keeps them, so
              changing a figure here moves nothing already reconciled.
            </p>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {otherOrgRows.map((o) => (
                <OrgSettingRow key={o.key as string} setting={o as OrgSetting} />
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
            <div className={`hidden ${CATEGORY_GRID} px-4 py-2 ${HEAD}`}>
              <span>Category</span>
              <span>Routed in</span>
              <span />
              <span />
            </div>
            {(costAccountRows ?? []).map((a) => (
              <CostCategoryRow
                columns={CATEGORY_ROW}
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

      </div>
    </main>
  )
}
