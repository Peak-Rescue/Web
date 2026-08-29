'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseContacts, primaryContactEmail, ccEmailOptions } from '@/lib/contacts'
import { GEAR_ENTRIES_SELECT, gearQuantity, gearLabel, productName } from '@/lib/gear'
import { sendMail } from '@/lib/mailer'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorised')
  return admin
}

function touch(instanceId: string) {
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Snapshots the list onto a new order. Copies, not references: the list keeps
// being edited for the course it teaches, and an order the client has already
// answered must not shift under them.
//
// Quantities are resolved here rather than carried as rules. A row that says
// "one between four" is a fact about a roster; what purchasing buys is twelve,
// and twelve is what has to survive on the order even if the roster changes
// later. `view: 'course'` is the POC's reading — what has to exist, not what
// one person packs.
export async function createGearOrder(instanceId: string, listId: string) {
  const admin = await requireAdmin()

  const [{ data: list }, { data: inst }] = await Promise.all([
    admin.from('gear_lists').select(`id, name, ${GEAR_ENTRIES_SELECT}`).eq('id', listId).single(),
    admin.from('course_instances').select('max_students').eq('id', instanceId).single(),
  ])
  if (!list) throw new Error('Gear list not found')

  type Entry = {
    id: string
    gear_item_id: string | null
    name: string | null
    note: string | null
    section: string | null
    quantity: string | null
    qty_each: number | null
    qty_per_students: number | null
    sort_order: number
    gear_entry_options: { gear_item_id: string; sort_order: number }[] | null
  }
  const entries = ((list as unknown as { gear_list_entries: Entry[] }).gear_list_entries ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)

  // Names live on the catalogue, not the row — a row carries a name only when
  // it is a one-off typed straight onto the list.
  const itemIds = [...new Set(entries.flatMap((e) => [
    e.gear_item_id,
    ...(e.gear_entry_options ?? []).map((o) => o.gear_item_id),
  ]).filter((id): id is string => Boolean(id)))]
  const { data: itemRows } = itemIds.length
    ? await admin.from('gear_items').select('id, name, brand, info, category').in('id', itemIds)
    : { data: [] }
  const items = new Map((itemRows ?? []).map((i) => [i.id as string, i as {
    id: string; name: string; brand: string | null; info: string | null; category: string | null
  }]))

  const { data: order, error } = await admin
    .from('gear_orders')
    .insert({ instance_id: instanceId, list_id: listId })
    .select('id')
    .single()
  if (error || !order) throw new Error(error?.message ?? 'Could not create the order')

  const lines = entries.map((e, i) => {
    const item = e.gear_item_id ? items.get(e.gear_item_id) : null
    const base = e.name?.trim() || (item ? productName(item) : 'Item')
    const options = (e.gear_entry_options ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => items.get(o.gear_item_id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((x) => ({ name: productName(x) }))
    const { title, detail } = gearLabel(base, options)
    const qty = gearQuantity(e, { students: inst?.max_students ?? null, view: 'course' })
    return {
      order_id: order.id,
      entry_id: e.id,
      name: title.slice(0, 200),
      detail: [detail, e.note?.trim() || item?.info || null].filter(Boolean).join(' — ') || null,
      category: item?.category ?? e.section ?? null,
      qty_offered: qty.text ?? qty.rule,
      // Pre-filled with the resolved total where there is one. A row whose
      // quantity is "20 ft" or "sample of ladder types" has no number to
      // pre-fill, and leaving it blank is the honest outcome — the client says.
      qty_wanted: qty.text && /^\d+(\.\d+)?$/.test(qty.text) ? Number(qty.text) : null,
      sort_order: i,
    }
  })

  if (lines.length > 0) {
    const { error: e2 } = await admin.from('gear_order_lines').insert(lines)
    if (e2) throw new Error(e2.message)
  }

  touch(instanceId)
  return { id: order.id }
}

export async function updateGearOrder(
  instanceId: string,
  orderId: string,
  patch: { es_quote_number?: string | null; intro?: string | null; status?: 'draft' | 'closed' }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.es_quote_number !== undefined) update.es_quote_number = patch.es_quote_number?.trim().slice(0, 80) || null
  if (patch.intro !== undefined) update.intro = patch.intro?.trim().slice(0, 2000) || null
  if (patch.status !== undefined) update.status = patch.status
  const { error } = await admin.from('gear_orders').update(update).eq('id', orderId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// Admins can edit a line at any point in the order's life — that's the whole
// reason this is a record and not a PDF.
export async function updateGearOrderLine(
  instanceId: string,
  lineId: string,
  patch: { qty_wanted?: number | null; removed?: boolean; admin_note?: string | null; name?: string }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  if (patch.qty_wanted !== undefined) {
    update.qty_wanted = patch.qty_wanted === null || Number.isNaN(patch.qty_wanted)
      ? null
      : Math.max(0, Math.min(99999, patch.qty_wanted))
  }
  if (patch.removed !== undefined) update.removed = patch.removed
  if (patch.admin_note !== undefined) update.admin_note = patch.admin_note?.trim().slice(0, 500) || null
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 200) || 'Item'
  const { error } = await admin.from('gear_order_lines').update(update).eq('id', lineId)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

export async function addGearOrderLine(instanceId: string, orderId: string) {
  const admin = await requireAdmin()
  const { data: last } = await admin
    .from('gear_order_lines').select('sort_order')
    .eq('order_id', orderId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { error } = await admin.from('gear_order_lines').insert({
    order_id: orderId,
    name: 'New item',
    sort_order: last ? (last.sort_order as number) + 1 : 0,
  })
  if (error) throw new Error(error.message)
  touch(instanceId)
}

export async function deleteGearOrderLine(instanceId: string, lineId: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('gear_order_lines').delete().eq('id', lineId)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

export async function deleteGearOrder(instanceId: string, orderId: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('gear_orders').delete().eq('id', orderId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// Sends the order to the course's point of contact. Re-sendable: a second pass
// after the client changes their mind is the same email against the same link,
// not a new order.
export async function sendGearOrder(instanceId: string, orderId: string, formData?: FormData) {
  const admin = await requireAdmin()

  const [{ data: order }, { data: inst }] = await Promise.all([
    admin.from('gear_orders').select('id, accept_token, es_quote_number, intro, status').eq('id', orderId).eq('instance_id', instanceId).single(),
    admin.from('course_instances').select('ref_number, course_type, custom_title, client_name, contacts, starts_at, ends_at').eq('id', instanceId).single(),
  ])
  if (!order || !inst) throw new Error('Order not found')
  // The number is what lets the client match this against their own paperwork,
  // so its absence is worth stopping on — once. Sometimes it genuinely isn't
  // issued yet and the list still has to go, so the block is a speed bump with
  // a way past it rather than a rule. Added later, it shows on the client's
  // page the next time they open the link, and "Send again" puts it in an
  // email too.
  const withoutEs = formData?.get('send_without_es') === 'on'
  if (!order.es_quote_number && !withoutEs) {
    throw new Error('No ES quote number yet — tick “send without one” if you mean to send it anyway.')
  }
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured in this environment')

  const contacts = parseContacts(inst.contacts)
  const toEmail = primaryContactEmail(contacts)
  if (!toEmail) throw new Error('The course has no point-of-contact email — add one in Details first')

  const { courseShortName } = await import('@/lib/courses')
  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
  const link = `${siteUrl}/gear-order/${order.accept_token}`

  const allowedCc = new Set(ccEmailOptions(contacts))
  const contactCc = (formData?.getAll('cc_extra') ?? []).map(String).filter((e) => allowedCc.has(e))

  // Colleagues copied on the client-facing mail — the receipt that says the
  // job is done, without anyone having to open the portal to find out.
  const askedAdmins = (formData?.getAll('cc_admin') ?? []).map(String).map((e) => e.trim().toLowerCase()).filter(Boolean)
  let adminCc: string[] = []
  if (askedAdmins.length > 0) {
    const { data: adminRows } = await admin.from('profiles').select('email').eq('role', 'admin')
    const real = new Set((adminRows ?? []).map((a) => (a.email ?? '').trim().toLowerCase()).filter(Boolean))
    adminCc = [...new Set(askedAdmins.filter((e) => real.has(e)))]
  }
  const cc = [...new Set([...contactCc, ...adminCc])]

  const { error: sendError } = await sendMail({
    from: 'Peak Rescue Mountain Guides <noreply@peak-rescue.com>',
    to: [toEmail],
    cc: cc.length > 0 ? cc : undefined,
    subject: order.es_quote_number
      ? `Gear list ${order.es_quote_number} — ${courseName}`
      : `Gear list — ${courseName}`,
    text: [
      `${contacts[0]?.name || 'Hello'},`,
      '',
      `Here is the gear list for ${courseName}${inst.client_name ? ` (${inst.client_name})` : ''}${order.es_quote_number ? `, quote ${order.es_quote_number}` : ''}:`,
      '',
      link,
      '',
      'You can change the quantities, take off anything you already have, and leave us notes — then submit it back. Whatever you send back is what we pass to purchasing.',
      '',
      order.es_quote_number
        ? `Please quote ${order.es_quote_number} on any correspondence.`
        : 'A quote number will follow — it will appear on the page above once we have it.',
      '',
      'Questions? Just reply to this email.',
    ].join('\n'),
  })
  if (sendError) throw new Error(`Email failed: ${sendError.message}`)

  await admin.from('gear_orders').update({
    status: order.status === 'responded' ? 'responded' : 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', orderId)

  touch(instanceId)
}
