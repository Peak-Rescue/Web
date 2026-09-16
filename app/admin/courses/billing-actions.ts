'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireAdminUser } from '@/lib/course-access'
import { parseContacts, billTo } from '@/lib/contacts'
import { courseShortName } from '@/lib/courses'
import { describeForBiller, parseMoney } from '@/lib/billing'
import { quoteNumber } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'
import { sendMail } from '@/lib/mailer'

type Result = { ok: true } | { ok: false; error: string }

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'

// Hand a course to Harken to be billed.
//
// Everything the biller needs is copied onto the request here and never read
// live again. A request is the thing Harken acted on: it has to read a year
// from now exactly as it read the day it was sent, and a POC corrected next
// week must not silently change an invoice already raised against it.
//
// Which is also what happens when the number moves afterwards. A cut day or a
// renegotiation is a second request, not an edit of the first.
export async function sendInvoiceRequest(instanceId: string, adminNote: string): Promise<Result> {
  const { user, admin } = await requireAdminUser()

  const [{ data: inst }, { data: quotes }, { data: recipients }] = await Promise.all([
    admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, starts_at, ends_at, contacts')
      .eq('id', instanceId)
      .maybeSingle(),
    admin
      .from('course_quotes')
      .select('id, quote_seq, total, status, archived_at')
      .eq('instance_id', instanceId)
      .eq('status', 'accepted')
      .order('quote_seq', { ascending: false }),
    admin.from('billing_recipients').select('id, name, email, token').eq('active', true),
  ])
  if (!inst) return { ok: false, error: 'Course not found' }

  // The two guards that stop a useless request going out. A row with a blank
  // payee or a number nobody agreed to is worse than no row: the biller has to
  // come back to us to find out what it means, which is the whole of what this
  // was meant to save.
  //
  // The payee is the course's own contact unless a POC is tagged billing. On
  // nearly every course the person who booked it is the person invoiced, and
  // demanding the tag anyway blocked the handover on re-stating the obvious.
  const payee = billTo(parseContacts(inst.contacts))
  if (!payee) return { ok: false, error: 'Add a point of contact in Details first' }

  const accepted = (quotes ?? []).find((q) => !q.archived_at)
  if (!accepted) return { ok: false, error: 'No accepted quote on this course yet' }

  const to = (recipients ?? []).map((r) => r.email).filter(Boolean)
  if (to.length === 0) return { ok: false, error: 'No active billing recipient — add one first' }

  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const description = describeForBiller({
    refNumber: inst.ref_number,
    courseName,
    clientName: inst.client_name,
    startsAt: inst.starts_at,
    endsAt: inst.ends_at,
  })
  const amount = Number(accepted.total)
  // The number on the document the client actually received — what they will
  // reconcile the invoice against, and what tells a re-quote's request apart
  // from the first one.
  const qNum = quoteNumber(inst.ref_number, accepted.quote_seq as number)

  const { error } = await admin.from('invoice_requests').insert({
    instance_id: instanceId,
    quote_id: accepted.id,
    quote_number: qNum,
    amount,
    description,
    bill_to_org: inst.client_name,
    bill_to_name: payee.contact.name || null,
    bill_to_email: payee.contact.emails[0] ?? null,
    bill_to_phone: payee.contact.phones[0] ?? null,
    admin_note: adminNote.trim().slice(0, 2000) || null,
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_by: user.id,
  })
  if (error) return { ok: false, error: 'Could not create the request — please try again' }

  // Every active recipient is told, and each gets their own link: the queue is
  // shared, the address into it is not.
  if (process.env.RESEND_API_KEY) {
    after(async () => {
      for (const r of recipients ?? []) {
        try {
          await sendMail({
            from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
            to: [r.email],
            subject: `Please invoice ${qNum} — ${description}`,
            text: [
              `Hi ${r.name.split(' ')[0]},`,
              '',
              `Please raise an invoice for ${fmtMoney(amount)}.`,
              '',
              description,
              `Our quote: ${qNum}`,
              '',
              'Bill to:',
              [payee.contact.name, inst.client_name].filter(Boolean).join(' · '),
              ...(payee.contact.emails[0] ? [payee.contact.emails[0]] : []),
              ...(payee.contact.phones[0] ? [payee.contact.phones[0]] : []),
              ...(adminNote.trim() ? ['', adminNote.trim()] : []),
              '',
              `Mark it invoiced and record payment here: ${siteUrl()}/billing/${r.token}`,
              '',
              'Thank you,',
              'Peak Rescue',
            ].join('\n'),
          })
        } catch (e) {
          console.error('Invoice request mail failed:', e)
        }
      }
    })
  }

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath('/admin/billing')
  return { ok: true }
}

// ─── Recording a milestone from our side ─────────────────────────────────────
//
// The biller marks her own work on her own page, and that stays the ordinary
// route. These are for when it happens anywhere else: a number confirmed in a
// reply, a payment mentioned on a call. Without them the portal goes on
// saying "with Harken" about a course that was invoiced and paid months ago,
// and the only remedy was asking her to click something about work she had
// already finished.
//
// Deliberately the same two milestones and nothing more. The amount, who to
// bill and which course are what we asked for, and a request has to keep
// reading as what we asked for.

export async function recordInvoiced(
  requestId: string,
  input: { invoiceNumber: string; note: string }
): Promise<Result> {
  const { user, admin } = await requireAdminUser()
  const { data: req } = await admin
    .from('invoice_requests')
    .select('id, instance_id, status, invoiced_at')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: 'Not found' }
  if (req.status === 'cancelled') return { ok: false, error: 'This request was withdrawn' }

  const { error } = await admin
    .from('invoice_requests')
    .update({
      // A paid request stays paid: learning its invoice number afterwards is
      // new information about it, not a step backwards through the statuses.
      status: req.status === 'paid' ? 'paid' : 'invoiced',
      // Kept from the first time, so correcting a number does not restate
      // when the invoice was actually raised.
      invoiced_at: req.invoiced_at ?? new Date().toISOString(),
      invoice_number: input.invoiceNumber.trim().slice(0, 120) || null,
      invoiced_by_admin: user.id,
      admin_note: input.note.trim().slice(0, 2000) || undefined,
    })
    .eq('id', req.id)
  if (error) return { ok: false, error: 'Could not record that — please try again' }

  revalidatePath(`/portal/${req.instance_id}`)
  revalidatePath('/admin/billing')
  return { ok: true }
}

export async function recordPaid(
  requestId: string,
  input: { amountReceived: string; note: string }
): Promise<Result> {
  const { user, admin } = await requireAdminUser()
  const { data: req } = await admin
    .from('invoice_requests')
    .select('id, instance_id, status, paid_at')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: 'Not found' }
  if (req.status === 'cancelled') return { ok: false, error: 'This request was withdrawn' }

  // What arrived, not what was asked for. The two are kept apart because a
  // short payment is exactly the thing this has to be able to say.
  const received = parseMoney(input.amountReceived)
  if (received === null) return { ok: false, error: 'Enter the amount received' }

  const { error } = await admin
    .from('invoice_requests')
    .update({
      status: 'paid',
      paid_at: req.paid_at ?? new Date().toISOString(),
      amount_received: received,
      paid_by_admin: user.id,
      admin_note: input.note.trim().slice(0, 2000) || undefined,
    })
    .eq('id', req.id)
  if (error) return { ok: false, error: 'Could not record that — please try again' }

  revalidatePath(`/portal/${req.instance_id}`)
  revalidatePath('/admin/billing')
  return { ok: true }
}

// Withdrawn rather than deleted: "we asked and then said never mind" is worth
// keeping, and a row that vanishes takes the reason with it.
export async function cancelInvoiceRequest(requestId: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { data: req } = await admin
    .from('invoice_requests')
    .select('id, instance_id, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: 'Not found' }
  // A paid request is a record of money that moved. Nothing here gets to say
  // it did not.
  if (req.status === 'paid') return { ok: false, error: 'This one has been paid — it cannot be cancelled' }

  const { error } = await admin.from('invoice_requests').update({ status: 'cancelled' }).eq('id', req.id)
  if (error) return { ok: false, error: 'Could not cancel — please try again' }

  revalidatePath(`/portal/${req.instance_id}`)
  revalidatePath('/admin/billing')
  return { ok: true }
}
