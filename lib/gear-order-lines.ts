// Turning a gear list into order lines. Copies, not references: the list keeps
// being edited for whatever it is for, and an order the client has already
// answered must not shift under them.
//
// Quantities are resolved here rather than carried as rules. A row that says
// "one between four" is a fact about a roster; what purchasing buys is twelve,
// and twelve is what has to survive on the order even if the roster changes
// later. `view: 'course'` is the POC's reading — what has to exist, not what
// one person packs.

import type { createAdminClient } from '@/lib/supabase/admin'
import { GEAR_ENTRIES_SELECT, gearQuantity, gearLabel, productName } from '@/lib/gear'
import { lineNames } from '@/lib/gear-orders'

export async function linesFromList(
  admin: ReturnType<typeof createAdminClient>,
  listId: string,
  students: number | null,
  // A course order has never shown a price or a link, and a price appearing on
  // one because somebody filled in the catalog is not a decision anyone made.
  { priced }: { priced: boolean }
) {
  const { data: list } = await admin
    .from('gear_lists').select(`id, name, ${GEAR_ENTRIES_SELECT}`).eq('id', listId).single()
  if (!list) return null

  type Entry = {
    id: string
    gear_item_id: string | null
    name: string | null
    note: string | null
    url: string | null
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
    ? await admin.from('gear_items').select('id, name, brand, info, category, url, price, parent_id').in('id', itemIds)
    : { data: [] }
  const items = new Map((itemRows ?? []).map((i) => [i.id as string, i as {
    id: string; name: string; brand: string | null; info: string | null; category: string | null
    url: string | null; price: number | null; parent_id: string | null
  }]))
  const parentIds = [...new Set([...items.values()].map((i) => i.parent_id).filter((id): id is string => Boolean(id)))]
  const { data: parentRows } = priced && parentIds.length
    ? await admin.from('gear_items').select('id, name').in('id', parentIds)
    : { data: [] }
  const parents = new Map((parentRows ?? []).map((p) => [p.id as string, p as { id: string; name: string }]))

  return entries.map((e, i) => {
    const item = e.gear_item_id ? items.get(e.gear_item_id) : null
    const base = e.name?.trim() || (item ? productName(item) : 'Item')
    const options = (e.gear_entry_options ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => items.get(o.gear_item_id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((x) => ({ name: productName(x) }))
    const { title, detail } = gearLabel(base, options)
    const qty = gearQuantity(e, { students, view: 'course' })
    // A row naming one product directly splits into need and product. A row
    // with its own typed name or several options has already said what it means.
    const named = priced && item?.parent_id && !e.name?.trim() && options.length === 0
      ? lineNames(item, parents.get(item.parent_id))
      : { name: title, product: null }
    return {
      entry_id: e.id,
      gear_item_id: e.gear_item_id,
      name: named.name.slice(0, 200),
      product: named.product,
      detail: [detail, e.note?.trim() || item?.info || null].filter(Boolean).join(' — ') || null,
      category: item?.category ?? e.section ?? null,
      qty_offered: qty.text ?? qty.rule,
      // Pre-filled with the resolved total where there is one. A row whose
      // quantity is "20 ft" or "sample of ladder types" has no number to
      // pre-fill, and leaving it blank is the honest outcome — the client says.
      qty_wanted: qty.text && /^\d+(\.\d+)?$/.test(qty.text) ? Number(qty.text) : null,
      url: priced ? e.url ?? item?.url ?? null : null,
      unit_price: priced ? item?.price ?? null : null,
      sort_order: i,
    }
  })
}
