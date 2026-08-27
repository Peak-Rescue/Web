'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'

export type LineAnswer = { id: string; qty: number | null; removed: boolean; note: string | null }

// Public action — authorization is the unguessable token itself.
//
// Re-answerable on purpose. The client rings back a week later wanting two
// fewer harnesses; that is the same order answered again, not a new one. The
// status stays 'responded' and the numbers move.
export async function submitGearOrder(
  token: string,
  input: { name: string; title: string; note: string; lines: LineAnswer[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Please enter your name' }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('gear_orders')
    .select('id, instance_id, status, es_quote_number, gear_order_lines(id)')
    .eq('accept_token', token)
    .maybeSingle()
  if (!order) return { ok: false, error: 'This link is no longer valid' }
  if (order.status === 'draft') return { ok: false, error: 'This list is not open yet' }
  if (order.status === 'closed') return { ok: false, error: 'This order has been closed — please contact us' }

  // Only lines that actually belong to this order, so a tampered payload can't
  // reach across into another client's.
  const own = new Set((order.gear_order_lines ?? []).map((l) => (l as { id: string }).id))

  for (const l of input.lines) {
    if (!own.has(l.id)) continue
    const qty = l.qty === null || Number.isNaN(l.qty) ? null : Math.max(0, Math.min(99999, l.qty))
    await admin.from('gear_order_lines').update({
      qty_wanted: qty,
      removed: Boolean(l.removed),
      client_note: l.note?.trim().slice(0, 500) || null,
    }).eq('id', l.id).eq('order_id', order.id)
  }

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

  const { error } = await admin.from('gear_orders').update({
    status: 'responded',
    responded_at: new Date().toISOString(),
    responded_name: name.slice(0, 120),
    responded_title: input.title.trim().slice(0, 120) || null,
    responded_ip: ip,
    client_note: input.note.trim().slice(0, 2000) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', order.id)
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  if (process.env.RESEND_API_KEY) {
    after(async () => {
      try {
        const [{ data: admins }, { data: inst }, { data: lines }] = await Promise.all([
          admin.from('profiles').select('email').eq('role', 'admin'),
          admin.from('course_instances').select('ref_number, course_type, custom_title, client_name').eq('id', order.instance_id).single(),
          admin.from('gear_order_lines').select('name, qty_wanted, removed').eq('order_id', order.id).order('sort_order'),
        ])
        const recipients = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
        if (recipients.length === 0 || !inst) return
        const wanted = (lines ?? []).filter((l) => !l.removed && Number(l.qty_wanted ?? 0) > 0)
        const dropped = (lines ?? []).filter((l) => l.removed)
        const courseName = courseShortName(inst.course_type, inst.custom_title)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
        const { Resend } = await import('resend')
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: `📦 Gear order ${order.es_quote_number ?? ''} answered — ${courseName}`.replace('  ', ' '),
          text: [
            `${name}${input.title ? ` (${input.title})` : ''} answered the gear list for ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}.`,
            order.es_quote_number ? `Quote ${order.es_quote_number}.` : null,
            '',
            `${wanted.length} item${wanted.length === 1 ? '' : 's'} wanted${dropped.length ? `, ${dropped.length} struck off` : ''}:`,
            ...wanted.map((l) => `  ${l.qty_wanted} × ${l.name}`),
            input.note.trim() ? ['', `They said: "${input.note.trim()}"`].join('\n') : null,
            '',
            `${siteUrl}/admin/courses/${order.instance_id}#gear`,
          ].filter((l): l is string => l !== null).join('\n'),
        })
      } catch (e) {
        console.error('Gear order notification failed:', e)
      }
    })
  }

  revalidatePath(`/admin/courses/${order.instance_id}`)
  return { ok: true }
}

export async function markGearOrderViewed(token: string) {
  const admin = createAdminClient()
  await admin.from('gear_orders')
    .update({ viewed_at: new Date().toISOString() })
    .eq('accept_token', token)
    .is('viewed_at', null)
}
