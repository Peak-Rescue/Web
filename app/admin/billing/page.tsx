import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtMoney } from '@/lib/expenses'
import { isOpen, type BillingRecipient, type InvoiceRequest, type ReportRecipient } from '@/lib/billing'
import InfoHint from '@/components/InfoHint'
import Recipients from './Recipients'
import ReportRecipients from './ReportRecipients'
import { panel, panelBody, panelHead, panelTitle, sectionTitle } from '@/lib/ui'
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
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <h2 className={panelTitle}>Open</h2>
            <span className="text-sm text-zinc-400 tabular-nums">{fmtMoney(outstanding)} outstanding</span>
          </div>
          {open.length === 0 ? (
            <p className="text-sm text-zinc-600">Nothing outstanding.</p>
          ) : (
            <RequestList requests={open} />
          )}
        </section>

        {closed.length > 0 && (
          <section className="mb-10">
            <h2 className={`${panelTitle} mb-2`}>Settled</h2>
            <RequestList requests={closed} />
          </section>
        )}

        {/* The lists that decide who any of the above reaches. Below the
            invoices rather than above them: this page is opened to find out
            where an invoice has got to, and an address book at the top of it
            was furniture in front of the door. */}
        <div className="pt-8 border-t border-zinc-800">
          <h2 className={`${sectionTitle} mb-4`}>Who we write to</h2>
          {/* Two lists that do different jobs, so two boxes rather than two
              headings and a gap. Stacked as bare sections they read as one long
              list of people with a label halfway down it — and getting them
              confused is not a cosmetic mistake: one of these lists carries
              pay and margin. Each is banded with its own name, and says under
              it in a line what being on it means. */}
          <section className={`${panel} mb-6`}>
            <div className={panelHead}>
              <h2 className={panelTitle}>Billers at Harken</h2>
              {/* What the link is, kept behind the icon. It is an address rather
                  than an account — no sign-in, unguessable, and the whole of
                  what lets somebody at Harken work the queue — worth knowing
                  once and nothing to re-read on every visit. */}
              <InfoHint
                below
                text="Each biller has their own sign-in-free address into the queue — hand it over once and they bookmark it. The link is the credential, so what is done there is recorded as them."
              />
              <span className="text-xs text-zinc-500 ml-auto">Raise our invoices · hold a queue link</span>
            </div>
            <div className={panelBody}>
              <Recipients
                recipients={recipients}
                siteUrl={process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}
              />
            </div>
          </section>

          <section className={`${panel} mb-10`}>
            <div className={panelHead}>
              <h2 className={panelTitle}>P&amp;L reporting list</h2>
              <InfoHint
                below
                text="Who is offered in the send on a course's actuals, one course at a time. Being on this list is not access to anything: the link goes out with the email, belongs to that course, and is revoked there."
              />
              <span className="text-xs text-zinc-500 ml-auto">Read a course&rsquo;s numbers · hold nothing</span>
            </div>
            <div className={panelBody}>
              <ReportRecipients recipients={readers} />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
