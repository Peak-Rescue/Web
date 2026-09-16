import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { instanceLabel } from '@/lib/courses'
import { fmtMoney, round2 } from '@/lib/expenses'
import CardImport from './CardImport'
import ChargeTagger, { type ChargeRow } from './ChargeTagger'
import BatchList, { type BatchRow } from './BatchList'

// The company card, as a screen.
//
// Two jobs, in the order they happen: bring the statement in, then say what
// each charge was for. The second is the one that takes the time, so it gets
// the page — the import is a block at the top that is used once a month.
//
// A charge is never copied onto a course. Tagging it is the whole of the
// filing, and the course reads it live from here, so a charge answered wrongly
// is re-answered here and the money moves. That is the same arrangement
// expense-report money already has, for the same reason: two copies of one
// figure start disagreeing the day somebody corrects one of them.

export const dynamic = 'force-dynamic'

export default async function AdminCardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: chargeRows }, { data: batchRows }, { data: accountRows }, { data: courseRows }, { count: filedCount }] =
    await Promise.all([
      // The pile of work: charges nobody has answered for. Oldest first —
      // the ones that have been waiting longest are the ones whose course
      // people are about to stop remembering.
      admin
        .from('card_charges')
        .select('id, posted_date, description, amount, cardholder, account_id, batch_id')
        .is('instance_id', null)
        .eq('non_course', false)
        .order('posted_date')
        .limit(400),
      admin
        .from('card_import_batches')
        .select('id, created_at, source_name, row_count, skipped_count, profiles(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(12),
      admin.from('cost_accounts').select('id, label').eq('active', true).order('sort_order'),
      admin
        .from('course_instances')
        .select('id, ref_number, course_type, custom_title, client_name, location, starts_at')
        .order('starts_at', { ascending: false, nullsFirst: false })
        .limit(200),
      admin
        .from('card_charges')
        .select('id', { count: 'exact', head: true })
        .or('instance_id.not.is.null,non_course.eq.true'),
    ])

  const charges: ChargeRow[] = (chargeRows ?? []).map((c) => ({
    id: c.id as string,
    posted_date: c.posted_date as string,
    description: c.description as string,
    amount: Number(c.amount),
    cardholder: (c.cardholder as string | null) ?? null,
    account_id: (c.account_id as string | null) ?? null,
  }))

  const batches: BatchRow[] = (batchRows ?? []).map((b) => {
    const p = b.profiles as unknown as { first_name: string | null; last_name: string | null } | null
    return {
      id: b.id as string,
      created_at: b.created_at as string,
      source_name: (b.source_name as string | null) ?? 'Pasted',
      row_count: b.row_count as number,
      skipped_count: b.skipped_count as number,
      by: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null,
    }
  })

  const accounts = (accountRows ?? []).map((a) => ({ id: a.id as string, label: a.label as string }))
  const courses = (courseRows ?? []).map((c) => ({
    id: c.id as string,
    label: instanceLabel(c),
    starts_at: (c.starts_at as string | null) ?? null,
  }))

  const waiting = round2(charges.reduce((t, c) => t + c.amount, 0))

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      <div>
        <Link href="/admin/expenses" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Expenses
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Company card</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
          The statement, imported and filed. A charge counts towards a course from the moment it names one —
          nothing is copied, so changing the answer here moves the money there.
        </p>
      </div>

      <CardImport />

      <section>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 className="text-sm font-semibold text-zinc-200">
            Waiting for an answer
            {charges.length > 0 && <span className="ml-2 text-zinc-500 font-normal">{charges.length}</span>}
          </h2>
          {charges.length > 0 && <span className="text-xs text-zinc-500">{fmtMoney(waiting)} unfiled</span>}
        </div>
        {charges.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {(filedCount ?? 0) > 0
              ? 'Every charge imported so far has been filed.'
              : 'Nothing imported yet. Drop a statement in above and the charges will land here.'}
          </p>
        ) : (
          <ChargeTagger charges={charges} courses={courses} accounts={accounts} />
        )}
      </section>

      {batches.length > 0 && <BatchList batches={batches} />}
    </div>
  )
}
