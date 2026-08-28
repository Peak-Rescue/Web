'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { type LibraryAudience } from '@/lib/library'
import { regionLabel } from '@/lib/regions'
import { refuse, type ActionResult } from '@/lib/action-result'

// Maps attached to a course, set alongside its location. Two ways in: pick a
// map from the library's Maps bucket (the reusable venue map, with its
// internal edit twin), or paste a one-off link for this delivery. Visibility
// is per-row so the same course can carry a student-facing overview map and
// an instructor-only evacuation map.

async function requireTeam(instanceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') return { user, admin }

  // The people running the course keep its material: a map found the night
  // before, the client's permit, a photo of the gate. Same rule the one-off
  // links have used since they were added — an instructor assigned to this
  // course, and nobody else.
  const { data: assigned } = await admin
    .from('instance_instructors')
    .select('id, instructors!inner(profile_id)')
    .eq('instance_id', instanceId)
    .eq('instructors.profile_id', user.id)
    .maybeSingle()
  if (!assigned) throw new Error('Not authorized')
  return { user, admin }
}

// Writing to the shared library is a different act: it reaches every course
// that pulls from it afterwards, which is not a blast radius that comes with a
// course assignment.
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
    .from('course_maps')
    .select('sort_order')
    .eq('instance_id', instanceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.sort_order ?? -1) + 1
}

export type MapPickerItem = {
  id: string
  title: string
  url: string | null
  audience: LibraryAudience
  venueName: string | null
  regionLabel: string | null
  suggested: boolean
  matchedOn: 'venue' | 'region' | null
  alreadyAdded: boolean
}

// The Maps library, with the maps for this course's place floated to the top.
// Region is the reliable signal — an exact code match, unaffected by how the
// location was typed. A venue-name hit still outranks it, since a map for this
// specific venue beats a state-wide one.
export async function loadMapLibrary(instanceId: string): Promise<MapPickerItem[]> {
  const { admin } = await requireTeam(instanceId)

  const [{ data: inst }, { data: rows }, { data: existing }] = await Promise.all([
    admin.from('course_instances').select('location, region, venue_id').eq('id', instanceId).single(),
    admin
      .from('library_items')
      .select('id, title, url, audience, region, venue_id, venues(name)')
      .eq('bucket', 'map')
      .neq('status', 'archived')
      .order('title')
      .limit(300),
    admin.from('course_maps').select('library_item_id').eq('instance_id', instanceId),
  ])

  const added = new Set((existing ?? []).map((r) => r.library_item_id).filter(Boolean))
  const loc = (inst?.location ?? '').toLowerCase().trim()
  const courseRegion = inst?.region ?? null
  const courseVenue = inst?.venue_id ?? null

  return (rows ?? []).map((r) => {
    const venueName = (r.venues as unknown as { name: string } | null)?.name ?? null
    const venueLower = (venueName ?? '').toLowerCase()
    // Venue set on the course → exact match. Otherwise fall back to the old
    // name compare so courses not yet given a venue still get suggestions.
    const venueHit = courseVenue
      ? r.venue_id === courseVenue
      : Boolean(loc && venueLower && (loc.includes(venueLower) || venueLower.includes(loc)))
    const regionHit = Boolean(courseRegion && r.region && r.region === courseRegion)
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      audience: r.audience as LibraryAudience,
      venueName,
      regionLabel: regionLabel(r.region),
      suggested: venueHit || regionHit,
      matchedOn: venueHit ? 'venue' : regionHit ? 'region' : null,
      alreadyAdded: added.has(r.id),
    }
  })
}

export async function addCourseMapsFromLibrary(instanceId: string, itemIds: string[]) {
  const { user, admin } = await requireTeam(instanceId)
  if (itemIds.length === 0) return

  // A library map marked instructors-only cannot be published to students by
  // adding it to a course — the item's own audience is the ceiling.
  const { data: items } = await admin
    .from('library_items')
    .select('id, audience')
    .in('id', itemIds)
    .eq('bucket', 'map')

  let sort = await nextSort(admin, instanceId)
  const rows = (items ?? []).map((i) => ({
    instance_id: instanceId,
    library_item_id: i.id,
    audience: i.audience === 'shared' ? 'shared' : 'internal',
    sort_order: sort++,
    added_by: user.id,
  }))
  if (rows.length === 0) return

  // Re-adding a map already on the course is a no-op, not an error.
  const { error } = await admin.from('course_maps').upsert(rows, {
    onConflict: 'instance_id,library_item_id',
    ignoreDuplicates: true,
  })
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

// `toLibrary` is the checkbox in the add dialog: file it against this course's
// place in the same breath as naming it, rather than adding it here and
// remembering to promote it afterwards.
export async function addCourseMapLink(
  instanceId: string,
  url: string,
  label: string,
  audience: LibraryAudience = 'internal',
  toLibrary = false
): Promise<ActionResult> {
  const { user, admin } = await requireTeam(instanceId)
  const link = normalizeDocLink(url, label)

  // Pasting a map the shelf already holds used to go through quietly and
  // attach to the existing item, inheriting settings nobody chose on this
  // screen. Say so instead: the shelf copy is the one to use, and the picker
  // is where you use it.
  const { data: onShelf } = await admin
    .from('library_items')
    .select('id, title')
    .eq('bucket', 'map')
    .eq('url', link.url)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()
  if (onShelf) {
    // Already here through the shelf? Then the picker is no help — it hides
    // what the course already has, so being sent there would be a search for
    // something deliberately not listed. The row is on the screen already.
    const { data: fromShelf } = await admin
      .from('course_maps')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('library_item_id', onShelf.id)
      .limit(1)
      .maybeSingle()
    // The item itself, not the shelf: the reason to go there is to change
    // that one row — give it a second link, correct its audience — and a
    // library filtered to three hundred documents is not that.
    const shelfLink = {
      href: `/admin/library?status=all&bucket=map&q=${encodeURIComponent(onShelf.title)}`,
      label: 'Open it in the library',
    }
    if (fromShelf) {
      return refuse(`“${onShelf.title}” is already on this course, from the map library.`, shelfLink)
    }
    return refuse(
      `“${onShelf.title}” is already in the map library — add it with “Choose from map library” so this course points at that copy.`,
      shelfLink
    )
  }

  // The same link twice on one course is a mistake, not a use case.
  // Only pasted rows carry a url; one that came from the shelf is caught
  // above by its library item, which is where its link lives.
  const { data: onCourse } = await admin
    .from('course_maps')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('url', link.url)
    .limit(1)
    .maybeSingle()
  if (onCourse) return refuse('That map is already on this course.')

  const sort = await nextSort(admin, instanceId)
  const { data: row, error } = await admin
    .from('course_maps')
    .insert({
      instance_id: instanceId,
      url: link.url,
      label: link.filename,
      // Asked in the dialog, and defaulting to instructors-only: a library item
      // inherits this and then caps the course row, so a wrong guess here is a
      // map you cannot share afterwards.
      audience: audience === 'shared' ? 'shared' : 'internal',
      sort_order: sort,
      added_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // The map is on the course either way — a library failure must not lose it,
  // so the promotion reports itself rather than unwinding the add. The page
  // still has to be told about the map that did land, which is why the
  // refusal goes back after the revalidation rather than instead of it.
  const failed = toLibrary ? await promoteToLibrary(admin, instanceId, row.id) : null

  revalidate(instanceId)
  if (toLibrary) revalidatePath('/admin/library')
  if (failed) return failed
}

export async function setCourseMapAudience(
  instanceId: string,
  mapId: string,
  audience: LibraryAudience
): Promise<ActionResult> {
  const { admin } = await requireTeam(instanceId)

  // The library's answer is the default, and a course may overrule it for one
  // delivery. What used to happen instead was a refusal — "change it in the
  // library first" — which is the wrong place to change it when the reason is
  // this course: doing so would have shared the map with every other course
  // using it, to fix one.
  //
  // So the ceiling is gone and the disagreement is recorded instead. Setting
  // an audience that matches the library goes back to following it, rather
  // than freezing today's answer as an override that stops tracking.
  const { data: row } = await admin
    .from('course_maps')
    .select('library_items(audience)')
    .eq('id', mapId)
    .eq('instance_id', instanceId)
    .single()
  const libraryAudience = (row?.library_items as unknown as { audience: string } | null)?.audience

  const { error } = await admin
    .from('course_maps')
    .update({
      audience,
      audience_overridden: libraryAudience !== undefined && libraryAudience !== audience,
    })
    .eq('id', mapId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

/** Stop overruling the library for this course and follow it again. */
export async function followLibraryMapAudience(
  instanceId: string,
  mapId: string
): Promise<ActionResult> {
  const { admin } = await requireTeam(instanceId)
  const { data: row } = await admin
    .from('course_maps')
    .select('library_items(audience)')
    .eq('id', mapId)
    .eq('instance_id', instanceId)
    .single()
  const libraryAudience = (row?.library_items as unknown as { audience: string } | null)?.audience
  if (!libraryAudience) {
    return refuse('This map has no library entry to follow — its audience is set here.')
  }

  const { error } = await admin
    .from('course_maps')
    .update({ audience: libraryAudience, audience_overridden: false })
    .eq('id', mapId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

// Promote a one-off link into the map library so the next course in the same
// place finds it. The course keeps the same row — it just stops owning the
// link and starts pointing at the library item, so fixing the map later fixes
// it everywhere.
export async function saveCourseMapToLibrary(instanceId: string, mapId: string): Promise<ActionResult> {
  const { admin } = await requireAdmin()
  const failed = await promoteToLibrary(admin, instanceId, mapId)
  if (failed) return failed
  revalidate(instanceId)
  revalidatePath('/admin/library')
}

// Returns a refusal rather than throwing one, so its callers can pass it on.
async function promoteToLibrary(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  mapId: string
): Promise<{ error: string } | null> {
  const [{ data: row }, { data: inst }] = await Promise.all([
    admin.from('course_maps').select('id, url, label, audience, library_item_id').eq('id', mapId).eq('instance_id', instanceId).single(),
    admin.from('course_instances').select('region, venue_id').eq('id', instanceId).single(),
  ])
  if (!row) return refuse('That map is no longer on this course')
  if (row.library_item_id) return refuse('That map is already in the library')
  if (!row.url) return refuse('That map has no link to save')

  // Same link already in the map library? Point at it instead of making a
  // second copy that would then drift from the first.
  const { data: existing } = await admin
    .from('library_items')
    .select('id, audience')
    .eq('bucket', 'map')
    .eq('url', row.url)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  let libraryItemId = existing?.id
  if (!libraryItemId) {
    const { data: created, error: createError } = await admin
      .from('library_items')
      .insert({
        title: row.label ?? 'Map',
        url: row.url,
        source_type: 'link',
        kind: 'map',
        bucket: 'map',
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

  // The row is either a library item or a link, never both — hand over the
  // link as the item id goes on.
  //
  // Attaching to an item that already exists brings its ceiling with it: a row
  // left saying 'shared' would point at an instructors-only map, with the
  // pills claiming students and the portal believing them. The item wins.
  const clamped = existing?.audience === 'internal' ? { audience: 'internal' } : {}

  const { error } = await admin
    .from('course_maps')
    .update({ library_item_id: libraryItemId, url: null, label: null, ...clamped })
    .eq('id', mapId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  return null
}

export async function renameCourseMap(instanceId: string, mapId: string, label: string) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin
    .from('course_maps')
    .update({ label: label.trim().slice(0, 200) || null })
    .eq('id', mapId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

export async function removeCourseMap(instanceId: string, mapId: string) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin.from('course_maps').delete().eq('id', mapId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}
