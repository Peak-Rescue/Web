'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GEAR_ENTRIES_COPY_SELECT } from '@/lib/gear'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

function touch(instanceId?: string | null) {
  revalidatePath('/admin/gear')
  // Templates live on the library's gear shelf, so an edit to one has to
  // reach that page too — it's where they're browsed and renamed.
  revalidatePath('/admin/library')
  if (instanceId) {
    revalidatePath(`/admin/courses/${instanceId}`)
    revalidatePath(`/portal/${instanceId}`)
  }
}

// Something the person can fix — a name already taken, a field left empty —
// returned rather than thrown. Next replaces a thrown error's message with a
// generic one in production, so every careful sentence in this file reached
// the screen as "An error occurred in the Server Components render". The
// client turns these back into thrown errors, where messages survive.
//
// Genuine faults still throw: a failed write is not advice.
type Failed = { error: string }
const fail = (error: string): Failed => ({ error })

// Keys minted by the browser and sent here, so they are checked like any other
// input before going into a column the rest of a choice is matched on.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Catalog ────────────────────────────────────────────────────────────────

export async function upsertGearItem(input: {
  id?: string
  name: string
  brand?: string | null
  info?: string | null
  url?: string | null
  category?: string | null
  parentId?: string | null
  aliases?: string[]
  disciplines?: string[]
}): Promise<{ id: string } | Failed> {
  const admin = await requireAdmin()
  // Only what the caller actually passed. Writing every column on every call
  // made each field's edit erase the others: renaming an item sent no brand
  // and no url, and so cleared both.
  const row: Record<string, unknown> = { name: input.name.trim().slice(0, 120) }
  if (input.brand !== undefined) row.brand = input.brand?.trim() || null
  if (input.info !== undefined) row.info = input.info?.trim() || null
  if (input.url !== undefined) row.url = input.url?.trim() || null
  if (input.category !== undefined) row.category = input.category?.trim() || null
  if (!row.name) return fail('Name is required')
  if (input.aliases !== undefined) {
    row.aliases = [...new Set(input.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean))]
  }
  if (input.disciplines !== undefined) {
    const { CAPABILITY_ORDER } = await import('@/lib/capabilities')
    const valid = new Set<string>(CAPABILITY_ORDER)
    row.disciplines = [...new Set(input.disciplines.filter((d) => valid.has(d)))]
  }

  if (input.parentId !== undefined) {
    // Two levels, not a tree: a model hangs off a type, and a type has no
    // parent. Anything deeper and "what satisfies this line" stops having one
    // obvious answer.
    if (input.parentId) {
      const { data: parent } = await admin
        .from('gear_items').select('id, parent_id, category').eq('id', input.parentId).single()
      if (!parent) return fail('That generic item no longer exists')
      if (parent.parent_id) return fail('A product can’t sit under another product — pick the generic item instead')
      if (input.id === input.parentId) return fail('An item can’t be its own generic item')
      // A product is the same kind of kit as the type it satisfies, so its
      // category is the type's and not a second answer that can disagree. The
      // catalog nests products under their type, which hid the disagreement:
      // a product could sit in one category's table while counting towards
      // another's.
      row.category = parent.category
    }
    row.parent_id = input.parentId
  }

  // A name that already exists, as a name or as a synonym, is the duplicate we
  // are trying to prevent — say which row it collided with rather than a bare
  // constraint error.
  const typed = (row.name as string).toLowerCase()
  const { data: clash } = await admin
    .from('gear_items')
    .select('id, name, active')
    .or(`name.ilike.${typed},aliases.cs.{"${typed.replace(/"/g, '')}"}`)
    .limit(4)
  const other = (clash ?? []).find((c) => c.id !== input.id)

  // A deleted row keeps its name, and delete is soft so lists that used it
  // still resolve. That made a deleted name unusable forever: gone from the
  // page, yet refusing to be added again. Re-adding it is undeleting it —
  // which also hands back whatever still points at it.
  if (other && !other.active && !input.id) {
    const { error } = await admin
      .from('gear_items')
      .update({ ...row, active: true })
      .eq('id', other.id)
    if (error) throw new Error(error.message)
    touch()
    return { id: other.id }
  }

  if (other) return fail(`"${other.name}" is already in the catalog — use it, or add this as a product under it`)

  if (input.id) {
    const { error } = await admin.from('gear_items').update(row).eq('id', input.id)
    if (error) throw new Error(error.message)
    touch()
    return { id: input.id }
  }
  const { data, error } = await admin.from('gear_items').insert(row).select('id').single()
  if (error) throw new Error(error.message)
  touch()
  return { id: data.id }
}

// Renaming a category renames it everywhere at once. It isn't a row of its
// own — a category exists only as the string its members carry — so the only
// way to rename one is to write the new name onto every item holding the old.
export async function renameGearCategory(from: string, to: string): Promise<Failed | void> {
  const admin = await requireAdmin()
  const next = to.trim().slice(0, 60)
  if (!next) return fail('A category needs a name')
  if (next === from) return

  const { error } = await admin
    .from('gear_items')
    .update({ category: next })
    .eq('category', from)
  if (error) throw new Error(error.message)
  touch()
}

export async function retireGearItem(id: string) {
  const admin = await requireAdmin()
  // Kept, not deleted — lists that already reference it stay intact.
  const { error } = await admin.from('gear_items').update({ active: false }).eq('id', id)
  if (error) throw new Error(error.message)
  touch()
}

// Fold one catalog row into another: every list that used it now points at the
// keeper, and the loser's name survives as a synonym so searching for it still
// lands somewhere. Models under the loser move across too.
export async function mergeGearItems(keepId: string, dropId: string) {
  const admin = await requireAdmin()
  if (keepId === dropId) throw new Error('Pick two different items')

  const { data: rows } = await admin
    .from('gear_items').select('id, name, aliases, parent_id').in('id', [keepId, dropId])
  const keep = rows?.find((r) => r.id === keepId)
  const drop = rows?.find((r) => r.id === dropId)
  if (!keep || !drop) throw new Error('Item not found')

  await admin.from('gear_list_entries').update({ gear_item_id: keepId }).eq('gear_item_id', dropId)
  await admin.from('gear_items').update({ parent_id: keep.parent_id ? null : keepId }).eq('parent_id', dropId)

  // An entry could end up naming the keeper twice if it already listed both as
  // options; the unique constraint would reject the update, so clear first.
  const { data: dupes } = await admin.from('gear_entry_options').select('entry_id').eq('gear_item_id', keepId)
  const alreadyHas = new Set((dupes ?? []).map((d) => d.entry_id))
  const { data: moving } = await admin.from('gear_entry_options').select('id, entry_id').eq('gear_item_id', dropId)
  for (const m of moving ?? []) {
    if (alreadyHas.has(m.entry_id)) await admin.from('gear_entry_options').delete().eq('id', m.id)
    else await admin.from('gear_entry_options').update({ gear_item_id: keepId }).eq('id', m.id)
  }

  const aliases = [...new Set([
    ...(keep.aliases ?? []), ...(drop.aliases ?? []), drop.name.toLowerCase(),
  ])]
  await admin.from('gear_items').update({ aliases }).eq('id', keepId)

  const { error } = await admin.from('gear_items').delete().eq('id', dropId)
  if (error) throw new Error(error.message)
  touch()
  return { keptName: keep.name, droppedName: drop.name }
}

// ─── Lists ──────────────────────────────────────────────────────────────────

export async function createGearList(input: {
  name: string
  audience: 'student' | 'instructor'
  instanceId?: string | null
  courseType?: string | null
  isTemplate?: boolean
}) {
  const admin = await requireAdmin()
  const { data, error } = await admin
    .from('gear_lists')
    .insert({
      name: input.name.trim().slice(0, 120) || 'Gear list',
      audience: input.audience,
      instance_id: input.instanceId ?? null,
      course_type: input.courseType ?? null,
      is_template: input.isTemplate ?? false,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  touch(input.instanceId)
  return { id: data.id }
}

export async function updateGearList(
  id: string,
  patch: {
    name?: string
    intro?: string | null
    audience?: 'student' | 'instructor'
    // Library metadata — how a template is found on the shelf. A course's own
    // list can carry them too; nothing reads them there.
    description?: string | null
    courseType?: string | null
    disciplines?: string[]
    topics?: string[]
  }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || 'Gear list'
  if (patch.intro !== undefined) update.intro = patch.intro?.trim() || null
  if (patch.audience !== undefined) update.audience = patch.audience
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.courseType !== undefined) update.course_type = patch.courseType || null
  if (patch.disciplines !== undefined) update.disciplines = [...new Set(patch.disciplines)]
  if (patch.topics !== undefined) {
    update.topics = [...new Set(patch.topics.map((t) => t.trim()).filter(Boolean))]
  }
  const { data, error } = await admin.from('gear_lists').update(update).eq('id', id).select('instance_id').single()
  if (error) throw new Error(error.message)
  touch(data?.instance_id)
}

export async function deleteGearList(id: string) {
  const admin = await requireAdmin()
  const { data } = await admin.from('gear_lists').select('instance_id').eq('id', id).single()
  const { error } = await admin.from('gear_lists').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch(data?.instance_id)
}

// ─── Entries ────────────────────────────────────────────────────────────────

// instanceId and sortOrder are passed in by the editor, which already knows
// both, purely to save a round trip each. Neither decides anything the caller
// isn't allowed to decide — the first only picks which pages to revalidate,
// the second is the row's position on a list they are already editing — so
// taking them on trust costs nothing.
export async function addGearEntry(
  listId: string,
  input: {
    gearItemId?: string | null; name?: string; section?: string | null
    groupType?: 'personal' | 'group'; quantity?: string | null
    sortOrder?: number; instanceId?: string | null
    // Which alternative of which choice this lands in, when it's being added
    // straight into one. Both or neither — half a choice isn't a state.
    optionGroup?: string | null; optionBranch?: number | null
  }
) {
  const admin = await requireAdmin()

  // A row starts with no note. Anything to say about the item on *this*
  // course is typed onto the row afterwards — the catalog holds no notes to
  // seed it with, which is the point: a spec written there went out on every
  // list whether it was true of that course or not.
  //
  // The section is the caller's to choose, and no section is a real answer —
  // the row then sits directly under Personal or Group, which is where most
  // gear belongs. The catalog's category is how an instructor finds an item,
  // not a heading to file it under, so it is never borrowed as one; doing that
  // is what filled these lists with headings nobody had chosen.
  const section = input.section?.trim() || null
  const seed = {
    name: input.gearItemId ? null : input.name?.trim() || null,
    note: null, url: null, section,
  }
  if (!input.gearItemId && !seed.name) throw new Error('Pick an item or give it a name')

  let sortOrder = input.sortOrder
  if (sortOrder === undefined) {
    const { data: last } = await admin
      .from('gear_list_entries')
      .select('sort_order')
      .eq('list_id', listId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    sortOrder = last ? (last.sort_order as number) + 1 : 0
  }

  const choice = input.optionGroup?.trim() || null
  const { data: added, error } = await admin.from('gear_list_entries').insert({
    list_id: listId,
    gear_item_id: input.gearItemId ?? null,
    ...seed,
    group_type: input.groupType ?? 'personal',
    quantity: input.quantity?.trim() || null,
    sort_order: sortOrder,
    option_group: choice,
    option_branch: choice ? input.optionBranch ?? 0 : null,
  }).select('id').single()
  if (error) throw new Error(error.message)

  await touchList(admin, listId, input.instanceId)
  return { id: added.id as string }
}

// The course whose pages need rebuilding. The caller usually knows it, and a
// query to re-learn it costs as much as the write it follows.
async function touchList(admin: Admin, listId: string, known?: string | null) {
  if (known !== undefined) return touch(known)
  const { data } = await admin.from('gear_lists').select('instance_id').eq('id', listId).single()
  touch(data?.instance_id)
}

export async function updateGearEntry(
  id: string,
  patch: { name?: string | null; note?: string | null; url?: string | null; section?: string | null; groupType?: 'personal' | 'group'; quantity?: string | null },
  instanceId?: string | null
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({
    name: patch.name, note: patch.note,
    url: patch.url, section: patch.section, quantity: patch.quantity,
  })) {
    if (v !== undefined) update[k] = (v as string)?.trim() || null
  }
  if (patch.groupType !== undefined) update.group_type = patch.groupType

  if (instanceId !== undefined) {
    const { error } = await admin.from('gear_list_entries').update(update).eq('id', id)
    if (error) throw new Error(error.message)
    return touch(instanceId)
  }

  const { data, error } = await admin
    .from('gear_list_entries')
    .update(update)
    .eq('id', id)
    .select('gear_lists(instance_id)')
    .single()
  if (error) throw new Error(error.message)
  touch((data?.gear_lists as unknown as { instance_id: string | null } | null)?.instance_id)
}

// Which products satisfy this slot. None means the item stands as written; one
// pins it; several read as "A or B". Always a disjunction — two products you
// both need are two slots, because only a slot can carry its own quantity.
export async function setGearEntryOptions(
  entryId: string,
  gearItemIds: string[],
  instanceId?: string | null
) {
  const admin = await requireAdmin()
  await admin.from('gear_entry_options').delete().eq('entry_id', entryId)
  const ids = [...new Set(gearItemIds)]
  if (ids.length) {
    const { error } = await admin.from('gear_entry_options').insert(
      ids.map((gear_item_id, i) => ({ entry_id: entryId, gear_item_id, sort_order: i }))
    )
    if (error) throw new Error(error.message)
  }
  if (instanceId !== undefined) return touch(instanceId)

  const { data } = await admin
    .from('gear_list_entries').select('gear_lists(instance_id)').eq('id', entryId).single()
  touch((data?.gear_lists as unknown as { instance_id: string | null } | null)?.instance_id)
}

// Renaming a heading is renaming it everywhere in that section — a section only
// exists as the string its rows agree on, so editing one row's copy would
// split the section in two instead. Scoped to one side of the list, because
// "Ropes" under personal kit and "Ropes" under group kit are two headings that
// happen to share a word, and renaming one shouldn't touch the other.
export async function renameGearSection(
  listId: string,
  groupType: 'personal' | 'group',
  from: string,
  to: string
) {
  const admin = await requireAdmin()
  const next = to.trim()
  if (!next) throw new Error('Give the section a name')
  if (next === from) return

  const { error } = await admin
    .from('gear_list_entries')
    .update({ section: next })
    .eq('list_id', listId)
    .eq('group_type', groupType)
    .eq('section', from)
  if (error) throw new Error(error.message)

  const { data: l } = await admin.from('gear_lists').select('instance_id').eq('id', listId).single()
  touch(l?.instance_id)
}

// Dropping the heading and keeping the gear, which is what you want for a
// section that was never chosen — every list built before headings were
// deliberate has a few, filled in from whatever the catalog called the item.
export async function ungroupGearSection(
  listId: string,
  groupType: 'personal' | 'group',
  section: string
) {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('gear_list_entries')
    .update({ section: null })
    .eq('list_id', listId)
    .eq('group_type', groupType)
    .eq('section', section)
  if (error) throw new Error(error.message)

  const { data: l } = await admin.from('gear_lists').select('instance_id').eq('id', listId).single()
  touch(l?.instance_id)
}

// Deleting a heading deletes what's under it. There's no such thing as an empty
// section to leave behind — the heading is only the agreement between its rows
// — so the alternative would be silently scattering the gear somewhere else.
export async function removeGearSection(
  listId: string,
  groupType: 'personal' | 'group',
  section: string
) {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('gear_list_entries')
    .delete()
    .eq('list_id', listId)
    .eq('group_type', groupType)
    .eq('section', section)
  if (error) throw new Error(error.message)

  const { data: l } = await admin.from('gear_lists').select('instance_id').eq('id', listId).single()
  touch(l?.instance_id)
}

// Where a dragged row landed: which heading it's under now, which side of the
// list it's on, and the order every row on the list ended up in. Order is sent
// whole rather than as a single row's new index, because a drop shifts the rows
// it passed and the editor already knows the arrangement it just drew.
export async function moveGearEntry(
  listId: string,
  entryId: string,
  target: {
    section: string | null; groupType: 'personal' | 'group'; orderedIds: string[]
    instanceId?: string | null
    // Where inside the section it landed: an alternative of a choice, or the
    // plain run of gear outside every choice, which is null for both.
    optionGroup?: string | null; optionBranch?: number | null
  }
) {
  const admin = await requireAdmin()
  const choice = target.optionGroup?.trim() || null

  // Renumbering from zero every time keeps the orders dense, so a list can't
  // drift into the state where two rows share a sort_order and the arrangement
  // depends on what the database felt like returning. The dragged row's new
  // heading rides along in its own update rather than going first, so the whole
  // move is one round trip's worth of waiting instead of two.
  const results = await Promise.all(
    target.orderedIds.map((id, i) =>
      admin
        .from('gear_list_entries')
        .update(id === entryId
          ? {
              sort_order: i,
              section: target.section?.trim() || null,
              group_type: target.groupType,
              option_group: choice,
              option_branch: choice ? target.optionBranch ?? 0 : null,
            }
          : { sort_order: i })
        .eq('id', id)
        .eq('list_id', listId)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  await touchList(admin, listId, target.instanceId)
}

// ─── Choices ────────────────────────────────────────────────────────────────

// A choice belongs to one heading on one side of one list, the same way a
// section does. "Exposure protection" under personal kit and the same words
// under group kit are two choices that share a name, so every statement below
// is scoped to all three.
type ChoiceScope = {
  listId: string
  groupType: 'personal' | 'group'
  section: string | null
  // The opaque grouping key, not the heading. Renaming the heading is now a
  // plain field edit that can't collide with anything, because the identity of
  // a choice stopped being the words on it.
  key: string
}

// PostgREST's builder types are recursive enough that a generic wrapper around
// them blows the instantiation depth limit, so the filters go on as a plain
// object of equalities plus the one case that can't be expressed that way.
//
// A null section is "filed under no heading", which is most gear — and
// `eq(col, null)` matches nothing in PostgREST rather than matching nulls, so
// it has to be `is`.
function scopeFilter(s: ChoiceScope) {
  return {
    match: { list_id: s.listId, group_type: s.groupType, option_group: s.key },
    section: s.section,
  }
}

// Turn a row that is simply required into the first alternative of a choice.
//
// The other way round from building a choice and dragging gear into it, and the
// more common one: you write the list, and only on reaching the drysuit do you
// realise the wetsuit above it was an alternative rather than a requirement.
//
// No heading is asked for: it is optional, and typed in place afterwards if it
// earns its place.
//
// The key is opaque — nobody reads it — but it comes from the caller, because the second alternative is opened on
// screen at the same moment this row becomes the first one. Minting a key here
// instead would leave the empty alternative pointing at a group the row it is
// an alternative to never joined — two choices side by side, one of them the
// original row on its own.
export async function wrapGearEntryInChoice(
  entryId: string, key: string, instanceId?: string | null
): Promise<{ key: string } | Failed> {
  const admin = await requireAdmin()

  if (!UUID.test(key)) return fail('That choice couldn’t be started')

  const { data: row } = await admin
    .from('gear_list_entries')
    .select('list_id, option_group')
    .eq('id', entryId)
    .single()
  if (!row) return fail('That row is no longer on the list')
  if (row.option_group) return fail('That item is already one of a set of alternatives')

  // Branch 0, because it is the alternative that was already written down and
  // so the one that reads first.
  const { error } = await admin
    .from('gear_list_entries')
    .update({ option_group: key, option_branch: 0 })
    .eq('id', entryId)
  if (error) throw new Error(error.message)
  if (instanceId !== undefined) touch(instanceId)
  else await touchList(admin, row.list_id)
  return { key }
}

// The heading over the alternatives, which every row of the choice carries a
// copy of — the same shape as a section, and for the same reason: there is no
// row for the choice itself to hang it on. Empty is a real answer and the
// common one.
export async function setGearChoiceLabel(scope: ChoiceScope, label: string | null) {
  const admin = await requireAdmin()
  const next = label?.trim().slice(0, 120) || null
  const f = scopeFilter(scope)
  const q = admin.from('gear_list_entries').update({ option_label: next }).match(f.match)
  const { error } = await (f.section === null ? q.is('section', null) : q.eq('section', f.section))
  if (error) throw new Error(error.message)
  await touchList(admin, scope.listId)
}

// Add a slot to the line this row is part of — the one mechanism both "+ and"
// controls point at, at either level.
//
// A line is one or more slots sharing a branch. Most rows are a line of one, so
// the first "+ and" has to make the group: the row is put in a fresh group on
// branch 0 and the new slot joins it there. After that they are simply two rows
// that agree, the same way a section is.
//
// `pinnedProductId` is what "+ and" on the products means: another product you
// also need becomes its own slot of the same item, narrowed to that product.
// That is the only way it can carry its own quantity — two ropes and one bag.
export async function addSlotBeside(
  entryId: string,
  input: { gearItemId?: string | null; name?: string; pinnedProductId?: string | null },
  instanceId?: string | null
): Promise<{ id: string } | Failed> {
  const admin = await requireAdmin()

  const { data: src } = await admin
    .from('gear_list_entries')
    .select('list_id, section, group_type, option_group, option_branch, option_label, sort_order')
    .eq('id', entryId)
    .single()
  if (!src) return fail('That row is no longer on the list')
  if (!input.gearItemId && !input.name?.trim()) return fail('Pick an item or give it a name')

  let key = src.option_group
  let branch = src.option_branch
  if (!key) {
    key = crypto.randomUUID()
    branch = 0
    const { error } = await admin
      .from('gear_list_entries')
      .update({ option_group: key, option_branch: branch })
      .eq('id', entryId)
    if (error) throw new Error(error.message)
  }

  // Straight after the slot it accompanies, so the line reads in the order it
  // was built. Everything below shuffles down rather than the new slot landing
  // at the foot of the section away from what it belongs with.
  const { data: below } = await admin
    .from('gear_list_entries')
    .select('id, sort_order')
    .eq('list_id', src.list_id)
    .gt('sort_order', src.sort_order)
  await Promise.all(
    (below ?? []).map((r) =>
      admin.from('gear_list_entries').update({ sort_order: r.sort_order + 1 }).eq('id', r.id)
    )
  )

  const { data: added, error } = await admin
    .from('gear_list_entries')
    .insert({
      list_id: src.list_id,
      gear_item_id: input.gearItemId ?? null,
      name: input.gearItemId ? null : input.name?.trim() || null,
      section: src.section,
      group_type: src.group_type,
      option_group: key,
      option_branch: branch,
      option_label: src.option_label,
      sort_order: src.sort_order + 1,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (input.pinnedProductId) {
    const { error: e2 } = await admin
      .from('gear_entry_options')
      .insert({ entry_id: added.id, gear_item_id: input.pinnedProductId, sort_order: 0 })
    if (e2) throw new Error(e2.message)
  }

  if (instanceId !== undefined) touch(instanceId)
  else await touchList(admin, src.list_id)
  return { id: added.id as string }
}

// Dissolve the choice and keep the gear. Every alternative becomes an ordinary
// required row, which is the honest reading — the list no longer says one of
// them will do, so it says bring them. Deleting the gear instead would throw
// away the drysuit because someone changed their mind about offering it.
export async function ungroupGearChoice(scope: ChoiceScope) {
  const admin = await requireAdmin()
  const f = scopeFilter(scope)
  const q = admin
    .from('gear_list_entries')
    .update({ option_group: null, option_branch: null })
    .match(f.match)
  const { error } = await (f.section === null ? q.is('section', null) : q.eq('section', f.section))
  if (error) throw new Error(error.message)
  await touchList(admin, scope.listId)
}

// Drop one alternative. The gear in it goes with it — an alternative is the
// rows in it, so keeping them would mean deciding which heading they land under
// on the way out, and the honest answer is that nobody asked for them at all.
export async function removeGearChoiceBranch(scope: ChoiceScope, branch: number) {
  const admin = await requireAdmin()
  const f = scopeFilter(scope)
  const del = admin.from('gear_list_entries').delete().match(f.match).eq('option_branch', branch)
  const { error } = await (f.section === null ? del.is('section', null) : del.eq('section', f.section))
  if (error) throw new Error(error.message)

  // One branch left is not dissolved: it is still a line made of several slots
  // — "rope and rope bag" — which is a real thing to be, and the alternative
  // that was dropped was the only part that stopped being true.
  await touchList(admin, scope.listId)
}

export async function removeGearEntry(id: string, instanceId?: string | null) {
  const admin = await requireAdmin()
  if (instanceId !== undefined) {
    const { error } = await admin.from('gear_list_entries').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return touch(instanceId)
  }

  const { data } = await admin.from('gear_list_entries').select('gear_lists(instance_id)').eq('id', id).single()
  const { error } = await admin.from('gear_list_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch((data?.gear_lists as unknown as { instance_id: string | null } | null)?.instance_id)
}

// ─── Templates ──────────────────────────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>

const SOURCE_SELECT = `name, audience, intro, ${GEAR_ENTRIES_COPY_SELECT}`

type OptionRow = { gear_item_id: string; sort_order: number }
type EntryRow = Record<string, unknown> & { gear_entry_options: OptionRow[] }

// Lay one list's entries onto another list. Shared by "start from a template"
// and "save back into a template" so the two can't drift in what they carry.
async function copyEntriesInto(admin: Admin, entries: EntryRow[], listId: string) {
  if (!entries.length) return 0

  const { data: made, error } = await admin
    .from('gear_list_entries')
    .insert(entries.map(({ gear_entry_options: _options, ...e }) => ({ ...e, list_id: listId })))
    .select('id')
  if (error) throw new Error(error.message)

  // Insert order matches the array we sent, so an entry's either/or set
  // follows it onto the copy.
  const options = (made ?? []).flatMap((row, i) =>
    (entries[i].gear_entry_options ?? []).map((o) => ({
      entry_id: row.id, gear_item_id: o.gear_item_id, sort_order: o.sort_order,
    }))
  )
  if (options.length) {
    const { error: e2 } = await admin.from('gear_entry_options').insert(options)
    if (e2) throw new Error(e2.message)
  }
  return entries.length
}

// Copy a list — a template onto a course, or a course's list into a brand new
// template. Entries are copied, not referenced: a course's list is its own
// after that, so editing it can't rewrite the template.
export async function copyGearList(
  sourceId: string,
  target: { instanceId?: string | null; isTemplate?: boolean; name?: string; courseType?: string | null }
) {
  const admin = await requireAdmin()

  const { data: src } = await admin.from('gear_lists').select(SOURCE_SELECT).eq('id', sourceId).single()
  if (!src) throw new Error('List not found')

  const { data: created, error } = await admin
    .from('gear_lists')
    .insert({
      name: target.name?.trim() || src.name,
      audience: src.audience,
      intro: src.intro,
      instance_id: target.instanceId ?? null,
      is_template: target.isTemplate ?? false,
      course_type: target.courseType ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const entries = await copyEntriesInto(
    admin, (src.gear_list_entries ?? []) as unknown as EntryRow[], created.id
  )

  touch(target.instanceId)
  return { id: created.id, entries }
}

// Push a refined course list back over the template it came from. Still not a
// live link — this only happens on an explicit click, and it replaces the
// template's contents wholesale. What stays is the template's shelf identity:
// its name, what it's for, and its tags. Every course already built from it
// keeps its own copy untouched.
export async function saveGearListIntoTemplate(sourceId: string, templateId: string) {
  const admin = await requireAdmin()
  if (sourceId === templateId) throw new Error('That list is the template')

  const { data: target } = await admin
    .from('gear_lists').select('id, name, is_template').eq('id', templateId).single()
  if (!target) throw new Error('That template no longer exists')
  if (!target.is_template) throw new Error('That isn’t a template')

  const { data: src } = await admin.from('gear_lists').select(SOURCE_SELECT).eq('id', sourceId).single()
  if (!src) throw new Error('List not found')

  const { error: e1 } = await admin.from('gear_list_entries').delete().eq('list_id', templateId)
  if (e1) throw new Error(e1.message)

  const entries = await copyEntriesInto(
    admin, (src.gear_list_entries ?? []) as unknown as EntryRow[], templateId
  )

  // The intro and who it's for describe the kit, so they travel with it.
  const { error: e2 } = await admin
    .from('gear_lists')
    .update({ intro: src.intro, audience: src.audience, updated_at: new Date().toISOString() })
    .eq('id', templateId)
  if (e2) throw new Error(e2.message)

  touch()
  return { name: target.name as string, entries }
}
