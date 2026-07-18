import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ExpenseReportEditor, { type EditorItem, type CourseOption } from './ExpenseReportEditor'
import { type ExpenseRate, fmtMoney, computeTotals, CATEGORY_LABELS, fmtDateRange, type ExpenseCategory } from '@/lib/expenses'
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

  const { data: profile } = await admin
    .from('profiles')
    .select('is_exempt, signature_data_url')
    .eq('id', user.id)
    .single()

  const { data: itemRows } = await admin
    .from('expense_items')
    .select('id, start_date, end_date, category, paid_by, description, details, paid_for_others, miles, meal_count, amount, instance_id, expense_receipts(id, path, filename)')
    .eq('report_id', id)
    .order('start_date')
    .order('created_at')

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

  const { data: rateRows } = await admin
    .from('expense_rates')
    .select('id, rate_type, rate, effective_date')
  const rates = (rateRows ?? []).map((r) => ({ ...r, rate: Number(r.rate) })) as ExpenseRate[]

  const { data: instanceRows } = await admin
    .from('course_instances')
    .select('id, ref_number, course_type, custom_title, client_name, starts_at')
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: false, nullsFirst: false })
    .limit(60)
  const courses: CourseOption[] = (instanceRows ?? []).map((c) => ({
    id: c.id,
    label: instanceLabel(c),
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
          ← Expense Reports
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
