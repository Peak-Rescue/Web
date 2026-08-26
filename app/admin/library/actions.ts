'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIBRARY_KINDS, BUCKET_ORDER } from '@/lib/library'
import { isValidRegion } from '@/lib/regions'
import { CAPABILITY_ORDER } from '@/lib/capabilities'

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

export async function deleteLibraryItem(id: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('library_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
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
  const { error } = await admin.from('venues').insert({
    name: name.slice(0, 120),
    region: ((formData.get('region') as string) || '').trim() || null,
    region_code: isValidRegion(formData.get('region_code') as string) ? (formData.get('region_code') as string) : null,
    client_name: ((formData.get('client_name') as string) || '').trim() || null,
    notes: ((formData.get('notes') as string) || '').trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidate()
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
