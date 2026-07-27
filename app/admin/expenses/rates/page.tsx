import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SaveButton from '@/components/SaveButton'
import { addPricingRate, updatePricingRate } from '@/app/admin/courses/finance-actions'
import DeletePricingRateButton from './DeletePricingRateButton'
import DefaultLineToggle from './DefaultLineToggle'

export default async function AdminExpenseRatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: pricingRateRows } = await admin
    .from('pricing_rates')
    .select('id, label, unit, rate, default_line, reimb_type')
    .eq('active', true)
    .order('sort_order')
  const pricingRates = (pricingRateRows ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))

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
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500"
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
      </div>
    </main>
  )
}
