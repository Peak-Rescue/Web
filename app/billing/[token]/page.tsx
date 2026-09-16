import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { BILLER_QUEUE_STATUSES, type InvoiceRequest } from '@/lib/billing'
import BillingQueue from './BillingQueue'

// The biller's queue, at an address you can put in an email.
//
// Unauthenticated, and the token is the whole of the gate — the same bargain
// the quote, gear-order and shared-actuals pages make. A biller at Harken is
// not a student, an instructor or an admin, which are the only three roles
// this portal has; minting an account for an outside firm would buy an
// offboarding problem and a sign-in email their own mail filter may well eat.
//
// The token belongs to the person, not to a request: a biller works a queue,
// and one address she can bookmark beats hunting for whichever email carried
// the invoice she is looking at. Every active recipient sees the same list,
// so adding a second biller costs nothing; who marked what is recorded on the
// request itself.
//
// Deliberately narrow. Her rows carry the client, the course, the amount and
// who to bill — and nothing about what the course cost us, what anyone was
// paid, or what the margin was. This is a URL that can be forwarded.

export const metadata = { robots: { index: false, follow: false } }

export default async function BillingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound()

  const admin = createAdminClient()
  const { data: recipient } = await admin
    .from('billing_recipients')
    .select('id, name, org, active')
    .eq('token', token)
    .maybeSingle()
  // A deactivated recipient is a revoked link, and says so by being no page at
  // all rather than an empty one.
  if (!recipient || !recipient.active) notFound()

  const [{ data: openRows }, { data: doneRows }] = await Promise.all([
    admin
      .from('invoice_requests')
      .select('*')
      .in('status', BILLER_QUEUE_STATUSES)
      .order('created_at', { ascending: true }),
    // History, newest first. Capped because this list only grows, and the
    // question it answers ("did that one go through?") is always about a
    // recent one.
    admin
      .from('invoice_requests')
      .select('*')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(50),
  ])

  const num = (r: Record<string, unknown>) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    amount_received: r.amount_received === null || r.amount_received === undefined ? null : Number(r.amount_received),
  }) as InvoiceRequest

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-pr-red mb-2">Peak Rescue Mountain Guides</p>
        <h1 className="text-2xl md:text-3xl font-bold">Billing</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Courses to invoice · {recipient.name}
        </p>

        <BillingQueue
          token={token}
          open={(openRows ?? []).map(num)}
          paid={(doneRows ?? []).map(num)}
        />

        <p className="text-xs text-zinc-600 mt-10">
          Questions on any of these, reply to the email that brought you here.
        </p>
      </div>
    </main>
  )
}
