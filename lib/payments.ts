import 'server-only'
import { after } from 'next/server'
import { type createAdminClient } from '@/lib/supabase/admin'
import { settledPaymentForOrder, type SettledPayment } from '@/lib/square'
import { courseShortName } from '@/lib/courses'
import { describeForBiller } from '@/lib/billing'
import { quoteNumber } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'
import { sendMail } from '@/lib/mailer'

type Admin = ReturnType<typeof createAdminClient>

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'

/** Whether this quote can still be paid by card, and if not, why not. Shared
    by the page (to decide whether to show the button) and the action (which
    is what actually decides). */
export async function cardPaymentBlocker(
  admin: Admin,
  quote: { id: string; status: string; total: number | string }
): Promise<string | null> {
  if (quote.status !== 'accepted') return 'Accept the quote first'
  if (!(Number(quote.total) > 0)) return 'This quote has no amount to pay'
  const [{ data: done }, { data: handed }] = await Promise.all([
    admin.from('payments').select('id').eq('quote_id', quote.id).eq('status', 'completed').limit(1),
    // Already sent to Harken to invoice: a card payment on top of that is
    // how a client pays twice. The invoice is their way to pay from here.
    admin
      .from('invoice_requests')
      .select('id')
      .eq('quote_id', quote.id)
      .is('payment_id', null)
      .neq('status', 'cancelled')
      .limit(1),
  ])
  if ((done ?? []).length > 0) return 'This quote has already been paid'
  if ((handed ?? []).length > 0) return 'This quote is being invoiced — please pay against the invoice'
  return null
}

/** Closes a payment if Square says its order is paid, and does whatever being
    paid means for the thing it paid for. Safe to call any number of times
    from anywhere: the webhook, and the client landing back on the page. */
export async function settleOrder(admin: Admin, orderId: string): Promise<'completed' | 'unpaid' | 'unknown'> {
  const { data: row } = await admin
    .from('payments')
    .select('id, kind, status')
    .eq('square_order_id', orderId)
    .maybeSingle()
  if (!row) return 'unknown'
  if (row.status === 'completed') return 'completed'

  const paid = await settledPaymentForOrder(orderId)
  if (!paid) return 'unpaid'

  // The open → completed flip is the lock. Whoever wins it does the side
  // effects; a webhook retry racing the client's return gets nothing back here
  // and stops.
  const { data: won } = await admin
    .from('payments')
    .update({
      status: 'completed',
      square_payment_id: paid.paymentId,
      amount_paid: paid.amountPaid,
      receipt_url: paid.receiptUrl,
      payer_email: paid.payerEmail,
      paid_at: paid.paidAt,
    })
    .eq('id', row.id)
    .eq('status', 'open')
    .select('id, kind, instance_id, quote_id')
    .maybeSingle()
  if (!won) return 'completed'

  if (won.kind === 'quote' && won.instance_id) {
    await quotePaid(admin, { paymentId: won.id, instanceId: won.instance_id, quoteId: won.quote_id }, paid)
  }
  return 'completed'
}

// A quote paid by card goes to Harken already paid. Nothing for them to
// collect; they get the record and the receipt, and keep their books however
// they keep them. On our side it reads exactly as a request Harken had marked
// paid, so the course's billing state moves to Paid by itself.
async function quotePaid(
  admin: Admin,
  ids: { paymentId: string; instanceId: string; quoteId: string | null },
  paid: SettledPayment
) {
  const [{ data: inst }, { data: quote }, { data: billers }] = await Promise.all([
    admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, starts_at, ends_at')
      .eq('id', ids.instanceId)
      .single(),
    ids.quoteId
      ? admin.from('course_quotes').select('quote_seq, accepted_name, accepted_title').eq('id', ids.quoteId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('billing_recipients').select('name, email, token').eq('active', true),
  ])
  if (!inst) return

  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const qNum = quote ? quoteNumber(inst.ref_number, quote.quote_seq) : null
  const description = describeForBiller({
    refNumber: inst.ref_number,
    courseName,
    clientName: inst.client_name,
    startsAt: inst.starts_at,
    endsAt: inst.ends_at,
  })
  const payer = [quote?.accepted_name, quote?.accepted_title].filter(Boolean).join(', ') || null
  const paidOn = new Date(paid.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const note = [
    `Paid by card through Square on ${paidOn}. Nothing to collect.`,
    ...(paid.receiptUrl ? [`Receipt: ${paid.receiptUrl}`] : []),
  ].join('\n')

  const { error } = await admin.from('invoice_requests').insert({
    instance_id: ids.instanceId,
    quote_id: ids.quoteId,
    quote_number: qNum,
    payment_id: ids.paymentId,
    amount: paid.amountPaid,
    description,
    bill_to_org: inst.client_name,
    bill_to_name: payer ?? inst.client_name ?? 'Card payer',
    bill_to_email: paid.payerEmail,
    admin_note: note,
    status: 'paid',
    sent_at: paid.paidAt,
    sent_to: (billers ?? []).map((b) => b.name as string),
    paid_at: paid.paidAt,
    amount_received: paid.amountPaid,
  })
  if (error) console.error('Could not record card payment as an invoice request:', error)

  if (!process.env.RESEND_API_KEY) return
  after(async () => {
    const subjectTail = `${qNum ? `${qNum} — ` : ''}${description}`
    for (const b of billers ?? []) {
      try {
        await sendMail({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: [b.email as string],
          subject: `Paid by card: ${subjectTail}`,
          text: [
            `Hi ${(b.name as string).split(' ')[0]},`,
            '',
            `The client paid ${fmtMoney(paid.amountPaid)} by card through Square. There is nothing to invoice or collect. This is for your records.`,
            '',
            description,
            ...(qNum ? [`Our quote: ${qNum}`] : []),
            '',
            'Paid by:',
            [payer, inst.client_name].filter(Boolean).join(' · ') || 'Not given',
            ...(paid.payerEmail ? [paid.payerEmail] : []),
            ...(paid.receiptUrl ? ['', `Square receipt: ${paid.receiptUrl}`] : []),
            '',
            `It is in your queue under Paid: ${siteUrl()}/billing/${b.token}`,
            '',
            'Thank you,',
            'Peak Rescue',
          ].join('\n'),
        })
      } catch (e) {
        console.error('Card payment mail to biller failed:', e)
      }
    }
    try {
      const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin')
      const to = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
      if (to.length > 0) {
        await sendMail({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to,
          subject: `💳 ${fmtMoney(paid.amountPaid)} paid by card: ${subjectTail}`,
          text: [
            `${payer ?? 'The client'} paid ${fmtMoney(paid.amountPaid)} by card${qNum ? ` for ${qNum}` : ''}.`,
            '',
            `Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}`,
            'It has been recorded as paid and Harken has been told. There is no need to send it to them.',
            ...(paid.receiptUrl ? ['', `Square receipt: ${paid.receiptUrl}`] : []),
          ].join('\n'),
        })
      }
    } catch (e) {
      console.error('Card payment mail to admins failed:', e)
    }
  })
}
