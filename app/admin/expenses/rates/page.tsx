import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SaveButton from '@/components/SaveButton'
import { adminAddRate } from '../actions'
import DeleteRateButton from './DeleteRateButton'
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
      </div>
    </main>
  )
}
