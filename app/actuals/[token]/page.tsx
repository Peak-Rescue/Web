import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'
import { loadActuals } from '@/lib/actuals-data'
import { expenseLineLabel, payLineName } from '@/lib/actuals'
import { fmtMoney, fmtDateRange } from '@/lib/expenses'
import { dateAtOffice, longDate } from '@/lib/course-clock'

// The course's profit and loss, at an address you can put in an email.
//
// Read-only and unauthenticated: the token is the whole of the gate, the same
// bargain the quote and gear-order pages make. It reads live rather than
// freezing a copy, so a corrected expense report changes what the recipient
// sees — which is the right behaviour for a working number and the reason the
// page says what it is as of.

export const metadata = { robots: { index: false, follow: false } }

export default async function SharedActualsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound()

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('course_actuals')
    .select('instance_id')
    .eq('share_token', token)
    .maybeSingle()
  if (!row) notFound()

  const instanceId = row.instance_id as string
  const [{ data: inst }, actuals, { data: quoteRows }] = await Promise.all([
    admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, starts_at, ends_at, location')
      .eq('id', instanceId)
      .maybeSingle(),
    loadActuals(admin, instanceId),
    admin
      .from('course_quotes')
      .select('quote_seq, total, status, archived_at')
      .eq('instance_id', instanceId)
      .order('quote_seq', { ascending: false }),
  ])
  if (!inst) notFound()

  const { rolled } = actuals
  const accepted = (quoteRows ?? []).find((q) => q.status === 'accepted' && !q.archived_at)
  const dates = inst.starts_at
    ? `${inst.starts_at}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${inst.ends_at}` : ''}`
    : null

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-pr-red mb-2">Peak Rescue Mountain Guides</p>
        <h1 className="text-2xl md:text-3xl font-bold">
          {courseShortName(inst.course_type, inst.custom_title)} — actuals
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {[`PR-${inst.ref_number}`, inst.client_name, dates, inst.location].filter(Boolean).join(' · ')}
        </p>

        <p className="text-xs text-zinc-500 mt-4">
          {actuals.closedAt
            ? `Closed ${longDate(dateAtOffice(actuals.closedAt))}.`
            : 'These figures move as expense reports are filed and corrected.'}
        </p>

        <a
          href={`/actuals/${token}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-4 px-3 py-1.5 rounded border border-zinc-700 text-xs text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors"
        >
          Download as PDF
        </a>

        {/* ── Invoiced ─────────────────────────────────────────────────── */}
        <Section title="Invoiced">
          <Line label="Billed to the client" amount={rolled.invoiced} strong />
          {accepted && Math.abs(Number(accepted.total) - rolled.invoiced) > 0.005 && (
            <Line label={`Quote ${accepted.quote_seq}, as accepted`} amount={Number(accepted.total)} muted indent />
          )}
        </Section>

        {/* ── Pay ──────────────────────────────────────────────────────── */}
        <Section title="Pay">
          {actuals.payLines.length === 0 && <p className="text-sm text-zinc-500">No pay recorded.</p>}
          {actuals.payLines.map((l) => (
            <Line
              key={l.id}
              indent
              label={
                [payLineName(l, actuals.peopleById), l.description].filter(Boolean).join(' — ') ||
                'Pay'
              }
              amount={l.amount}
            />
          ))}
          <div className="mt-2 pt-2 border-t border-zinc-800">
            <Line label="Pay total" amount={rolled.payTotal} />
            <Line label={`Payroll load at ${Math.round(actuals.payrollLoadPct * 1000) / 10}%`} amount={rolled.payrollLoad} />
            <Line label="Instructor pay" amount={rolled.instructorPay} strong />
          </div>
        </Section>

        {/* ── Costs ────────────────────────────────────────────────────── */}
        <Section title="Costs">
          {rolled.accounts.map((r) => (
            <Line
              key={r.account.id}
              indent
              muted={r.total === 0}
              label={r.account.label}
              note={
                r.fromExpenses > 0
                  ? `${fmtMoney(r.fromExpenses)} from ${r.expenseLines.length} expense line${r.expenseLines.length === 1 ? '' : 's'}`
                  : null
              }
              amount={r.total}
            />
          ))}
          {rolled.unfiled.amount > 0 && (
            <Line indent label="Not filed to an account" amount={rolled.unfiled.amount} />
          )}
          <Line indent label="Instructor pay" amount={rolled.instructorPay} />
          <div className="mt-2 pt-2 border-t border-zinc-800">
            <Line label="Costs total" amount={rolled.costsTotal} strong />
          </div>
        </Section>

        {/* ── What it left ─────────────────────────────────────────────── */}
        <div className="mt-8 pt-5 border-t border-zinc-700 flex items-baseline justify-between gap-4">
          <span className="text-base font-semibold">Net</span>
          <span className={`text-xl font-semibold ${rolled.net < 0 ? 'text-pr-red-light' : 'text-emerald-400'}`}>
            {fmtMoney(rolled.net)}
            {rolled.netPct !== null && (
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {(rolled.netPct * 100).toFixed(2)}% of invoiced
              </span>
            )}
          </span>
        </div>

        {rolled.pending.amount > 0 && (
          <p className="mt-4 text-xs text-amber-400/90">
            {fmtMoney(rolled.pending.amount)} across {rolled.pending.lines.length} expense line
            {rolled.pending.lines.length === 1 ? '' : 's'} is still in draft, and not counted.
          </p>
        )}

        {actuals.notes?.trim() && (
          <Section title="Notes">
            <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">{actuals.notes.trim()}</p>
          </Section>
        )}

        {/* The lines behind the totals. Somebody always asks what the travel
            was, and the answer living in another document is how a page like
            this gets queried by email instead of read. */}
        {rolled.accounts.some((a) => a.expenseLines.length > 0) && (
          <Section title="Expense-report lines behind those totals">
            {rolled.accounts
              .filter((a) => a.expenseLines.length > 0)
              .map((r) => (
                <div key={r.account.id} className="mb-4">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5">{r.account.label}</p>
                  {r.expenseLines.map((l) => (
                    <Line
                      key={l.id}
                      indent
                      muted
                      label={`${fmtDateRange(l.start_date, null)}  ${expenseLineLabel(l)}`}
                      note={[l.personName, l.paid_by === 'company_card' ? 'company card' : null].filter(Boolean).join(', ') || null}
                      amount={l.amount}
                    />
                  ))}
                </div>
              ))}
          </Section>
        )}
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[11px] uppercase tracking-widest text-zinc-400 pb-1.5 mb-3 border-b border-zinc-800">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Line({
  label,
  note,
  amount,
  strong,
  muted,
  indent,
}: {
  label: string
  note?: string | null
  amount: number
  strong?: boolean
  muted?: boolean
  indent?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-0.5 ${indent ? 'pl-3' : ''}`}>
      <span className={`min-w-0 ${strong ? 'text-sm font-medium text-zinc-100' : muted ? 'text-sm text-zinc-500' : 'text-sm text-zinc-300'}`}>
        {label}
        {note && <span className="ml-2 text-xs text-zinc-600">{note}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? 'text-sm font-medium text-zinc-100' : muted ? 'text-sm text-zinc-500' : 'text-sm text-zinc-300'}`}>
        {fmtMoney(amount)}
      </span>
    </div>
  )
}
