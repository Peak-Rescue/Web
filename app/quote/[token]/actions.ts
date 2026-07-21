'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { quoteNumber } from '@/lib/quotes'
import { courseShortName } from '@/lib/courses'

// Public action — authorization is the unguessable token itself.
export async function acceptQuote(
  token: string,
  input: { name: string; title: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim()
  const title = input.title.trim()
  if (!name) return { ok: false, error: 'Please enter your name' }

  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('course_quotes')
    .select('id, instance_id, status, valid_until, quote_seq')
    .eq('accept_token', token)
    .maybeSingle()
  if (!quote) return { ok: false, error: 'This quote link is no longer valid' }
  if (quote.status === 'accepted') return { ok: true }
  if (quote.status !== 'sent') return { ok: false, error: 'This quote is not open for acceptance' }

  const today = new Date().toISOString().slice(0, 10)
  if (quote.valid_until && quote.valid_until < today) {
    return { ok: false, error: 'This quote has expired — please contact us for an updated quote' }
  }

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

  const { error } = await admin
    .from('course_quotes')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_name: name.slice(0, 120),
      accepted_title: title.slice(0, 120) || null,
      accepted_ip: ip,
    })
    .eq('id', quote.id)
    .eq('status', 'sent')
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  const { data: inst } = await admin
    .from('course_instances')
    .select('ref_number, course_type, custom_title, client_name, status')
    .eq('id', quote.instance_id)
    .single()
  if (inst && ['tentative', 'quoted'].includes(inst.status)) {
    await admin.from('course_instances').update({ status: 'confirmed' }).eq('id', quote.instance_id)
  }

  // Tell the admins the moment it happens (best-effort).
  if (process.env.RESEND_API_KEY && inst) {
    try {
      const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin')
      const recipients = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
      if (recipients.length > 0) {
        const qNum = quoteNumber(inst.ref_number, quote.quote_seq)
        const courseName = courseShortName(inst.course_type, inst.custom_title)
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: `✅ Quote ${qNum} accepted — ${courseName}`,
          text: [
            `${name}${title ? ` (${title})` : ''} accepted quote ${qNum}.`,
            '',
            `Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}`,
            `The course status has been moved to Confirmed.`,
          ].join('\n'),
        })
      }
    } catch (e) {
      console.error('Quote acceptance notification failed:', e)
    }
  }

  revalidatePath(`/admin/courses/${quote.instance_id}`)
  revalidatePath('/admin/courses')
  revalidatePath('/admin')
  return { ok: true }
}
