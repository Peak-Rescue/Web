'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'
import { CLIENT_COLUMNS, clientLabel, type ClientRow } from '@/lib/clients'
import { sendMail } from '@/lib/mailer'
import { cleanSizes, sizesSummary, sizesTotal, type GearOrderSize } from '@/lib/gear-orders'

export type LineAnswer = {
  id: string; qty: number | null; removed: boolean; note: string | null
  sizes?: { size: string; qty: string | number }[]
}

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
    .select('id, instance_id, title, client_id, status, es_quote_number, gear_order_lines(id)')
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
    // Sizes are for orders with no course. Where there are any, the line's total
    // is theirs to set, whatever number the page sent alongside them.
    const sizes = order.instance_id ? null : cleanSizes(l.sizes)
    const qty = sizes?.length
      ? sizesTotal(sizes)
      : l.qty === null || Number.isNaN(l.qty) ? null : Math.max(0, Math.min(99999, l.qty))
    await admin.from('gear_order_lines').update({
      ...(sizes ? { sizes } : {}),
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
        const [{ data: admins }, { data: lines }] = await Promise.all([
          admin.from('profiles').select('email').eq('role', 'admin'),
          admin.from('gear_order_lines').select('name, product, qty_wanted, removed, sizes').eq('order_id', order.id).order('sort_order'),
        ])
        const recipients = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
        if (recipients.length === 0) return

        // What the order reads as, and where to go and look at it.
        let orderName = order.title ?? 'Gear order'
        let clientName: string | null = null
        let path = `/admin/gear/orders/${order.id}`
        if (order.instance_id) {
          const { data: inst } = await admin
            .from('course_instances').select('course_type, custom_title, client_name').eq('id', order.instance_id).single()
          if (!inst) return
          orderName = courseShortName(inst.course_type, inst.custom_title)
          clientName = inst.client_name
          path = `/admin/courses/${order.instance_id}#gear`
        } else if (order.client_id) {
          const { data: clients } = await admin.from('clients').select(CLIENT_COLUMNS)
          clientName = clientLabel((clients ?? []) as ClientRow[], order.client_id) || null
        }
        const wanted = (lines ?? []).filter((l) => !l.removed && Number(l.qty_wanted ?? 0) > 0)
        const dropped = (lines ?? []).filter((l) => l.removed)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
        await sendMail({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: `📦 Gear order ${order.es_quote_number ?? ''} answered — ${orderName}`.replace('  ', ' '),
          text: [
            `${name}${input.title ? ` (${input.title})` : ''} answered the gear list for ${orderName}${clientName ? ` · ${clientName}` : ''}.`,
            order.es_quote_number ? `Quote ${order.es_quote_number}.` : null,
            '',
            `${wanted.length} item${wanted.length === 1 ? '' : 's'} wanted${dropped.length ? `, ${dropped.length} struck off` : ''}:`,
            ...wanted.map((l) => `  ${l.qty_wanted} × ${l.name}${l.product ? ` (${l.product})` : ''}${sizesSummary(l.sizes as GearOrderSize[]) ? `: ${sizesSummary(l.sizes as GearOrderSize[])}` : ''}`),
            input.note.trim() ? ['', `They said: "${input.note.trim()}"`].join('\n') : null,
            '',
            `${siteUrl}${path}`,
          ].filter((l): l is string => l !== null).join('\n'),
        })
      } catch (e) {
        console.error('Gear order notification failed:', e)
      }
    })
  }

  revalidatePath(order.instance_id ? `/admin/courses/${order.instance_id}` : `/admin/gear/orders/${order.id}`)
  return { ok: true }
}
