'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/mailer'
import { fmtMoney } from '@/lib/expenses'
import { parseMoney, type InvoiceStatus } from '@/lib/billing'

// Public actions — authorization is the unguessable token, and the token has
// to still belong to an active recipient on every call. Deactivating a biller
// has to stop her writing, not just stop her reading.
//
// What a token can change is fixed here and nowhere else: the two milestones,
// an invoice number, a note. Never the amount, never who to bill, never which
// course — those are ours, and a public page that could edit them would be a
// way to rewrite what we asked for after the fact.

type Result = { ok: true } | { ok: false; error: string }

async function recipientFor(token: string) {
  if (!/^[0-9a-f-]{36}$/.test(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('billing_recipients')
    .select('id, name, email, active')
    .eq('token', token)
    .maybeSingle()
  return data && data.active ? { admin, recipient: data } : null
}

// Best-effort, deferred: the biller's click must not wait on a mail provider,
// and a failed notification must not fail the thing it is reporting.
function tellAdmins(subject: string, lines: string[]) {
  if (!process.env.RESEND_API_KEY) return
  after(async () => {
    try {
      const admin = createAdminClient()
      const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin')
      const to = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
      if (to.length === 0) return
      await sendMail({
        from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
        to,
        subject,
        text: lines.join('\n'),
      })
    } catch (e) {
      console.error('Billing notification failed:', e)
    }
  })
}

async function loadRequest(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  allowed: InvoiceStatus[]
) {
  const { data } = await admin
    .from('invoice_requests')
    .select('id, instance_id, status, amount, description')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  return allowed.includes(data.status as InvoiceStatus) ? data : null
}

export async function markInvoiced(
  token: string,
  requestId: string,
  input: { invoiceNumber: string; note: string }
): Promise<Result> {
  const auth = await recipientFor(token)
  if (!auth) return { ok: false, error: 'This link is no longer valid' }
  const { admin, recipient } = auth

  // Re-markable on purpose: an invoice number typed wrong is corrected by
  // saying it again, not by asking us to reopen anything.
  const req = await loadRequest(admin, requestId, ['sent', 'invoiced'])
  if (!req) return { ok: false, error: 'That item is no longer open' }

  const { error } = await admin
    .from('invoice_requests')
    .update({
      status: 'invoiced',
      // Kept from the first time it was marked, so a correction to the number
      // does not restate when the work was actually done.
      invoiced_at: req.status === 'invoiced' ? undefined : new Date().toISOString(),
      invoice_number: input.invoiceNumber.trim().slice(0, 120) || null,
      invoiced_by: recipient.id,
      biller_note: input.note.trim().slice(0, 2000) || null,
    })
    .eq('id', req.id)
    .in('status', ['sent', 'invoiced'])
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  tellAdmins(`Invoiced — ${req.description ?? 'course'}`, [
    `${recipient.name} marked this invoiced${input.invoiceNumber.trim() ? ` (${input.invoiceNumber.trim()})` : ''}.`,
    '',
    req.description ?? '',
    `Amount: ${fmtMoney(Number(req.amount))}`,
    ...(input.note.trim() ? ['', `Note: ${input.note.trim()}`] : []),
  ])

  revalidatePath(`/billing/${token}`)
  revalidatePath('/admin/billing')
  revalidatePath(`/portal/${req.instance_id}`)
  return { ok: true }
}

export async function markPaid(
  token: string,
  requestId: string,
  input: { amountReceived: string; note: string }
): Promise<Result> {
  const auth = await recipientFor(token)
  if (!auth) return { ok: false, error: 'This link is no longer valid' }
  const { admin, recipient } = auth

  // Payable straight from 'sent': plenty of clients pay against an invoice
  // raised outside this system, and refusing that would only teach her to
  // mark a fake milestone first.
  const req = await loadRequest(admin, requestId, ['sent', 'invoiced', 'paid'])
  if (!req) return { ok: false, error: 'That item is no longer open' }

  const received = parseMoney(input.amountReceived)
  if (received === null) return { ok: false, error: 'Enter the amount received' }

  const { error } = await admin
    .from('invoice_requests')
    .update({
      status: 'paid',
      paid_at: req.status === 'paid' ? undefined : new Date().toISOString(),
      amount_received: received,
      paid_by: recipient.id,
      biller_note: input.note.trim().slice(0, 2000) || null,
    })
    .eq('id', req.id)
    .in('status', ['sent', 'invoiced', 'paid'])
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  const short = Math.round((Number(req.amount) - received) * 100) / 100
  tellAdmins(`Payment received — ${req.description ?? 'course'}`, [
    `${recipient.name} recorded payment of ${fmtMoney(received)}.`,
    '',
    req.description ?? '',
    `Billed: ${fmtMoney(Number(req.amount))}`,
    // Said plainly rather than left to be noticed: a short payment is the
    // whole reason the two numbers are kept apart.
    ...(short !== 0 ? [short > 0 ? `Short by ${fmtMoney(short)}` : `Over by ${fmtMoney(-short)}`] : []),
    ...(input.note.trim() ? ['', `Note: ${input.note.trim()}`] : []),
  ])

  revalidatePath(`/billing/${token}`)
  revalidatePath('/admin/billing')
  revalidatePath(`/portal/${req.instance_id}`)
  return { ok: true }
}
