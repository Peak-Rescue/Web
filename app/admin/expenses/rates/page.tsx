import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SaveButton from '@/components/SaveButton'
import { adminAddRate } from '../actions'
import { addPricingRate, updatePricingRate } from '@/app/admin/courses/finance-actions'
import DeleteRateButton from './DeleteRateButton'
import DeletePricingRateButton from './DeletePricingRateButton'
import { type ExpenseRate, type RateType, fmtMoney } from '@/lib/expenses'

const TYPE_LABELS: Record<RateType, { title: string; unit: string; hint: string }> = {
  mileage: {
    title: 'Mileage',
    unit: 'per mile',
    hint: 'Applied to personal auto use. Update when the IRS standard rate changes.',
  },
  per_diem_meal: {
    title: 'Per diem',
    unit: 'per meal',
    hint: 'Exempt employees only. A full day is 3 meals.',
  },
}

export default async function AdminExpenseRatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: rates } = await admin
    .from('expense_rates')
    .select('id, rate_type, rate, effective_date')
    .order('effective_date', { ascending: false })

  const allRates = (rates ?? []) as ExpenseRate[]
  const today = new Date().toISOString().slice(0, 10)

  const { data: pricingRateRows } = await admin
    .from('pricing_rates')
    .select('id, label, unit, rate')
    .eq('active', true)
    .order('sort_order')
  const pricingRates = (pricingRateRows ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/expenses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Expense Reports
        </Link>
        <h1 className="text-2xl font-bold mb-2">Reimbursement Rates</h1>
        <p className="text-zinc-400 mb-10">
          Rates are effective-dated: each expense uses the rate in effect on its date, so past reports stay correct
          when a rate changes.
        </p>

        {(Object.keys(TYPE_LABELS) as RateType[]).map((type) => {
          const typeRates = allRates.filter((r) => r.rate_type === type)
          const current = typeRates.find((r) => r.effective_date <= today) ?? typeRates[typeRates.length - 1]
          return (
            <section key={type} className="mb-12">
              <h2 className="text-lg font-semibold mb-1">{TYPE_LABELS[type].title}</h2>
              <p className="text-xs text-zinc-500 mb-4">{TYPE_LABELS[type].hint}</p>

              <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                {typeRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {fmtMoney(r.rate)} <span className="text-zinc-500 font-normal">{TYPE_LABELS[type].unit}</span>
                      </span>
                      {r.id === current?.id && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-teal-900/60 text-teal-300">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-zinc-500">
                        effective {new Date(r.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {typeRates.length > 1 && <DeleteRateButton rateId={r.id} />}
                    </div>
                  </div>
                ))}
                {typeRates.length === 0 && (
                  <p className="px-4 py-3 text-sm text-zinc-500">No rates yet — add one below.</p>
                )}
              </div>

              <form action={adminAddRate} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="rate_type" value={type} />
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">New rate ({TYPE_LABELS[type].unit})</label>
                  <input
                    type="number"
                    name="rate"
                    step="0.0001"
                    min="0"
                    required
                    placeholder={type === 'mileage' ? '0.725' : '20.00'}
                    className="w-36 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Effective date</label>
                  <input
                    type="date"
                    name="effective_date"
                    required
                    className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                  Add rate
                </SaveButton>
              </form>
            </section>
          )
        })}

        {/* ── Course pricing rates (estimate calculator library) ── */}
        <section className="mb-12 pt-8 border-t border-zinc-800">
          <h2 className="text-lg font-semibold mb-1">Course Pricing Rates</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Defaults for the estimate calculator on course pages (internal quote pricing — separate from
            reimbursement rates above). Changing a rate affects new line items only; existing estimates keep their
            numbers.
          </p>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
            {pricingRates.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.label}</p>
                  {r.unit && <p className="text-xs text-zinc-500">{r.unit}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <form action={updatePricingRate.bind(null, r.id)} className="flex items-center gap-2">
                    <input
                      type="number"
                      name="rate"
                      step="0.01"
                      min="0"
                      defaultValue={r.rate}
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500"
                    />
                    <SaveButton className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors">
                      Save
                    </SaveButton>
                  </form>
                  <DeletePricingRateButton rateId={r.id} label={r.label} />
                </div>
              </div>
            ))}
            {pricingRates.length === 0 && (
              <p className="px-4 py-3 text-sm text-zinc-500">No pricing rates yet.</p>
            )}
          </div>
          <form action={addPricingRate} className="mt-3 flex items-end gap-2 flex-wrap">
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
        </section>
      </div>
    </main>
  )
}
