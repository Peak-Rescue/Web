import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtMoney } from '@/lib/expenses'
import { INVOICE_STATUS_LABEL, isOpen, type BillingRecipient, type InvoiceRequest } from '@/lib/billing'
import Recipients from './Recipients'

// Our side of the Harken handoff: who bills for us, and everything we have
// asked them to bill.
//
// Deliberately not the biller's own page. An admin is already signed in, and
// sending them through her token would attribute their actions to her and turn
// a credential into something that gets passed around. Same rows, different
// door.

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

export default async function BillingAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: recipientRows }, { data: requestRows }] = await Promise.all([
    admin.from('billing_recipients').select('*').order('active', { ascending: false }).order('name'),
    admin.from('invoice_requests').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  const recipients = (recipientRows ?? []) as BillingRecipient[]
  const requests = (requestRows ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    amount_received: r.amount_received === null || r.amount_received === undefined ? null : Number(r.amount_received),
  })) as InvoiceRequest[]

  const open = requests.filter(isOpen)
  const closed = requests.filter((r) => !isOpen(r))
  const outstanding = open.reduce((s, r) => s + r.amount, 0)

  const Row = ({ r }: { r: InvoiceRequest }) => (
    <li className="border-b border-zinc-900 py-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <Link href={`/portal/${r.instance_id}`} className="text-sm text-zinc-300 hover:text-white transition-colors min-w-0 flex-1">
        {r.description ?? 'Course'}
        {r.quote_number ? <span className="text-zinc-600"> · {r.quote_number}</span> : null}
      </Link>
      <span className="text-sm text-zinc-400 tabular-nums">{fmtMoney(r.amount)}</span>
      <span className="text-xs text-zinc-500 w-28 text-right">
        {INVOICE_STATUS_LABEL[r.status]}
        {r.status === 'paid' && r.amount_received != null && r.amount_received !== r.amount
          ? ` ${fmtMoney(r.amount_received)}`
          : ''}
      </span>
      <span className="text-xs text-zinc-600 w-20 text-right">
        {shortDate(r.paid_at ?? r.invoiced_at ?? r.sent_at)}
      </span>
    </li>
  )

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-zinc-500 mt-1">
            What we have asked Harken to invoice, and what has come back.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Billers at Harken</h2>
          <Recipients
            recipients={recipients}
            siteUrl={process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}
          />
        </section>

        <section className="mb-10">
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <h2 className="text-sm font-semibold text-zinc-300">Open</h2>
            <span className="text-sm text-zinc-400 tabular-nums">{fmtMoney(outstanding)} outstanding</span>
          </div>
          {open.length === 0 ? (
            <p className="text-sm text-zinc-600">Nothing outstanding.</p>
          ) : (
            <ul>{open.map((r) => <Row key={r.id} r={r} />)}</ul>
          )}
        </section>

        {closed.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-2">Settled</h2>
            <ul>{closed.map((r) => <Row key={r.id} r={r} />)}</ul>
          </section>
        )}
      </div>
    </main>
  )
}
