'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIBRARY_KINDS, BUCKET_ORDER } from '@/lib/library'
import { isValidRegion } from '@/lib/regions'
import { CAPABILITY_ORDER } from '@/lib/capabilities'
import { refuse, type ActionResult } from '@/lib/action-result'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

function revalidate() {
  revalidatePath('/admin/library')
  revalidatePath('/admin/venues')
  // Courses and portals render library items — title, link, and the audience
  // that caps what a course can share. Editing the item here and not saying so
  // leaves a course page insisting a document is instructors-only well after
  // it stopped being. Which course is unknowable from here, so both trees go.
  revalidatePath('/admin/courses/[id]', 'page')
  revalidatePath('/portal/[id]', 'page')
}

const VALID_KINDS = new Set<string>(LIBRARY_KINDS)
const VALID_DISCIPLINES = new Set<string>(CAPABILITY_ORDER)
const VALID_BUCKETS = new Set<string>(BUCKET_ORDER)

// Free-form tags are the one open field; keep them tidy so the autocomplete
// stays useful (deduped, trimmed, capped).
function cleanTags(raw: string): string[] {
  return [...new Set(
    raw.split(',').map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 60))
  )].slice(0, 12)
}

export type LibraryPatch = {
  title?: string
  description?: string | null
  url?: string | null
  edit_url?: string | null
  kind?: string
  audience?: 'internal' | 'shared'
  disciplines?: string[]
  topicsRaw?: string
  venue_id?: string | null
  expires_at?: string | null
  status?: 'pending' | 'published' | 'archived'
  bucket?: string
  region?: string | null
}

export async function updateLibraryItem(id: string, patch: LibraryPatch) {
  const admin = await requireAdmin()

  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 200) || 'Untitled'
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.url !== undefined) update.url = patch.url?.trim() || null
  if (patch.edit_url !== undefined) update.edit_url = patch.edit_url?.trim() || null
  if (patch.kind !== undefined && VALID_KINDS.has(patch.kind)) update.kind = patch.kind
  if (patch.audience !== undefined) update.audience = patch.audience
  if (patch.disciplines !== undefined) {
    update.disciplines = patch.disciplines.filter((d) => VALID_DISCIPLINES.has(d))
  }
  if (patch.topicsRaw !== undefined) update.topics = cleanTags(patch.topicsRaw)
  if (patch.venue_id !== undefined) update.venue_id = patch.venue_id || null
  if (patch.bucket !== undefined && VALID_BUCKETS.has(patch.bucket)) update.bucket = patch.bucket
  if (patch.region !== undefined) update.region = isValidRegion(patch.region) ? patch.region : null
  if (patch.expires_at !== undefined) update.expires_at = patch.expires_at || null
  if (patch.status !== undefined) {
    update.status = patch.status
    if (patch.status === 'published') update.reviewed_at = new Date().toISOString()
  }
  update.updated_at = new Date().toISOString()

  const { error } = await admin.from('library_items').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function createLibraryItem(formData: FormData) {
  const admin = await requireAdmin()

  const url = ((formData.get('url') as string) || '').trim()
  const kind = (formData.get('kind') as string) || 'reference'
  const bucket = (formData.get('bucket') as string) || 'resource'
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  const youtube = /youtube\.com|youtu\.be/.test(url)

  // A map has one shelf and the type already named it, so the form doesn't ask
  // and this doesn't trust an answer it didn't get.
  const isMap = kind === 'map'

  const { data: created, error } = await admin.from('library_items').insert({
    title: ((formData.get('title') as string) || '').trim().slice(0, 200) || 'Untitled',
    description: ((formData.get('description') as string) || '').trim() || null,
    url: url || null,
    edit_url: ((formData.get('edit_url') as string) || '').trim() || null,
    drive_file_id: driveMatch?.[1] ?? null,
    source_type: driveMatch ? 'drive' : youtube ? 'youtube' : 'link',
    kind: VALID_KINDS.has(kind) ? kind : 'reference',
    bucket: isMap ? 'map' : VALID_BUCKETS.has(bucket) ? bucket : 'resource',
    region: isValidRegion(formData.get('region') as string) ? (formData.get('region') as string) : null,
    audience: (formData.get('audience') as string) === 'shared' ? 'shared' : 'internal',
    disciplines: (formData.getAll('disciplines') as string[]).filter((d) => VALID_DISCIPLINES.has(d)),
    topics: cleanTags((formData.get('topics') as string) || ''),
    venue_id: ((formData.get('venue_id') as string) || '') || null,
    expires_at: ((formData.get('expires_at') as string) || '') || null,
    status: 'published',
  }).select('id').single()
  if (error) throw new Error(error.message)

  // The map's first link, with the two facts the form asked for. Any others
  // are added on the item itself, where they can be seen beside each other.
  if (isMap && url && created) {
    const access = (formData.get('link_access') as string) === 'edit' ? 'edit' : 'read'
    const audience = (formData.get('link_audience') as string) === 'instructors' ? 'instructors' : 'students'
    const { error: linkError } = await admin
      .from('library_item_links')
      .insert({ item_id: created.id, url, access, audience })
    if (linkError) throw new Error(linkError.message)
  }

  revalidate()
}

// ─── Deleting an item that courses are pointing at ──────────────────────────
//
// Every table that references a library item cascades off it, so a delete used
// to take the reference with it — and a map promoted from a course owns no copy
// of its own link any more (map-actions' promoteToLibrary hands the url over as
// the item id goes on). Deleting the shelf copy therefore deleted the map off
// the course that put it there, silently, behind a confirm that said only
// "permanently".
//
// So a delete hands the link back first. A course row that was pointing at the
// item becomes the one-off it was before it was promoted — same row, same
// place in the list, its own url again — and only the shelf copy goes. What
// this does not do is guess: a row there is no standalone shape for stops the
// delete rather than being quietly dropped.

/** Where an item is in use, and what a delete would do about each. */
export type LibraryItemUses = {
  /** Course rows that would be handed the link back, by table. */
  maps: number
  resources: number
  items: number
  /** Distinct courses affected — the number worth putting in a sentence. */
  courses: number
  /** Templates using it, by name. These block the delete. */
  templates: string[]
  /** False when there is no link to hand back, which also blocks the delete. */
  hasLink: boolean
}

type Admin = ReturnType<typeof createAdminClient>

async function usesOf(admin: Admin, id: string): Promise<LibraryItemUses> {
  const [{ data: item }, { data: links }, { data: maps }, { data: resources }, { data: items }, { data: templates }] =
    await Promise.all([
      admin.from('library_items').select('url').eq('id', id).maybeSingle(),
      admin.from('library_item_links').select('url, access').eq('item_id', id),
      admin.from('course_maps').select('id, instance_id').eq('library_item_id', id),
      admin.from('course_resources').select('id, instance_id').eq('library_item_id', id),
      admin.from('course_items').select('id, course_modules!inner(instance_id)').eq('library_item_id', id),
      admin
        .from('course_template_items')
        .select('id, course_template_sections!inner(course_templates!inner(name))')
        .eq('item_id', id),
    ])

  const courses = new Set<string>()
  for (const r of maps ?? []) courses.add(r.instance_id)
  for (const r of resources ?? []) courses.add(r.instance_id)
  for (const r of items ?? []) {
    const m = r.course_modules as unknown as { instance_id: string } | null
    if (m) courses.add(m.instance_id)
  }

  const names = new Set<string>()
  for (const r of templates ?? []) {
    const section = r.course_template_sections as unknown as { course_templates: { name: string } | null } | null
    if (section?.course_templates?.name) names.add(section.course_templates.name)
  }

  return {
    maps: (maps ?? []).length,
    resources: (resources ?? []).length,
    items: (items ?? []).length,
    courses: courses.size,
    templates: [...names].sort(),
    hasLink: Boolean(item?.url || readableLink(links ?? [])),
  }
}

// A map keeps its links in their own table and the item's url is the read one,
// so either is a fine thing to hand back; prefer read, since a course row that
// may reach students must not be handed the editable copy.
function readableLink(links: { url: string; access: string }[]): string | null {
  return links.find((l) => l.access === 'read')?.url ?? links.find((l) => l.access === 'edit')?.url ?? null
}

/** What a delete would do, for the confirm that asks about it. */
export async function libraryItemUses(id: string): Promise<LibraryItemUses> {
  const admin = await requireAdmin()
  return usesOf(admin, id)
}

export async function deleteLibraryItem(id: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const uses = await usesOf(admin, id)

  // A template item is nothing but a reference — no title, no url of its own —
  // so there is no row to hand the link back to, only a row to lose. Archiving
  // is the move that leaves the templates working, which is why it is named.
  if (uses.templates.length > 0) {
    return refuse(
      `${uses.templates.length === 1 ? 'The template' : 'Templates'} ${uses.templates
        .map((n) => `“${n}”`)
        .join(', ')} ${uses.templates.length === 1 ? 'uses' : 'use'} this item, and a template holds only a reference to it — deleting it would empty that section. Archive it instead: it disappears from the pickers and every template keeps working.`
    )
  }

  const attached = uses.maps + uses.resources + uses.items
  if (attached > 0 && !uses.hasLink) {
    return refuse(
      `${attached === 1 ? 'A course is' : `${attached} course rows are`} pointing at this item and it has no link to hand back, so deleting it would lose ${attached === 1 ? 'that row' : 'them'}. Archive it instead.`
    )
  }

  if (attached > 0) await handBackLink(admin, id)

  const { error } = await admin.from('library_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

// Turn every course row pointing at this item back into the one-off it was
// before promotion. Done before the delete, so a failure here leaves both the
// item and its references intact rather than half a delete.
async function handBackLink(admin: Admin, id: string) {
  const [{ data: item }, { data: links }] = await Promise.all([
    admin.from('library_items').select('title, url').eq('id', id).single(),
    admin.from('library_item_links').select('url, access').eq('item_id', id),
  ])
  const url = item?.url ?? readableLink(links ?? [])
  if (!item || !url) throw new Error('No link to hand back')

  // course_maps and course_resources both carry the label/url pair a one-off
  // row is made of, and the same check constraint saying it is that or an item
  // id, never both — so the three columns move together.
  for (const table of ['course_maps', 'course_resources'] as const) {
    const { error } = await admin
      .from(table)
      // audience stays as it was — it is the answer this course gave, and the
      // override flag goes with the library entry it was overriding.
      .update({ library_item_id: null, url, label: item.title, ...(table === 'course_maps' ? { audience_overridden: false } : {}) })
      .eq('library_item_id', id)
    if (error) throw new Error(error.message)
  }

  // A curriculum row already denormalises the title (it shares a NOT NULL
  // column with the free-typed rows), so only the link has to arrive. `type`
  // stays null, as it is on every row there has ever been — materialKind reads
  // the link instead.
  const { error } = await admin
    .from('course_items')
    .update({ library_item_id: null, url })
    .eq('library_item_id', id)
  if (error) throw new Error(error.message)
}

// Bulk operations for the review queue — approve or re-audience a whole
// section at once, since that's the unit people actually judge.
export async function approveLibraryItems(ids: string[]) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const { error } = await admin
    .from('library_items')
    .update({ status: 'published', reviewed_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function setLibraryAudience(ids: string[], audience: 'internal' | 'shared') {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const { error } = await admin.from('library_items').update({ audience }).in('id', ids)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function rejectLibraryItems(ids: string[]) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const { error } = await admin.from('library_items').update({ status: 'archived' }).in('id', ids)
  if (error) throw new Error(error.message)
  revalidate()
}

// Review queue: publish everything still pending from one Classroom class,
// so a batch that's already correct clears in one click.
export async function publishPendingFromClass(sourceClass: string) {
  const admin = await requireAdmin()
  const { error, count } = await admin
    .from('library_items')
    .update({ status: 'published', reviewed_at: new Date().toISOString() }, { count: 'exact' })
    .eq('status', 'pending')
    .eq('source_class', sourceClass)
  if (error) throw new Error(error.message)
  revalidate()
  return { published: count ?? 0 }
}

// ─── Venues ─────────────────────────────────────────────────────────────────

export async function createVenue(formData: FormData) {
  const admin = await requireAdmin()
  const name = ((formData.get('name') as string) || '').trim()
  if (!name) throw new Error('Name is required')
  const { data, error } = await admin.from('venues').insert({
    name: name.slice(0, 120),
    region: ((formData.get('region') as string) || '').trim() || null,
    region_code: isValidRegion(formData.get('region_code') as string) ? (formData.get('region_code') as string) : null,
    client_name: ((formData.get('client_name') as string) || '').trim() || null,
    notes: ((formData.get('notes') as string) || '').trim() || null,
  }).select('id').single()
  if (error) throw new Error(error.message)
  revalidate()
  // The venues list is alphabetical and the form that fills it sits under the
  // whole of it, so the new row lands out of sight. Named here, the page can
  // take the reader to it. (Outside any try: redirect throws.)
  redirect(`/admin/venues?added=${data.id}`)
}

export async function updateVenue(id: string, patch: { name?: string; region?: string | null; region_code?: string | null; client_name?: string | null; notes?: string | null; active?: boolean }) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120)
  if (patch.region !== undefined) update.region = patch.region?.trim() || null
  if (patch.region_code !== undefined) update.region_code = isValidRegion(patch.region_code) ? patch.region_code : null
  if (patch.client_name !== undefined) update.client_name = patch.client_name?.trim() || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await admin.from('venues').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function deleteVenue(id: string) {
  const admin = await requireAdmin()
  // Items keep existing; their venue link is cleared by the FK's ON DELETE SET NULL.
  const { error } = await admin.from('venues').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

// ─── A map's links ──────────────────────────────────────────────────────────
//
// Each one is a URL plus the two facts about it: what you can do with it, and
// who may be handed it. They are independent — an editable map can go to
// students on an exercise, a read-only one can be a staff reference — which is
// why they are two questions and not one.
//
// Only one link per combination. A second editable instructors' link to the
// same map is a mistake; a genuinely different map is a different entry.

export type MapLinkInput = {
  url: string
  access: 'read' | 'edit'
  audience: 'students' | 'instructors'
}

export async function setMapLink(itemId: string, link: MapLinkInput): Promise<void> {
  const admin = await requireAdmin()

  const url = link.url.trim()
  if (!url) throw new Error('A link needs a URL.')
  if (!/^https?:\/\//i.test(url)) throw new Error('That doesn’t look like a link — it should start with https://')
  if (!['read', 'edit'].includes(link.access)) throw new Error('Unknown access')
  if (!['students', 'instructors'].includes(link.audience)) throw new Error('Unknown audience')

  const { error } = await admin
    .from('library_item_links')
    .upsert(
      { item_id: itemId, url, access: link.access, audience: link.audience },
      { onConflict: 'item_id,access,audience' }
    )
  if (error) throw new Error(error.message)
  revalidate()
}

export async function removeMapLink(linkId: string): Promise<void> {
  const admin = await requireAdmin()
  const { error } = await admin.from('library_item_links').delete().eq('id', linkId)
  if (error) throw new Error(error.message)
  revalidate()
}

// ─── Course setups ───────────────────────────────────────────────────────────

/** The curriculum shelf's tags. A setup is a fixed shape imported from
    Classroom — its sections and the material in them are built elsewhere — so
    the only thing editable here is what it says about itself, which is what a
    course page matches on. Renaming it is allowed for the same reason: an
    imported class name ("Copy of Rope 2") is not a sentence anyone chose. */
export async function updateCourseSetup(
  id: string,
  patch: { name?: string; description?: string | null; courseType?: string | null; disciplines?: string[] }
) {
  const admin = await requireAdmin()

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || 'Untitled setup'
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.courseType !== undefined) update.course_type = patch.courseType || null
  if (patch.disciplines !== undefined) {
    update.disciplines = patch.disciplines.filter((d) => VALID_DISCIPLINES.has(d))
  }
  update.updated_at = new Date().toISOString()

  const { error } = await admin.from('course_templates').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}
