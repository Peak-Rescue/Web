import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SaveButton from '@/components/SaveButton'
import { addPricingRate, updatePricingRate } from '@/app/admin/courses/finance-actions'
import { updateOrgSetting } from '@/app/admin/courses/actuals-actions'
import DeletePricingRateButton from './DeletePricingRateButton'
import DefaultLineToggle from './DefaultLineToggle'

export default async function AdminExpenseRatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

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

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/expenses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Expense Admin
        </Link>
        <h1 className="text-2xl font-bold mb-2">Rates Library</h1>
        <p className="text-zinc-400 mb-10">
          One library for all prices — course estimates and employee expense reports both use whatever rate is
          current. Saved estimates and expense lines keep the numbers they were created with, so changing a rate
          here never rewrites existing records.
        </p>
        <p className="text-zinc-500 text-sm mb-10">
          Two numbers on a line where they differ: the <span className="text-zinc-300">rate</span> is what we
          quote at, padded on purpose, and <span className="text-zinc-300">pay</span> is what a person is
          actually paid. Course actuals use the second to suggest what a course&apos;s pay came to; leave it
          blank on anything that is not somebody&apos;s time.
        </p>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
          {pricingRates.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-2.5 flex-wrap">
              <form action={updatePricingRate.bind(null, r.id)} className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <input
                  name="label"
                  required
                  defaultValue={r.label}
                  title="Shown on estimate lines when added from the library"
                  className="flex-1 min-w-36 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-500"
                />
                {r.reimb_type && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-teal-900/60 text-teal-300"
                    title="Used to compute employee expense reports"
                  >
                    Reimbursement
                  </span>
                )}
                <input
                  name="unit"
                  defaultValue={r.unit ?? ''}
                  placeholder="per day"
                  title='Drives the quantity calculator, e.g. "per instructor per day"'
                  className="w-40 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-zinc-500"
                />
                <input
                  type="number"
                  name="rate"
                  step="0.01"
                  min="0"
                  defaultValue={r.rate}
                  title="What we quote this at"
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500"
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
                  title="What a person is actually paid for this — blank if this line is not somebody's time"
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <SaveButton className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors">
                  Save
                </SaveButton>
              </form>
              <div className="flex items-center gap-3 shrink-0">
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
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-zinc-200 mb-1">Org-wide numbers</h2>
            <p className="text-xs text-zinc-500 mb-3">
              One value, every course. A course can still override it on its own actuals.
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
