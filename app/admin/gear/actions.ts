'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  if (instanceId) {
    revalidatePath(`/admin/courses/${instanceId}`)
    revalidatePath(`/portal/${instanceId}`)
  }
}

// ─── Catalog ────────────────────────────────────────────────────────────────

export async function upsertGearItem(input: {
  id?: string
  name: string
  info?: string | null
  recommended?: string | null
  url?: string | null
  category?: string | null
}) {
  const admin = await requireAdmin()
  const row = {
    name: input.name.trim().slice(0, 120),
    info: input.info?.trim() || null,
    recommended: input.recommended?.trim() || null,
    url: input.url?.trim() || null,
    category: input.category?.trim() || null,
  }
  if (!row.name) throw new Error('Name is required')

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

export async function retireGearItem(id: string) {
  const admin = await requireAdmin()
  // Kept, not deleted — lists that already reference it stay intact.
  const { error } = await admin.from('gear_items').update({ active: false }).eq('id', id)
  if (error) throw new Error(error.message)
  touch()
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
  patch: { name?: string; intro?: string | null; audience?: 'student' | 'instructor' }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || 'Gear list'
  if (patch.intro !== undefined) update.intro = patch.intro?.trim() || null
  if (patch.audience !== undefined) update.audience = patch.audience
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

export async function addGearEntry(
  listId: string,
  input: { gearItemId?: string | null; name?: string; category?: string | null; groupType?: 'personal' | 'group'; quantity?: string | null }
) {
  const admin = await requireAdmin()

  // Catalog items carry their own info/recommendation; a one-off keeps what
  // was typed. Either way the entry can be edited afterwards without touching
  // the catalog.
  let seed: { name: string | null; info: string | null; recommended: string | null; url: string | null; category: string | null } = {
    name: input.name?.trim() || null, info: null, recommended: null, url: null, category: input.category ?? null,
  }
  if (input.gearItemId) {
    const { data: g } = await admin
      .from('gear_items')
      .select('name, info, recommended, url, category')
      .eq('id', input.gearItemId)
      .single()
    if (g) seed = { name: null, info: null, recommended: null, url: null, category: input.category ?? g.category }
  }
  if (!input.gearItemId && !seed.name) throw new Error('Pick an item or give it a name')

  const { data: last } = await admin
    .from('gear_list_entries')
    .select('sort_order')
    .eq('list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await admin.from('gear_list_entries').insert({
    list_id: listId,
    gear_item_id: input.gearItemId ?? null,
    ...seed,
    group_type: input.groupType ?? 'personal',
    quantity: input.quantity?.trim() || null,
    sort_order: last ? (last.sort_order as number) + 1 : 0,
  })
  if (error) throw new Error(error.message)

  const { data: l } = await admin.from('gear_lists').select('instance_id').eq('id', listId).single()
  touch(l?.instance_id)
}

export async function updateGearEntry(
  id: string,
  patch: { name?: string | null; info?: string | null; recommended?: string | null; url?: string | null; category?: string | null; groupType?: 'personal' | 'group'; quantity?: string | null }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({
    name: patch.name, info: patch.info, recommended: patch.recommended,
    url: patch.url, category: patch.category, quantity: patch.quantity,
  })) {
    if (v !== undefined) update[k] = (v as string)?.trim() || null
  }
  if (patch.groupType !== undefined) update.group_type = patch.groupType

  const { data, error } = await admin
    .from('gear_list_entries')
    .update(update)
    .eq('id', id)
    .select('gear_lists(instance_id)')
    .single()
  if (error) throw new Error(error.message)
  touch((data?.gear_lists as unknown as { instance_id: string | null } | null)?.instance_id)
}

export async function removeGearEntry(id: string) {
  const admin = await requireAdmin()
  const { data } = await admin.from('gear_list_entries').select('gear_lists(instance_id)').eq('id', id).single()
  const { error } = await admin.from('gear_list_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch((data?.gear_lists as unknown as { instance_id: string | null } | null)?.instance_id)
}

// ─── Templates ──────────────────────────────────────────────────────────────

// Copy a list — template onto a course, or a course's list back into a
// template. Entries are copied, not referenced: a course's list is its own
// after that, so editing it can't rewrite the template.
export async function copyGearList(
  sourceId: string,
  target: { instanceId?: string | null; isTemplate?: boolean; name?: string; courseType?: string | null }
) {
  const admin = await requireAdmin()

  const { data: src } = await admin
    .from('gear_lists')
    .select('name, audience, intro, gear_list_entries(gear_item_id, name, info, recommended, url, category, group_type, quantity, sort_order)')
    .eq('id', sourceId)
    .single()
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

  const entries = (src.gear_list_entries ?? []) as Record<string, unknown>[]
  if (entries.length) {
    const { error: e2 } = await admin.from('gear_list_entries').insert(
      entries.map((e) => ({ ...e, list_id: created.id }))
    )
    if (e2) throw new Error(e2.message)
  }

  touch(target.instanceId)
  return { id: created.id, entries: entries.length }
}
