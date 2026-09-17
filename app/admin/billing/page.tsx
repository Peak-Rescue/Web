import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtMoney } from '@/lib/expenses'
import { isOpen, type BillingRecipient, type InvoiceRequest, type ReportRecipient } from '@/lib/billing'
import InfoHint from '@/components/InfoHint'
import Recipients from './Recipients'
import ReportRecipients from './ReportRecipients'
import RequestList from './RequestList'

// Our side of the Harken handoff: who bills for us, and everything we have
// asked them to bill.
//
// Deliberately not the biller's own page. An admin is already signed in, and
// sending them through her token would attribute their actions to her and turn
// a credential into something that gets passed around. Same rows, different
// door.

export default async function BillingAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: recipientRows }, { data: readerRows }, { data: requestRows }] = await Promise.all([
    admin.from('billing_recipients').select('*').order('active', { ascending: false }).order('name'),
    admin.from('report_recipients').select('*').order('active', { ascending: false }).order('name'),
    admin.from('invoice_requests').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  const recipients = (recipientRows ?? []) as BillingRecipient[]
  const readers = (readerRows ?? []) as ReportRecipient[]
  const requests = (requestRows ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    amount_received: r.amount_received === null || r.amount_received === undefined ? null : Number(r.amount_received),
  })) as InvoiceRequest[]

  const open = requests.filter(isOpen)
  const closed = requests.filter((r) => !isOpen(r))
  const outstanding = open.reduce((s, r) => s + r.amount, 0)

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-zinc-500 mt-1">
            What we have asked Harken to invoice, what has come back, and who outside the portal hears about a
            course&rsquo;s money.
          </p>
        </div>

        <section className="mb-10">
          {/* What the link is, kept behind the icon. It is an address rather
              than an account — no sign-in, unguessable, and the whole of what
              lets somebody at Harken work the queue — which is worth knowing
              once and nothing to re-read on every visit. */}
          <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
            Billers at Harken
            <InfoHint
              below
              text="Each biller has their own sign-in-free address into the queue — hand it over once and they bookmark it. The link is the credential, so what is done there is recorded as them."
            />
          </h2>
          <Recipients
            recipients={recipients}
            siteUrl={process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}
          />
        </section>

        {/* Two lists, because they are two sets of people. The billers are a
            firm's staff working a queue; these are whoever is asking about a
            course's numbers this quarter, and the overlap is not reliable
            enough to be a tick on one row. */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
            P&amp;L reporting list
            <InfoHint
              below
              text="Who is offered in the send on a course's actuals, one course at a time. Being on this list is not access to anything: the link goes out with the email, belongs to that course, and is revoked there."
            />
          </h2>
          <ReportRecipients recipients={readers} />
        </section>

        <section className="mb-10">
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <h2 className="text-sm font-semibold text-zinc-300">Open</h2>
            <span className="text-sm text-zinc-400 tabular-nums">{fmtMoney(outstanding)} outstanding</span>
          </div>
          {open.length === 0 ? (
            <p className="text-sm text-zinc-600">Nothing outstanding.</p>
          ) : (
            <RequestList requests={open} />
          )}
        </section>

        {closed.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-2">Settled</h2>
            <RequestList requests={closed} />
          </section>
        )}
      </div>
    </main>
  )
}
