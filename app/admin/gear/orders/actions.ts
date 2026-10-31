'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { linesFromList } from '@/lib/gear-order-lines'
import { productName } from '@/lib/gear'
import { safeLink } from '@/lib/gear-orders'
import { sendMail } from '@/lib/mailer'

// Gear orders that belong to no course: a team asks what we would supply, and
// might buy it from us. Course orders keep their own actions and their own
// panel. Every write here is scoped to `instance_id is null`, so nothing on this
// page can reach an order a course is holding.

type Failed = { error: string }
const fail = (error: string): Failed => ({ error })

function touch(orderId?: string) {
  revalidatePath('/admin/gear/orders')
  if (orderId) revalidatePath(`/admin/gear/orders/${orderId}`)
}

const ITEM_COLUMNS = 'id, name, brand, info, url, category, price, parent_id'
type Item = {
  id: string; name: string; brand: string | null; info: string | null; url: string | null
  category: string | null; price: number | null; parent_id: string | null
}

function cleanPrice(v: number | null): number | null {
  if (v === null || Number.isNaN(v)) return null
  return Math.round(Math.max(0, Math.min(999999, v)) * 100) / 100
}

export async function createStandaloneOrder(input: {
  title: string; clientId: string | null; listId: string | null
}): Promise<{ id: string } | Failed> {
  const { admin } = await requireAdminUser()
  const title = input.title.trim().slice(0, 200)
  if (!title) return fail('Give the order a name.')

  // Worked out before the order exists, so a list that has gone missing leaves
  // nothing half-made behind it.
  const lines = input.listId ? await linesFromList(admin, input.listId, null, { priced: true }) : []
  if (!lines) return fail('That saved list no longer exists.')

  const { data: order, error } = await admin
    .from('gear_orders')
    .insert({ title, client_id: input.clientId || null, list_id: input.listId || null })
    .select('id')
    .single()
  if (error || !order) throw new Error(error?.message ?? 'Could not create the order')

  if (lines.length > 0) {
    const { error: e2 } = await admin
      .from('gear_order_lines').insert(lines.map((l) => ({ ...l, order_id: order.id })))
    if (e2) throw new Error(e2.message)
  }
  touch()
  return { id: order.id }
}

export async function updateStandaloneOrder(
  orderId: string,
  patch: {
    title?: string; clientId?: string | null; contactName?: string | null; contactEmail?: string | null
    intro?: string | null; esQuoteNumber?: string | null; status?: 'closed'
  }
): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 200)
    if (!title) return fail('The order needs a name.')
    update.title = title
  }
  if (patch.clientId !== undefined) update.client_id = patch.clientId || null
  if (patch.contactName !== undefined) update.contact_name = patch.contactName?.trim().slice(0, 120) || null
  if (patch.contactEmail !== undefined) update.contact_email = patch.contactEmail?.trim().slice(0, 200) || null
  if (patch.intro !== undefined) update.intro = patch.intro?.trim().slice(0, 2000) || null
  if (patch.esQuoteNumber !== undefined) update.es_quote_number = patch.esQuoteNumber?.trim().slice(0, 80) || null
  if (patch.status !== undefined) update.status = patch.status

  const { error } = await admin.from('gear_orders').update(update).eq('id', orderId).is('instance_id', null)
  if (error) throw new Error(error.message)
  touch(orderId)
  return { ok: true }
}

export async function deleteStandaloneOrder(orderId: string): Promise<void> {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('gear_orders').delete().eq('id', orderId).is('instance_id', null)
  if (error) throw new Error(error.message)
  touch(orderId)
}

async function nextSort(admin: Awaited<ReturnType<typeof requireAdminUser>>['admin'], orderId: string) {
  const { data: last } = await admin
    .from('gear_order_lines').select('sort_order')
    .eq('order_id', orderId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  return last ? (last.sort_order as number) + 1 : 0
}

async function ownOrder(admin: Awaited<ReturnType<typeof requireAdminUser>>['admin'], orderId: string) {
  const { data } = await admin.from('gear_orders').select('id').eq('id', orderId).is('instance_id', null).maybeSingle()
  return Boolean(data)
}

// The line copies the catalog's name, link and price as they stand today.
export async function addCatalogLine(orderId: string, gearItemId: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  if (!(await ownOrder(admin, orderId))) return fail('Order not found.')
  const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', gearItemId).single()
  const item = data as Item | null
  if (!item) return fail('That item is no longer in the catalog.')

  const { error } = await admin.from('gear_order_lines').insert({
    order_id: orderId,
    gear_item_id: item.id,
    name: productName(item).slice(0, 200),
    detail: item.info,
    category: item.category,
    url: safeLink(item.url),
    unit_price: item.price,
    sort_order: await nextSort(admin, orderId),
  })
  if (error) throw new Error(error.message)
  touch(orderId)
  return { ok: true }
}

export async function addOneOffLine(orderId: string, name: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  if (!(await ownOrder(admin, orderId))) return fail('Order not found.')
  const clean = name.trim().slice(0, 200)
  if (!clean) return fail('Give the line a name.')
  const { error } = await admin.from('gear_order_lines').insert({
    order_id: orderId, name: clean, sort_order: await nextSort(admin, orderId),
  })
  if (error) throw new Error(error.message)
  touch(orderId)
  return { ok: true }
}

// The line's own row, only when it sits on a standalone order.
async function ownLine(admin: Awaited<ReturnType<typeof requireAdminUser>>['admin'], lineId: string) {
  const { data } = await admin
    .from('gear_order_lines')
    .select('id, order_id, gear_item_id, detail, url, unit_price, gear_orders!inner(instance_id)')
    .eq('id', lineId)
    .is('gear_orders.instance_id', null)
    .maybeSingle()
  return data as null | {
    id: string; order_id: string; gear_item_id: string | null; detail: string | null
    url: string | null; unit_price: number | null
  }
}

export async function updateStandaloneLine(
  lineId: string,
  patch: {
    name?: string; detail?: string | null; url?: string | null; unitPrice?: number | null
    qtyWanted?: number | null; removed?: boolean
  }
): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const line = await ownLine(admin, lineId)
  if (!line) return fail('Line not found.')

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 200) || 'Item'
  if (patch.detail !== undefined) update.detail = patch.detail?.trim().slice(0, 1000) || null
  if (patch.removed !== undefined) update.removed = patch.removed
  if (patch.qtyWanted !== undefined) {
    update.qty_wanted = patch.qtyWanted === null || Number.isNaN(patch.qtyWanted)
      ? null
      : Math.max(0, Math.min(99999, patch.qtyWanted))
  }
  let url: string | null | undefined
  if (patch.url !== undefined) {
    url = patch.url?.trim() ? safeLink(patch.url) : null
    if (patch.url?.trim() && !url) return fail('A link has to start with http:// or https://.')
    update.url = url
  }
  const price = patch.unitPrice !== undefined ? cleanPrice(patch.unitPrice) : undefined
  if (price !== undefined) update.unit_price = price

  const { error } = await admin.from('gear_order_lines').update(update).eq('id', lineId)
  if (error) throw new Error(error.message)

  // The first link or price a product is ever given goes back to the catalog,
  // so it is only entered once. Filling a gap and never replacing a value: a
  // deal's price on one order is not the new price for everyone. Products only,
  // since "Skis" has no price or product page of its own.
  if (line.gear_item_id && (url || price != null)) {
    const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', line.gear_item_id).maybeSingle()
    const item = data as Item | null
    if (item?.parent_id) {
      const fill: Record<string, unknown> = {}
      if (url && !item.url) fill.url = url
      if (price != null && item.price == null) fill.price = price
      if (Object.keys(fill).length > 0) {
        await admin.from('gear_items').update(fill).eq('id', item.id)
        revalidatePath('/admin/gear')
      }
    }
  }
  touch(line.order_id)
  return { ok: true }
}

// Settling a generic line on a product. Whatever the product knows replaces the
// line's copy; what it does not know leaves the line's own value standing, so a
// price already agreed is not wiped by a product with none yet.
export async function setLineProduct(lineId: string, gearItemId: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const line = await ownLine(admin, lineId)
  if (!line) return fail('Line not found.')
  const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', gearItemId).single()
  const item = data as Item | null
  if (!item) return fail('That item is no longer in the catalog.')

  const { error } = await admin.from('gear_order_lines').update({
    gear_item_id: item.id,
    name: productName(item).slice(0, 200),
    detail: line.detail ?? item.info,
    url: safeLink(item.url) ?? line.url,
    unit_price: item.price ?? line.unit_price,
  }).eq('id', lineId)
  if (error) throw new Error(error.message)
  touch(line.order_id)
  return { ok: true }
}

export async function deleteStandaloneLine(lineId: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const line = await ownLine(admin, lineId)
  if (!line) return fail('Line not found.')
  const { error } = await admin.from('gear_order_lines').delete().eq('id', lineId)
  if (error) throw new Error(error.message)
  touch(line.order_id)
  return { ok: true }
}

// Re-sendable, like a course order: a second pass is the same email against the
// same link. Nothing here asks for an ES quote number. These orders may never
// have one, and it shows on their page if it is ever added.
export async function sendStandaloneOrder(orderId: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const { data: order } = await admin
    .from('gear_orders')
    .select('id, title, accept_token, es_quote_number, status, contact_name, contact_email, gear_order_lines(id)')
    .eq('id', orderId).is('instance_id', null)
    .maybeSingle()
  if (!order) return fail('Order not found.')

  const to = order.contact_email?.trim()
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) return fail('Add a contact email first.')
  if ((order.gear_order_lines ?? []).length === 0) return fail('There is nothing on this order yet.')
  if (!process.env.RESEND_API_KEY) return fail('Email is not configured in this environment.')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
  const { error: sendError } = await sendMail({
    from: 'Peak Rescue <noreply@peak-rescue.com>',
    to: [to],
    subject: order.es_quote_number
      ? `Gear list ${order.es_quote_number} — ${order.title}`
      : `Gear list — ${order.title}`,
    text: [
      `${order.contact_name || 'Hello'},`,
      '',
      `Here is the gear list we put together: ${order.title}${order.es_quote_number ? `, quote ${order.es_quote_number}` : ''}.`,
      '',
      `${siteUrl}/gear-order/${order.accept_token}`,
      '',
      'You can change the quantities, take off anything you do not need, and leave us notes — then send it back to us.',
      '',
      'Questions? Just reply to this email.',
    ].join('\n'),
  })
  if (sendError) return fail(`Email failed: ${sendError.message}`)

  await admin.from('gear_orders').update({
    status: order.status === 'responded' ? 'responded' : 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', orderId)
  touch(orderId)
  return { ok: true }
}
