'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { upsertGearItem } from '@/app/admin/gear/actions'
import { linesFromList } from '@/lib/gear-order-lines'
import { cleanSizes, lineNames, parseSizeOptions, safeLink, sizesTotal } from '@/lib/gear-orders'
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

const ITEM_COLUMNS = 'id, name, brand, info, url, category, price, parent_id, sizes'
type Item = {
  id: string; name: string; brand: string | null; info: string | null; url: string | null
  category: string | null; price: number | null; parent_id: string | null; sizes: string[]
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

async function parentOf(admin: Awaited<ReturnType<typeof requireAdminUser>>['admin'], item: Item) {
  if (!item.parent_id) return null
  const { data } = await admin.from('gear_items').select('name').eq('id', item.parent_id).maybeSingle()
  return data as { name: string } | null
}

// The line copies the catalog's name, link and price as they stand today.
export async function addCatalogLine(orderId: string, gearItemId: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  if (!(await ownOrder(admin, orderId))) return fail('Order not found.')
  const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', gearItemId).single()
  const item = data as Item | null
  if (!item) return fail('That item is no longer in the catalog.')

  const { name, product } = lineNames(item, await parentOf(admin, item))
  const { error } = await admin.from('gear_order_lines').insert({
    order_id: orderId,
    gear_item_id: item.id,
    name: name.slice(0, 200),
    product,
    detail: item.info,
    category: item.category,
    url: safeLink(item.url),
    unit_price: item.price,
    size_options: item.sizes,
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
    .select('id, order_id, gear_item_id, product, detail, url, unit_price, size_options, gear_orders!inner(instance_id)')
    .eq('id', lineId)
    .is('gear_orders.instance_id', null)
    .maybeSingle()
  return data as null | {
    id: string; order_id: string; gear_item_id: string | null; product: string | null; detail: string | null
    url: string | null; unit_price: number | null; size_options: string[]
  }
}

export async function updateStandaloneLine(
  lineId: string,
  patch: {
    name?: string; detail?: string | null; url?: string | null; unitPrice?: number | null
    qtyWanted?: number | null; removed?: boolean
    sizeOptions?: string; sizes?: { size: string; qty: string | number }[]
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
  const options = patch.sizeOptions !== undefined ? parseSizeOptions(patch.sizeOptions) : undefined
  if (options !== undefined) update.size_options = options
  if (patch.sizes !== undefined) {
    const sizes = cleanSizes(patch.sizes)
    update.sizes = sizes
    if (sizes.length > 0) update.qty_wanted = sizesTotal(sizes)
  }

  const { error } = await admin.from('gear_order_lines').update(update).eq('id', lineId)
  if (error) throw new Error(error.message)

  // The first link, price or size list a product is ever given goes back to the catalog,
  // so it is only entered once. Filling a gap and never replacing a value: a
  // deal's price on one order is not the new price for everyone. Products only,
  // since "Skis" has no price or product page of its own.
  if (line.gear_item_id && (url || price != null || options?.length)) {
    const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', line.gear_item_id).maybeSingle()
    const item = data as Item | null
    if (item?.parent_id) {
      const fill: Record<string, unknown> = {}
      if (url && !item.url) fill.url = url
      if (price != null && item.price == null) fill.price = price
      if (options?.length && !item.sizes?.length) fill.sizes = options
      if (Object.keys(fill).length > 0) {
        await admin.from('gear_items').update(fill).eq('id', item.id)
        revalidatePath('/admin/gear')
      }
    }
  }
  touch(line.order_id)
  return { ok: true }
}

// Settling a line on a product. A price typed on a generic line survives a
// product with none yet. Swapping one product for another does not keep the old
// one's link or price: those described the product that just left.
export async function setLineProduct(lineId: string, gearItemId: string): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const line = await ownLine(admin, lineId)
  if (!line) return fail('Line not found.')
  const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', gearItemId).single()
  const item = data as Item | null
  if (!item) return fail('That item is no longer in the catalog.')

  const { product } = lineNames(item, await parentOf(admin, item))
  const { error } = await admin.from('gear_order_lines').update({
    gear_item_id: item.id,
    product,
    detail: line.detail ?? item.info,
    url: safeLink(item.url) ?? (line.product ? null : line.url),
    unit_price: item.price ?? (line.product ? null : line.unit_price),
    size_options: item.sizes?.length ? item.sizes : (line.product ? [] : line.size_options),
  }).eq('id', lineId)
  if (error) throw new Error(error.message)
  touch(line.order_id)
  return { ok: true }
}

// A product the catalog does not have yet, named from the line that needs it.
// It goes under the line's generic item, so it is on offer next time too.
export async function addLineProduct(
  lineId: string,
  input: { brand: string; model: string }
): Promise<{ ok: true } | Failed> {
  const { admin } = await requireAdminUser()
  const line = await ownLine(admin, lineId)
  if (!line) return fail('Line not found.')
  if (!line.gear_item_id) return fail('This line is not from the catalog, so a product has nothing to sit under.')
  const { data } = await admin.from('gear_items').select(ITEM_COLUMNS).eq('id', line.gear_item_id).single()
  const item = data as Item | null
  if (!item) return fail('That item is no longer in the catalog.')

  const model = input.model.trim()
  if (!model) return fail('Name the model.')
  const made = await upsertGearItem({
    name: model, brand: input.brand.trim() || null, parentId: item.parent_id ?? item.id,
  })
  if ('error' in made) return made
  return setLineProduct(lineId, made.id)
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
