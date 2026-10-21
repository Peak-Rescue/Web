'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCourseCalendar } from '@/lib/google-calendar'
import { quoteNumber, selectionProblem, type QuoteBillTo, type QuoteOption } from '@/lib/quotes'
import { parseContacts, withInvoiceContact } from '@/lib/contacts'
import { courseShortName } from '@/lib/courses'
import { sendMail } from '@/lib/mailer'
import { todayHere } from '@/lib/course-clock'
import { createPaymentLink, squareConfigured } from '@/lib/square'
import { cardPaymentBlocker } from '@/lib/payments'

// Public action — authorization is the unguessable token itself.
// For multi-option quotes, `selected` holds the indexes of the option or
// options the client is accepting; every option stays on record with the
// chosen ones flagged, and the quote total becomes their sum.
//
// `billTo` is who the client says the invoice goes to. Required unless they
// are paying by card on the spot, where there is no invoice to send.
export async function acceptQuote(
  token: string,
  input: {
    name: string
    title: string
    selected?: number[]
    billTo?: { name: string; email: string; phone: string; note: string }
    byCard?: boolean
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim()
  const title = input.title.trim()
  if (!name) return { ok: false, error: 'Please enter your name' }

  const clip = (v: string | undefined, n: number) => (v ?? '').trim().slice(0, n)
  const billTo: QuoteBillTo | null =
    input.billTo && (clip(input.billTo.name, 200) || clip(input.billTo.email, 200))
      ? {
          name: clip(input.billTo.name, 200),
          email: clip(input.billTo.email, 200),
          phone: clip(input.billTo.phone, 60) || null,
          note: clip(input.billTo.note, 1000) || null,
        }
      : null
  if (!input.byCard) {
    if (!billTo?.name) return { ok: false, error: 'Please tell us who the invoice should go to' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billTo.email)) {
      return { ok: false, error: 'Please enter an email address for the invoice' }
    }
  }

  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('course_quotes')
    .select('id, instance_id, status, valid_until, quote_seq, options')
    .eq('accept_token', token)
    .maybeSingle()
  if (!quote) return { ok: false, error: 'This quote link is no longer valid' }
  if (quote.status === 'accepted') return { ok: true }
  if (quote.status !== 'sent') return { ok: false, error: 'This quote is not open for acceptance' }

  const today = todayHere()
  if (quote.valid_until && quote.valid_until < today) {
    return { ok: false, error: 'This quote has expired — please contact us for an updated quote' }
  }

  const options = (quote.options ?? null) as QuoteOption[] | null
  let optionsPatch: Record<string, unknown> = {}
  let chosenTitles: string[] = []
  if (options) {
    const selected = [...new Set((input.selected ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < options.length))]
    // The form greys out an addition whose option is unticked, but the form is
    // the client's copy of the rule and this is the one that counts: an
    // addition accepted alone is a deployment with no travel priced into it.
    const problem = selectionProblem(options, selected)
    if (problem) return { ok: false, error: problem }
    const flagged = options.map((o, i) => ({ ...o, chosen: selected.includes(i) }))
    chosenTitles = flagged.filter((o) => o.chosen).map((o) => o.title)
    optionsPatch = {
      options: flagged,
      total: Math.round(flagged.filter((o) => o.chosen).reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
    }
  }

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

  const { error } = await admin
    .from('course_quotes')
    .update({
      ...optionsPatch,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_name: name.slice(0, 120),
      accepted_title: title.slice(0, 120) || null,
      accepted_ip: ip,
      bill_to: billTo,
    })
    .eq('id', quote.id)
    .eq('status', 'sent')
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  const { data: inst } = await admin
    .from('course_instances')
    .select('ref_number, course_type, custom_title, client_name, status, contacts')
    .eq('id', quote.instance_id)
    .single()
  // What the client said goes onto the course's contacts, which is what the
  // handoff to Harken reads. In the same write as the status, so a course
  // never shows confirmed with the old payee.
  const patch: Record<string, unknown> = {}
  if (inst && ['tentative', 'quoted'].includes(inst.status)) patch.status = 'confirmed'
  if (inst && billTo) patch.contacts = withInvoiceContact(parseContacts(inst.contacts), billTo)
  if (Object.keys(patch).length > 0) {
    await admin.from('course_instances').update(patch).eq('id', quote.instance_id)
    if (patch.status) after(() => syncCourseCalendar(admin, quote.instance_id))
  }

  // Tell the admins the moment it happens (best-effort, deferred so the
  // client's Accept click doesn't wait on the email provider).
  if (process.env.RESEND_API_KEY && inst) {
    after(async () => {
    try {
      const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin')
      const recipients = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
      if (recipients.length > 0) {
        const qNum = quoteNumber(inst.ref_number, quote.quote_seq)
        const courseName = courseShortName(inst.course_type, inst.custom_title)
        await sendMail({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: `✅ Quote ${qNum} accepted — ${courseName}`,
          text: [
            `${name}${title ? ` (${title})` : ''} accepted quote ${qNum}.`,
            ...(chosenTitles.length > 0 ? ['', `Chosen option${chosenTitles.length > 1 ? 's' : ''}: ${chosenTitles.join(' + ')}`] : []),
            '',
            `Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}`,
            `The course status has been moved to Confirmed.`,
            ...(billTo
              ? [
                  '',
                  `Invoice to: ${[billTo.name, billTo.email, billTo.phone].filter(Boolean).join(' · ')}`,
                  ...(billTo.note ? [`Billing note: ${billTo.note}`] : []),
                ]
              : []),
            '',
            // Said here because this is the mail somebody actually reads on
            // the day it happens, and the handoff is the next thing that has
            // to occur. Still never sent automatically: the client now names
            // the payee, but the amount and which quote it bills are a
            // judgment somebody here makes.
            `Next: send it to Harken to be invoiced — Billing, on the course's Pricing section.`,
          ].join('\n'),
        })
      }
    } catch (e) {
      console.error('Quote acceptance notification failed:', e)
    }
    })
  }

  revalidatePath(`/admin/courses/${quote.instance_id}`)
  revalidatePath('/admin/courses')
  revalidatePath('/admin')
  return { ok: true }
}

// Public action, like accepting: the token is the authorization. Sends the
// client to Square's own checkout page for the accepted total. Paying always
// comes after accepting, so the name and title on record are the person who
// agreed to the price.
export async function startQuotePayment(
  token: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!squareConfigured()) return { ok: false, error: 'Card payment is not available right now' }
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('course_quotes')
    .select('id, instance_id, status, total, quote_seq')
    .eq('accept_token', token)
    .maybeSingle()
  if (!quote) return { ok: false, error: 'This quote link is no longer valid' }

  const blocker = await cardPaymentBlocker(admin, quote)
  if (blocker) return { ok: false, error: blocker }
  const amount = Number(quote.total)

  // Coming back to pay after abandoning checkout reuses the link already made,
  // as long as it was for the same amount.
  const { data: open } = await admin
    .from('payments')
    .select('id, amount, checkout_url')
    .eq('quote_id', quote.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (open?.checkout_url && Number(open.amount) === amount) return { ok: true, url: open.checkout_url }

  const { data: inst } = await admin
    .from('course_instances')
    .select('ref_number, course_type, custom_title, client_name')
    .eq('id', quote.instance_id)
    .single()
  if (!inst) return { ok: false, error: 'This quote link is no longer valid' }

  const { data: row, error } = await admin
    .from('payments')
    .insert({ kind: 'quote', instance_id: quote.instance_id, quote_id: quote.id, amount })
    .select('id')
    .single()
  if (error || !row) return { ok: false, error: 'Something went wrong — please try again' }

  const qNum = quoteNumber(inst.ref_number, quote.quote_seq)
  const courseName = courseShortName(inst.course_type, inst.custom_title)
  try {
    const link = await createPaymentLink({
      idempotencyKey: row.id,
      name: `${courseName} · ${qNum}`,
      amount,
      redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/quote/${token}?paid=1`,
      note: [qNum, inst.client_name].filter(Boolean).join(' · '),
    })
    await admin
      .from('payments')
      .update({ square_payment_link_id: link.id, square_order_id: link.orderId, checkout_url: link.url })
      .eq('id', row.id)
    return { ok: true, url: link.url }
  } catch (e) {
    console.error('Square payment link failed:', e)
    await admin.from('payments').update({ status: 'cancelled' }).eq('id', row.id)
    return { ok: false, error: 'Could not open card checkout — please try again, or contact us' }
  }
}
