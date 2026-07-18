import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import DeleteReportButton from './DeleteReportButton'
import { fmtMoney, round2 } from '@/lib/expenses'
import { instanceLabel } from '@/lib/courses'

export default async function AdminExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: reportRows } = await admin
    .from('expense_reports')
    .select('id, created_at, reason, status, submitted_at, profile_id, default_instance_id, profiles(first_name, last_name), expense_items(amount, paid_by, instance_id)')
    .order('created_at', { ascending: false })

  type ItemLite = { amount: number; paid_by: string; instance_id: string | null }
  const reports = (reportRows ?? []).map((r) => {
    const items = (r.expense_items ?? []) as ItemLite[]
    const p = r.profiles as unknown as { first_name: string | null; last_name: string | null } | null
    return {
      id: r.id,
      created_at: r.created_at,
      reason: r.reason,
      status: r.status,
      submitted_at: r.submitted_at,
      default_instance_id: r.default_instance_id,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unknown',
      total: round2(items.reduce((s, i) => s + Number(i.amount), 0)),
      personal: round2(items.filter((i) => i.paid_by === 'personal').reduce((s, i) => s + Number(i.amount), 0)),
      items,
    }
  })

  // Per-course rollup (submitted reports only): item course link, falling back
  // to the report's default course.
  const courseTotals = new Map<string, number>()
  for (const r of reports) {
    if (r.status !== 'submitted') continue
    for (const i of r.items) {
      const key = i.instance_id ?? r.default_instance_id ?? 'none'
      courseTotals.set(key, round2((courseTotals.get(key) ?? 0) + Number(i.amount)))
    }
  }
  const instanceIds = [...courseTotals.keys()].filter((k) => k !== 'none')
  const { data: instances } = instanceIds.length
    ? await admin
        .from('course_instances')
        .select('id, ref_number, course_type, custom_title, client_name, location, starts_at')
        .in('id', instanceIds)
    : { data: [] }
  const instanceMap = new Map((instances ?? []).map((i) => [i.id, instanceLabel(i)]))
  const rollup = [...courseTotals.entries()]
    .map(([key, total]) => ({
      key,
      total,
      label: key === 'none' ? 'No course / general' : instanceMap.get(key) ?? 'Unknown course',
    }))
    .sort((a, b) => b.total - a.total)

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const submitted = reports.filter((r) => r.status === 'submitted')
  const drafts = reports.filter((r) => r.status === 'draft')

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Portal
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Expenses</h1>
          <Link
            href="/admin/expenses/rates"
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors"
          >
            Manage rates
          </Link>
        </div>
        <p className="text-zinc-400 mb-10">All expense reports and per-course spending</p>

        {/* ── Submitted reports ── */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Submitted</h2>
          {submitted.length > 0 ? (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {submitted.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.name}
                      {r.reason ? <span className="text-zinc-400 font-normal"> — {r.reason}</span> : null}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Submitted {r.submitted_at ? fmtDate(r.submitted_at) : '—'} · reimburse {fmtMoney(r.personal)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-sm font-medium">{fmtMoney(r.total)}</span>
                    <a
                      href={`/instructor/expenses/${r.id}/pdf`}
                      className="text-xs text-zinc-400 hover:text-white underline transition-colors"
                    >
                      PDF
                    </a>
                    <DeleteReportButton reportId={r.id} label={`${r.name} — ${fmtMoney(r.total)}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No submitted reports yet.</p>
          )}
        </section>

        {/* ── Drafts ── */}
        {drafts.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold mb-4">In progress</h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {drafts.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {r.name}
                      {r.reason ? <span className="text-zinc-400 font-normal"> — {r.reason}</span> : null}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">Started {fmtDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-sm text-zinc-400">{fmtMoney(r.total)}</span>
                    <DeleteReportButton reportId={r.id} label={`${r.name} — draft`} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Per-course rollup ── */}
        <section>
          <h2 className="text-lg font-semibold mb-1">Spending by course</h2>
          <p className="text-xs text-zinc-500 mb-4">Submitted reports only. The first brick of per-course P&amp;L.</p>
          {rollup.length > 0 ? (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {rollup.map((row) => (
                <div key={row.key} className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm">{row.label}</span>
                  <span className="text-sm font-medium">{fmtMoney(row.total)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Nothing submitted yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}
