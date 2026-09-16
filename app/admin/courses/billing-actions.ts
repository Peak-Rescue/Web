'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireAdminUser } from '@/lib/course-access'
import { parseContacts, billTo } from '@/lib/contacts'
import { courseShortName } from '@/lib/courses'
import { chooseRecipients, describeForBiller, parseMoney } from '@/lib/billing'
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
export async function sendInvoiceRequest(
  instanceId: string,
  /** Exactly what is about to be told to Harken, as the person sending it
      corrected it on screen. The request is a snapshot of that conversation —
      a deposit rather than the whole price, accounts payable rather than the
      person who booked, the name the client's PO uses — so these are taken as
      given rather than re-derived here. What is not negotiable is that they
      are present: the guards below still refuse a request with no payee or no
      number. */
  input: {
    note: string
    amount: string
    billToName: string
    billToEmail: string
    description: string
    /** Which billers get the email. Absent or empty means everyone active,
        which is what one biller has always meant. The queue itself is shared
        — it is a list of what Harken has to do, not a per-person inbox — so
        this decides who is told, not who can see it. */
    recipientIds?: string[]
  }
): Promise<Result> {
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

  // The guards that stop a useless request going out. A row with a blank payee
  // or a number nobody agreed to is worse than no row: the biller has to come
  // back to us to find out what it means, which is the whole of what this was
  // meant to save.
  const payeeName = input.billToName.trim()
  if (!payeeName) return { ok: false, error: 'Say who the invoice goes to' }

  const amount = parseMoney(input.amount)
  if (amount === null || amount <= 0) return { ok: false, error: 'Enter the amount to bill' }

  const chosen = chooseRecipients(
    (recipients ?? []).map((r) => ({ id: r.id as string, name: r.name as string, email: r.email as string, token: r.token as string })),
    input.recipientIds
  )
  if (chosen.length === 0) return { ok: false, error: 'Nobody to send it to — choose a biller' }

  // The phone is not on the form — nobody retypes a phone number to send an
  // invoice — so it still comes off the contact the payee was seeded from.
  const payee = billTo(parseContacts(inst.contacts))
  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const description =
    input.description.trim().slice(0, 300) ||
    describeForBiller({
      refNumber: inst.ref_number,
      courseName,
      clientName: inst.client_name,
      startsAt: inst.starts_at,
      endsAt: inst.ends_at,
    })
  const accepted = (quotes ?? []).find((q) => !q.archived_at)
  // The number on the document the client actually received — what they will
  // reconcile the invoice against, and what tells a re-quote's request apart
  // from the first one. Null when no quote went out through the portal, which
  // the biller's row reads as "no quote number" rather than inventing one.
  const qNum = accepted ? quoteNumber(inst.ref_number, accepted.quote_seq as number) : null

  const { error } = await admin.from('invoice_requests').insert({
    instance_id: instanceId,
    quote_id: accepted?.id ?? null,
    quote_number: qNum,
    amount,
    description,
    bill_to_org: inst.client_name,
    bill_to_name: payeeName.slice(0, 200),
    bill_to_email: input.billToEmail.trim().slice(0, 200) || null,
    bill_to_phone: payee?.contact.phones[0] ?? null,
    admin_note: input.note.trim().slice(0, 2000) || null,
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_by: user.id,
  })
  if (error) return { ok: false, error: 'Could not create the request — please try again' }

  // Every active recipient is told, and each gets their own link: the queue is
  // shared, the address into it is not.
  if (process.env.RESEND_API_KEY) {
    after(async () => {
      for (const r of chosen) {
        try {
          await sendMail({
            from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
            to: [r.email],
            subject: qNum ? `Please invoice ${qNum} — ${description}` : `Please invoice — ${description}`,
            text: [
              `Hi ${r.name.split(' ')[0]},`,
              '',
              `Please raise an invoice for ${fmtMoney(amount)}.`,
              '',
              description,
              ...(qNum ? [`Our quote: ${qNum}`] : []),
              '',
              'Bill to:',
              [payeeName, inst.client_name].filter(Boolean).join(' · '),
              ...(input.billToEmail.trim() ? [input.billToEmail.trim()] : []),
              ...(payee?.contact.phones[0] ? [payee.contact.phones[0]] : []),
              ...(input.note.trim() ? ['', input.note.trim()] : []),
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
