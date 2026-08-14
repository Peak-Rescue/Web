'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { type LibraryAudience } from '@/lib/library'
import { regionLabel } from '@/lib/regions'

// Reference attached to a course, set alongside its location for the same
// reason maps are: a med plan belongs to a place, not to a course type. Two
// ways in — pick from the library's Resources shelf, or paste a one-off link.
// Visibility is per row, so a course can carry a student-facing med plan and
// an instructors-only annex without them being the same decision.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return { user, admin }
}

function revalidate(instanceId: string) {
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

async function nextSort(admin: ReturnType<typeof createAdminClient>, instanceId: string) {
  const { data } = await admin
    .from('course_resources')
    .select('sort_order')
    .eq('instance_id', instanceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.sort_order ?? -1) + 1
}

export type ResourcePickerItem = {
  id: string
  title: string
  url: string | null
  kind: string
  audience: LibraryAudience
  venueName: string | null
  regionLabel: string | null
  suggested: boolean
  matchedOn: 'venue' | 'region' | null
  alreadyAdded: boolean
}

// The Resources shelf, with the ones for this course's place floated to the
// top — the same venue-beats-region ranking the map picker uses, since the
// reason is identical: a document written for this venue outranks one written
// for the state it sits in.
export async function loadResourceLibrary(instanceId: string): Promise<ResourcePickerItem[]> {
  const { admin } = await requireAdmin()

  const [{ data: inst }, { data: rows }, { data: existing }] = await Promise.all([
    admin.from('course_instances').select('location, region, venue_id').eq('id', instanceId).single(),
    admin
      .from('library_items')
      .select('id, title, url, kind, audience, region, venue_id, venues(name)')
      .eq('bucket', 'resource')
      .eq('status', 'published')
      .order('title')
      .limit(300),
    admin.from('course_resources').select('library_item_id').eq('instance_id', instanceId),
  ])

  const added = new Set((existing ?? []).map((r) => r.library_item_id).filter(Boolean))
  const loc = (inst?.location ?? '').toLowerCase().trim()
  const courseRegion = inst?.region ?? null
  const courseVenue = inst?.venue_id ?? null

  return (rows ?? []).map((r) => {
    const venueName = (r.venues as unknown as { name: string } | null)?.name ?? null
    const venueLower = (venueName ?? '').toLowerCase()
    const venueHit = courseVenue
      ? r.venue_id === courseVenue
      : Boolean(loc && venueLower && (loc.includes(venueLower) || venueLower.includes(loc)))
    const regionHit = Boolean(courseRegion && r.region && r.region === courseRegion)
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      kind: r.kind as string,
      audience: r.audience as LibraryAudience,
      venueName,
      regionLabel: regionLabel(r.region),
      suggested: venueHit || regionHit,
      matchedOn: venueHit ? 'venue' : regionHit ? 'region' : null,
      alreadyAdded: added.has(r.id),
    }
  })
}

export async function addCourseResourcesFromLibrary(instanceId: string, itemIds: string[]) {
  const { user, admin } = await requireAdmin()
  if (itemIds.length === 0) return

  // A library item marked instructors-only cannot be published to students by
  // adding it to a course — the item's own audience is the ceiling.
  const { data: items } = await admin
    .from('library_items')
    .select('id, audience')
    .in('id', itemIds)
    .eq('bucket', 'resource')

  let sort = await nextSort(admin, instanceId)
  const rows = (items ?? []).map((i) => ({
    instance_id: instanceId,
    library_item_id: i.id,
    audience: i.audience === 'shared' ? 'shared' : 'internal',
    sort_order: sort++,
    added_by: user.id,
  }))
  if (rows.length === 0) return

  const { error } = await admin.from('course_resources').upsert(rows, {
    onConflict: 'instance_id,library_item_id',
    ignoreDuplicates: true,
  })
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

// `toLibrary` is the checkbox in the add dialog: file it against this course's
// place in the same breath as naming it, rather than adding it here and
// remembering to promote it afterwards.
export async function addCourseResourceLink(
  instanceId: string,
  url: string,
  label: string,
  audience: LibraryAudience = 'internal',
  toLibrary = false
) {
  const { user, admin } = await requireAdmin()
  const link = normalizeDocLink(url, label)
  const sort = await nextSort(admin, instanceId)
  const { data: row, error } = await admin
    .from('course_resources')
    .insert({
      instance_id: instanceId,
      url: link.url,
      label: link.filename,
      // Asked in the dialog, and defaulting to instructors-only: a library item
      // inherits this and then caps the course row, so a wrong guess here is a
      // document you cannot share afterwards.
      audience: audience === 'shared' ? 'shared' : 'internal',
      sort_order: sort,
      added_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // The link is on the course either way — a library failure must not lose it,
  // so the promotion reports itself rather than unwinding the add.
  if (toLibrary) await promoteToLibrary(admin, instanceId, row.id)

  revalidate(instanceId)
  if (toLibrary) revalidatePath('/admin/library')
}

export async function setCourseResourceAudience(
  instanceId: string,
  resourceId: string,
  audience: LibraryAudience
) {
  const { admin } = await requireAdmin()

  if (audience === 'shared') {
    const { data: row } = await admin
      .from('course_resources')
      .select('library_items(audience)')
      .eq('id', resourceId)
      .eq('instance_id', instanceId)
      .single()
    const itemAudience = (row?.library_items as unknown as { audience: string } | null)?.audience
    if (itemAudience === 'internal') {
      throw new Error(
        'This document is marked instructors-only in the library — change it there first.'
      )
    }
  }

  const { error } = await admin
    .from('course_resources')
    .update({ audience })
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

// Promote a one-off link onto the Resources shelf so the next course in the
// same place finds it. The course keeps its row — it stops owning the link and
// starts pointing at the library item, so fixing the document later fixes it
// everywhere. Region and venue come from this course, which is what makes it
// findable for the next delivery here and invisible to one somewhere else.
export async function saveCourseResourceToLibrary(instanceId: string, resourceId: string) {
  const { admin } = await requireAdmin()
  await promoteToLibrary(admin, instanceId, resourceId)
  revalidate(instanceId)
  revalidatePath('/admin/library')
}

async function promoteToLibrary(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  resourceId: string
) {
  const [{ data: row }, { data: inst }] = await Promise.all([
    admin
      .from('course_resources')
      .select('id, url, label, audience, library_item_id')
      .eq('id', resourceId)
      .eq('instance_id', instanceId)
      .single(),
    admin.from('course_instances').select('region, venue_id').eq('id', instanceId).single(),
  ])
  if (!row) throw new Error('That document is no longer on this course')
  if (row.library_item_id) throw new Error('That document is already in the library')
  if (!row.url) throw new Error('That document has no link to save')

  const { data: existing } = await admin
    .from('library_items')
    .select('id, audience')
    .eq('bucket', 'resource')
    .eq('url', row.url)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  let libraryItemId = existing?.id
  if (!libraryItemId) {
    const { data: created, error: createError } = await admin
      .from('library_items')
      .insert({
        title: row.label ?? 'Document',
        url: row.url,
        source_type: 'link',
        kind: 'reference',
        bucket: 'resource',
        audience: row.audience === 'shared' ? 'shared' : 'internal',
        region: inst?.region ?? null,
        venue_id: inst?.venue_id ?? null,
        disciplines: [],
        topics: [],
        status: 'published',
      })
      .select('id')
      .single()
    if (createError) throw new Error(createError.message)
    libraryItemId = created.id
  }

  // Attaching to an item that already exists brings its ceiling with it. Left
  // alone, a row saying 'shared' would keep pointing at an instructors-only
  // document — the pills claiming students while the library says otherwise,
  // and the portal believing the pills. The item wins; the row comes down with
  // it, and the locked row explains itself on a link to where it is changed.
  const clamped = existing?.audience === 'internal' ? { audience: 'internal' } : {}

  const { error } = await admin
    .from('course_resources')
    .update({ library_item_id: libraryItemId, url: null, label: null, ...clamped })
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
}

export async function renameCourseResource(instanceId: string, resourceId: string, label: string) {
  const { admin } = await requireAdmin()
  const { error } = await admin
    .from('course_resources')
    .update({ label: label.trim().slice(0, 200) || null })
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

export async function removeCourseResource(instanceId: string, resourceId: string) {
  const { admin } = await requireAdmin()
  const { error } = await admin
    .from('course_resources')
    .delete()
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}
