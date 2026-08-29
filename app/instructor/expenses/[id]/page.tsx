import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ExpenseReportEditor, { type EditorItem, type CourseOption } from './ExpenseReportEditor'
import { fmtMoney, computeTotals, CATEGORY_LABELS, fmtDateRange, type ExpenseCategory } from '@/lib/expenses'
import { loadCurrentRates } from '@/lib/expense-report-data'
import { instanceLabel } from '@/lib/courses'

export default async function ExpenseReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: report } = await admin
    .from('expense_reports')
    .select('id, profile_id, reason, status, submitted_at, default_instance_id')
    .eq('id', id)
    .single()
  if (!report || report.profile_id !== user.id) notFound()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 365)
  const cutoff = cutoffDate.toISOString().slice(0, 10)
  const instanceCols = 'id, ref_number, course_type, custom_title, client_name, location, starts_at'

  // Everything independent of the item list, in one parallel round.
  const [{ data: profile }, { data: itemRows }, rates, { data: instanceRows }, { data: myAssignments }] =
    await Promise.all([
      admin.from('profiles').select('is_exempt, signature_data_url').eq('id', user.id).single(),
      admin
        .from('expense_items')
        .select('id, start_date, end_date, category, paid_by, description, details, paid_for_others, miles, meal_count, amount, instance_id, expense_receipts(id, path, filename)')
        .eq('report_id', id)
        .order('start_date')
        .order('created_at'),
      loadCurrentRates(),
      admin
        .from('course_instances')
        .select(instanceCols)
        .neq('status', 'cancelled')
        .or(`starts_at.gte.${cutoff},starts_at.is.null`)
        .order('starts_at', { ascending: false, nullsFirst: false })
        .limit(300),
      // "Your courses": via instructors.profile_id — instance_instructors
      // points at the instructors table, not profiles.
      admin
        .from('instance_instructors')
        .select('instance_id, instructors!inner(profile_id)')
        .eq('instructors.profile_id', user.id),
    ])

  // Signed URLs so receipt files (private bucket) can be viewed — one batched
  // call for the whole report instead of a round trip per receipt.
  type ReceiptRow = { id: string; path: string; filename: string | null }
  const allPaths = (itemRows ?? []).flatMap((row) =>
    ((row.expense_receipts ?? []) as ReceiptRow[]).map((r) => r.path)
  )
  const { data: signedAll } = allPaths.length
    ? await admin.storage.from('expense-receipts').createSignedUrls(allPaths, 3600)
    : { data: [] }
  const urlByPath = new Map((signedAll ?? []).map((s) => [s.path, s.signedUrl]))

  const items: EditorItem[] = []
  for (const row of itemRows ?? []) {
    const receipts = ((row.expense_receipts ?? []) as ReceiptRow[]).map((r) => ({
      id: r.id,
      filename: r.filename ?? 'receipt',
      url: urlByPath.get(r.path) ?? '#',
    }))
    items.push({
      id: row.id,
      start_date: row.start_date,
      end_date: row.end_date,
      category: row.category as ExpenseCategory,
      paid_by: row.paid_by,
      description: row.description,
      details: row.details,
      paid_for_others: row.paid_for_others,
      miles: row.miles === null ? null : Number(row.miles),
      meal_count: row.meal_count,
      amount: Number(row.amount),
      instance_id: row.instance_id,
      receipts,
    })
  }

  // The picker opens on the caller's own courses nearest to today — that's
  // what almost every expense belongs to — and searches the rest. The rest is
  // a rolling window that starts 12 months back and runs out as far as the
  // schedule goes. Two things are pulled in whatever their date: courses this
  // person is staffed on, and instances this report already references, so an
  // old draft never loses the course it was filed against.
  const windowRows = instanceRows ?? []
  const mine = new Set((myAssignments ?? []).map((a) => a.instance_id))
  const referencedIds = [
    ...new Set(
      [report.default_instance_id, ...items.map((i) => i.instance_id), ...mine].filter((v): v is string => Boolean(v))
    ),
  ].filter((rid) => !windowRows.some((c) => c.id === rid))
  const { data: referencedRows } = referencedIds.length
    ? await admin.from('course_instances').select(instanceCols).in('id', referencedIds)
    : { data: [] }

  const courses: CourseOption[] = [...windowRows, ...(referencedRows ?? [])].map((c) => ({
    id: c.id,
    label: instanceLabel(c),
    mine: mine.has(c.id),
    starts_at: c.starts_at,
  }))

  if (report.status === 'draft') {
    return (
      <ExpenseReportEditor
        report={{ id: report.id, reason: report.reason, default_instance_id: report.default_instance_id }}
        items={items}
        rates={rates}
        courses={courses}
        isExempt={profile?.is_exempt ?? false}
        hasSignature={Boolean(profile?.signature_data_url)}
      />
    )
  }

  // ── Submitted: read-only summary ────────────────────────────────────────────
  const totals = computeTotals(items)
  const courseMap = new Map(courses.map((c) => [c.id, c.label]))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/instructor/expenses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← My Expense Reports
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">{report.reason?.trim() || 'Expense report'}</h1>
          <a
            href={`/instructor/expenses/${report.id}/pdf`}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors"
          >
            Download PDF
          </a>
        </div>
        <p className="text-zinc-400 mb-8">
          Submitted{' '}
          {report.submitted_at &&
            new Date(report.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
          · emailed to your supervisor for approval.
        </p>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800 mb-6">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {CATEGORY_LABELS[item.category as ExpenseCategory]}
                  {item.description ? ` — ${item.description}` : ''}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {fmtDateRange(item.start_date, item.end_date)}
                  {item.paid_by === 'company_card' ? ' · company card' : ''}
                  {item.instance_id && courseMap.has(item.instance_id) ? ` · ${courseMap.get(item.instance_id)}` : ''}
                  {item.receipts.length > 0 && (
                    <>
                      {' · '}
                      {item.receipts.map((r, i) => (
                        <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">
                          receipt{item.receipts.length > 1 ? ` ${i + 1}` : ''}
                        </a>
                      ))}
                    </>
                  )}
                </p>
              </div>
              <span className="text-sm font-medium shrink-0">{fmtMoney(item.amount)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-8 text-sm px-4">
          <div className="text-right space-y-1">
            <p className="text-zinc-400">Company card: {fmtMoney(totals.companyCard)}</p>
            <p className="text-zinc-400">Personal-paid: {fmtMoney(totals.personal)}</p>
            <p className="font-semibold text-base">Total: {fmtMoney(totals.total)}</p>
          </div>
        </div>
      </div>
    </main>
  )
}
