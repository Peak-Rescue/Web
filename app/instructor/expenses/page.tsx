import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SignaturePad from '@/components/SignaturePad'
import ReimbursedToggle from './ReimbursedToggle'
import { createReport } from './actions'
import { fmtMoney, round2 } from '@/lib/expenses'

export default async function ExpenseReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, signature_data_url')
    .eq('id', user.id)
    .single()
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const { data: reports } = await admin
    .from('expense_reports')
    .select('id, created_at, reason, status, submitted_at, payment_received_on, expense_items(amount, paid_by)')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  type ItemLite = { amount: number; paid_by: string }
  const rows = (reports ?? []).map((r) => {
    const items = (r.expense_items ?? []) as ItemLite[]
    return {
      ...r,
      total: round2(items.reduce((s, i) => s + Number(i.amount), 0)),
      // Only personal-paid money comes back to you; company-card charges never do.
      personal: round2(items.filter((i) => i.paid_by === 'personal').reduce((s, i) => s + Number(i.amount), 0)),
    }
  })

  // Reimbursement tracking is opt-in by use, and it switches on the first time
  // you mark anything reimbursed. Reports submitted before that are history you
  // were never tracking, so they stay unflagged — otherwise anyone who ticks one
  // box (or never ticks any) is left staring at a permanent pile of unpaid.
  const trackedFrom = rows
    .filter((r) => r.payment_received_on && r.submitted_at)
    .map((r) => r.submitted_at!)
    .sort()[0]
  const isTracked = (r: (typeof rows)[number]) =>
    Boolean(trackedFrom && r.status === 'submitted' && r.submitted_at && r.submitted_at >= trackedFrom)

  const awaiting = rows.filter((r) => isTracked(r) && !r.payment_received_on)
  const awaitingTotal = round2(awaiting.reduce((s, r) => s + r.personal, 0))

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Portal
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">My Expense Reports</h1>
          <form action={createReport}>
            <button
              type="submit"
              className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors"
            >
              New report
            </button>
          </form>
        </div>
        <p className="text-zinc-400 mb-6">
          Reimbursement requests — submitted reports are emailed to your supervisor for approval.
        </p>

        {awaiting.length > 0 && (
          <div className="mb-6 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-sm">
              <span className="font-medium">{fmtMoney(awaitingTotal)}</span>
              <span className="text-zinc-400">
                {' '}awaiting reimbursement across {awaiting.length} report{awaiting.length === 1 ? '' : 's'}
              </span>
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Based on what you've marked reimbursed — the portal can't see Harken's books.
            </p>
          </div>
        )}

        <div className="space-y-2 mb-12">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg has-[a:hover]:border-zinc-700 transition-colors"
            >
              <Link href={`/instructor/expenses/${r.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.reason?.trim() || 'Untitled report'}
                  <span
                    className={`ml-3 px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      r.status === 'submitted' ? 'bg-teal-900/60 text-teal-300' : 'bg-yellow-900/60 text-yellow-300'
                    }`}
                  >
                    {r.status === 'submitted' ? 'Submitted' : 'Draft'}
                  </span>
                  {isTracked(r) && !r.payment_received_on && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-800 text-zinc-400">
                      Not reimbursed
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {r.status === 'submitted' && r.submitted_at
                    ? `Submitted ${fmtDate(r.submitted_at)}`
                    : `Started ${fmtDate(r.created_at)}`}
                </p>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium">{fmtMoney(r.total)}</span>
                {r.status === 'submitted' && (
                  <ReimbursedToggle reportId={r.id} reimbursedOn={r.payment_received_on} />
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500 border border-zinc-800 rounded-lg">
              No expense reports yet. Start one with “New report.”
            </p>
          )}
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">Signature</h2>
          <SignaturePad hasSignature={Boolean(profile?.signature_data_url)} />
        </section>
      </div>
    </main>
  )
}
