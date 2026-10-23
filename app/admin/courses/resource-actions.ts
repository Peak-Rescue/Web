'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { type LibraryAudience } from '@/lib/library'
import { regionLabel } from '@/lib/regions'
import { addPlaceContact } from '@/app/admin/sites/actions'
import { refuse, type ActionResult } from '@/lib/action-result'
import { classify, NEEDS_SORTING } from '@/lib/sorting'
import { bucketForKind, KINDS_OFF_BUCKET_SHELVES, type Venue } from '@/lib/library'
import { type SiteOption } from '@/app/admin/schedules/types'
import { type ClientSelectGroup } from '@/lib/clients'
import { courseCapabilityCategories, CAPABILITY_META, type CapabilityCategory } from '@/lib/capabilities'
import { withAncestors } from '@/lib/clients'

// Reference attached to a course, set alongside its location for the same
// reason maps are: a med plan belongs to a place, not to a course type. Two
// ways in — pick from the library's Resources shelf, or paste a one-off link.
// Visibility is per row, so a course can carry a student-facing med plan and
// an instructors-only annex without them being the same decision.

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
  matchedOn: 'client' | 'offering' | 'venue' | 'region' | 'discipline' | null
  /** The discipline it shares with the course, when that is why it is offered. */
  disciplineLabel: string | null
  alreadyAdded: boolean
  /** A plan for somewhere else. Loaded, because the query is one query, and
      dropped here rather than offered to every course in the company. */
  hidden?: boolean
  /** Filed under a place in the library. Decides which of the course's two
      sections offers it: venue material under Venue, the rest under
      Reference. */
  placed: boolean
}

// The Resources shelf, with the ones for this course's place floated to the
// top — the same venue-beats-region ranking the map picker uses, since the
// reason is identical: a document written for this venue outranks one written
// for the state it sits in.
export async function loadResourceLibrary(instanceId: string): Promise<ResourcePickerItem[]> {
  const { admin } = await requireTeam(instanceId)

  const [{ data: inst }, { data: rows }, { data: existing }, { data: clientTree }] = await Promise.all([
    admin.from('course_instances').select('location, region, venue_id, client_id, course_type, custom_categories').eq('id', instanceId).single(),
    admin
      .from('library_items')
      .select('id, title, url, kind, audience, region, venue_id, site_id, bucket, disciplines, course_types, client_id, venues(name)')
      // Reference, plus the plans a place has. A venue's evac plan is the
      // thing somebody goes looking for while building the course that goes
      // there, and it sits on the Documents shelf — so offering only the
      // Reference shelf here meant it could not be found from the course at
      // all. Filtered to this course's place below, like everything else.
      // Instructor material joins them for one type: a debrief is written
      // after a delivery and is worth exactly one thing, which is reaching
      // the next course that goes there. It comes with the place or not at
      // all, like the plans below — and it is instructors-only material, so
      // the audience ceiling keeps it off a student's page by itself.
      .in('bucket', ['resource', 'documents', 'instructor'])
      // A kit list is gear, and gear is its own section on the course. Its
      // bucket is a leftover, so it would otherwise be offered here as a
      // reference. See KINDS_OFF_BUCKET_SHELVES.
      .not('kind', 'in', `(${KINDS_OFF_BUCKET_SHELVES.join(',')})`)
      .eq('status', 'published')
      // Company paperwork is not course material, and a permit is admin-only
      // material that never reaches a course. See 235.
      .eq('admin_only', false)
      .order('title')
      .limit(300),
    admin.from('course_resources').select('library_item_id').eq('instance_id', instanceId),
    admin.from('clients').select('id, parent_id'),
  ])
  const courseClients = withAncestors(clientTree ?? [], inst?.client_id)

  const added = new Set((existing ?? []).map((r) => r.library_item_id).filter(Boolean))
  const loc = (inst?.location ?? '').toLowerCase().trim()
  const courseRegion = inst?.region ?? null
  const courseVenue = inst?.venue_id ?? null
  // Place is the strongest signal for a reference, but not the only one — a
  // rescue plan tagged canyon belongs on a canyon course wherever it runs, and
  // a course with no venue yet had nothing else to match on.
  const courseDisciplines = inst
    ? (courseCapabilityCategories(inst.course_type, inst.custom_categories) as string[])
    : []

  const mapped = (rows ?? []).map((r) => {
    const venueName = (r.venues as unknown as { name: string } | null)?.name ?? null
    const venueLower = (venueName ?? '').toLowerCase()
    const venueHit = courseVenue
      ? r.venue_id === courseVenue
      : Boolean(loc && venueLower && (loc.includes(venueLower) || venueLower.includes(loc)))
    const regionHit = Boolean(courseRegion && r.region && r.region === courseRegion)
    const shared = ((r.disciplines ?? []) as string[]).filter((d) => courseDisciplines.includes(d))
    // Everything on the Reference shelf is offerable; a Documents row is only
    // here because it is about where this course is, so it comes with the
    // place or not at all. Otherwise eight copies of "Company Evac Plans"
    // would be offered to every course ever built.
    // Everything on the Reference shelf is offerable anywhere; a Documents
    // row and a debrief are only here because of where this course is.
    const placeOnly = r.bucket === 'documents' || r.bucket === 'instructor'
    // Tied to one kind of course. The ACA swiftwater materials are for the
    // swiftwater courses and no other, so on anything else they are not a
    // weaker match — they are the wrong thing, and discipline alone would
    // offer them to all four canyon offerings. Null, the usual answer, means
    // it matches on discipline and place like everything else. See 242.
    // Whose it is. A client's patrol manual belongs to their courses and to
    // nobody else's — not ranked lower, absent: offering one client's
    // material on another client's course is the one filing mistake that is
    // somebody else's problem rather than ours. Material with no client is
    // ours and is offered anywhere, which is nearly all of it.
    // "That client" includes everything the course's client is filed under:
    // the 24 STS's material is Red Team's too, and a sector's is every
    // client's in it.
    const clientMiss = Boolean(r.client_id && !courseClients.has(r.client_id))
    const clientHit = Boolean(r.client_id && courseClients.has(r.client_id))
    const tied = (r.course_types ?? []) as string[]
    const offeringMiss = tied.length > 0 && !tied.includes(inst?.course_type ?? '')
    const offeringHit = tied.length > 0 && tied.includes(inst?.course_type ?? '')
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      kind: r.kind as string,
      audience: r.audience as LibraryAudience,
      venueName,
      regionLabel: regionLabel(r.region),
      suggested: clientHit || offeringHit || (placeOnly ? venueHit || regionHit : venueHit || regionHit || shared.length > 0),
      hidden: clientMiss || offeringMiss || (placeOnly && !venueHit && !regionHit),
      matchedOn: (clientHit ? 'client' : offeringHit ? 'offering' : venueHit ? 'venue' : regionHit ? 'region' : shared.length > 0 ? 'discipline' : null) as ResourcePickerItem['matchedOn'],
      disciplineLabel: shared.map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d).join(', ') || null,
      alreadyAdded: added.has(r.id),
      placed: Boolean(r.venue_id || r.site_id || r.region),
    }
  })
  return mapped.filter((r) => !r.hidden)
}

export async function addCourseResourcesFromLibrary(instanceId: string, itemIds: string[]) {
  const { user, admin } = await requireTeam(instanceId)
  if (itemIds.length === 0) return

  // A library item marked instructors-only cannot be published to students by
  // adding it to a course — the item's own audience is the ceiling.
  //
  // The same two shelves the picker reads. It offered the Documents ones —
  // a venue's med plan and evac plan — while this silently dropped them for
  // not being Reference, so the row you ticked was added to nothing and the
  // section came back exactly as it was.
  // Whose the course is, so another client's material cannot be added to it
  // by a search that went around the picker. The picker hides it; this is the
  // gate, and the two have to agree for the same reason the shelves do.
  const [{ data: inst }, { data: clientTree }] = await Promise.all([
    admin.from('course_instances').select('client_id').eq('id', instanceId).single(),
    admin.from('clients').select('id, parent_id'),
  ])
  const courseClients = withAncestors(clientTree ?? [], inst?.client_id)

  const { data: items } = await admin
    .from('library_items')
    .select('id, audience, client_id')
    .in('id', itemIds)
    .in('bucket', ['resource', 'documents', 'instructor'])
    .not('kind', 'in', `(${KINDS_OFF_BUCKET_SHELVES.join(',')})`)
    .eq('admin_only', false)

  let sort = await nextSort(admin, instanceId)
  const rows = (items ?? [])
    .filter((i) => !i.client_id || courseClients.has(i.client_id))
    .map((i) => ({
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
  toLibrary = false,
  /** What it is, when it is being filed. Answered on the dialog, because the
      person pasting the link is the only one who knows. */
  kind?: string,
  /** The rest of the filing — where it is about, whose it is, which
      offerings — answered on the same dialog by the library's own panel. */
  filing?: {
    kind?: string
    audience?: 'internal' | 'shared' | 'admin'
    place?: string
    disciplines?: string[]
    topics?: string
    note?: string
    clientId?: string | null
    courseTypes?: string[]
  }
): Promise<ActionResult> {
  const { user, admin } = await requireTeam(instanceId)
  const link = normalizeDocLink(url, label)

  // Pasting a document the shelf already holds used to go through quietly and
  // attach to the existing item, inheriting settings nobody chose on this
  // screen. Say so instead: the shelf copy is the one to use, and the picker
  // is where you use it.
  const { data: onShelf } = await admin
    .from('library_items')
    .select('id, title')
    .eq('bucket', 'resource')
    .eq('url', link.url)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()
  if (onShelf) {
    // Already here through the shelf? Then the picker is no help — it hides
    // what the course already has, so being sent there would be a search for
    // something deliberately not listed. The row is on the screen already.
    const { data: fromShelf } = await admin
      .from('course_resources')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('library_item_id', onShelf.id)
      .limit(1)
      .maybeSingle()
    // The item itself, not the shelf: the reason to go there is to change
    // that one row — give it a second link, correct its audience — and a
    // library filtered to three hundred documents is not that.
    const shelfLink = {
      href: `/admin/library?status=all&bucket=resource&q=${encodeURIComponent(onShelf.title)}`,
      label: 'Open it in the library',
    }
    if (fromShelf) {
      return refuse(`“${onShelf.title}” is already on this course, from the resource library.`, shelfLink)
    }
    return refuse(
      `“${onShelf.title}” is already in the resource library — add it with “Choose from resource library” so this course points at that copy.`,
      shelfLink
    )
  }

  // The same link twice on one course is a mistake, not a use case — the index
  // says so for library items, and this says so for pasted links.
  // Only pasted rows carry a url; one that came from the shelf is caught
  // above by its library item, which is where its link lives.
  const { data: onCourse } = await admin
    .from('course_resources')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('url', link.url)
    .limit(1)
    .maybeSingle()
  if (onCourse) return refuse('That document is already on this course.')

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
  // so the promotion reports itself rather than unwinding the add. The page
  // still has to be told about the document that did land, which is why the
  // refusal goes back after the revalidation rather than instead of it.
  const failed = toLibrary ? await promoteToLibrary(admin, instanceId, row.id, kind, filing) : null

  revalidate(instanceId)
  if (toLibrary) revalidatePath('/admin/library')
  if (failed) return failed
}

export async function setCourseResourceAudience(
  instanceId: string,
  resourceId: string,
  audience: LibraryAudience
): Promise<ActionResult> {
  const { admin } = await requireTeam(instanceId)

  if (audience === 'shared') {
    const { data: row } = await admin
      .from('course_resources')
      .select('library_items(audience)')
      .eq('id', resourceId)
      .eq('instance_id', instanceId)
      .single()
    const itemAudience = (row?.library_items as unknown as { audience: string } | null)?.audience
    if (itemAudience === 'internal') {
      return refuse(
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
export async function saveCourseResourceToLibrary(
  instanceId: string,
  resourceId: string
): Promise<ActionResult> {
  const { admin } = await requireAdmin()
  const failed = await promoteToLibrary(admin, instanceId, resourceId)
  if (failed) return failed
  revalidate(instanceId)
  revalidatePath('/admin/library')
}

// Returns a refusal rather than throwing one, so its callers can pass it on.
async function promoteToLibrary(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  resourceId: string,
  /** Said on the form. Beats the classifier, which is guessing from a pasted
      link and a typed label and would call a med plan a reference. */
  told?: string,
  filing?: {
    kind?: string
    audience?: 'internal' | 'shared' | 'admin'
    place?: string
    disciplines?: string[]
    topics?: string
    note?: string
    clientId?: string | null
    courseTypes?: string[]
  }
): Promise<{ error: string } | null> {
  const [{ data: row }, { data: inst }] = await Promise.all([
    admin
      .from('course_resources')
      .select('id, url, label, audience, library_item_id')
      .eq('id', resourceId)
      .eq('instance_id', instanceId)
      .single(),
    admin.from('course_instances').select('region, venue_id, course_type, custom_categories').eq('id', instanceId).single(),
  ])
  if (!row) return refuse('That document is no longer on this course')
  if (row.library_item_id) return refuse('That document is already in the library')
  if (!row.url) return refuse('That document has no link to save')

  const { data: existing } = await admin
    .from('library_items')
    .select('id, audience')
    .eq('bucket', 'resource')
    .eq('url', row.url)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  // Filed by what it is, not by the door it came through: something added on
  // a course because it was missing there is usually what the library was
  // missing too, and a permit pasted onto a course is a permit however it
  // arrived. Same classifier the sorting pass uses, so the two cannot disagree
  // about the same document.
  const title = row.label ?? 'Document'
  const verdict = told && told !== 'reference'
    ? { confident: true as const, kind: told, bucket: bucketForKind(told) ?? 'resource', reason: 'said on the form' }
    : classify({ title, url: row.url, kind: 'reference', bucket: 'resource', source_topic: null })

  let libraryItemId = existing?.id
  if (!libraryItemId) {
    const { data: created, error: createError } = await admin
      .from('library_items')
      .insert({
        title,
        url: row.url,
        source_type: 'link',
        // Filed by what it is, not by the door it came through. Something
        // added on a course because it was missing there is usually the thing
        // the library was missing too — and a permit pasted onto a course is a
        // permit, not a reference, however it arrived. Same classifier the
        // sorting pass uses, so the two cannot disagree.
        kind: verdict.confident ? verdict.kind ?? 'reference' : 'reference',
        bucket: verdict.confident ? verdict.bucket ?? 'resource' : 'resource',
        admin_only: verdict.confident ? verdict.adminOnly ?? false : false,
        audience: row.audience === 'shared' ? 'shared' : 'internal',
        region: inst?.region ?? null,
        venue_id: inst?.venue_id ?? null,
        // The course already says what kind of work this is, so the thing
        // arrives tagged rather than joining the 5 published items that are
        // tagged with nothing.
        disciplines: inst
          ? (courseCapabilityCategories(inst.course_type, inst.custom_categories) as string[])
          : [],
        // Not obvious from a pasted link and a typed label, which most are: it
        // lands on the shelf it came through, wearing the tag that says
        // somebody should look. The same pile the sorting pass leaves.
        topics: verdict.confident ? [] : [NEEDS_SORTING],
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

  // What the panel said, applied to the row that was just made. Only for a
  // new one: attaching to a shelf copy somebody else filed must not rewrite
  // their filing from this screen.
  if (filing && !existing?.id && libraryItemId) {
    const { applyChoices } = await import('@/lib/library-file')
    await applyChoices(admin, libraryItemId, {
      kind: filing.kind,
      audience: filing.audience,
      place: filing.place,
      disciplines: filing.disciplines,
      topics: filing.topics,
      clientId: filing.clientId,
      courseTypes: filing.courseTypes,
      note: filing.note,
    })
  }

  const { error } = await admin
    .from('course_resources')
    .update({ library_item_id: libraryItemId, url: null, label: null, ...clamped })
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  return null
}

export async function renameCourseResource(instanceId: string, resourceId: string, label: string) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin
    .from('course_resources')
    .update({ label: label.trim().slice(0, 200) || null })
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

export async function removeCourseResource(instanceId: string, resourceId: string) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin
    .from('course_resources')
    .delete()
    .eq('id', resourceId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

/** The contacts the course's place already knows about — its venue's, and its
 *  state's — offered for the Details form to drop in.
 *
 *  Copied rather than pointed at, unlike beta and weather. The ranger district
 *  belongs to Zion, but the person a given course actually deals with is often
 *  a name for that week, and editing it should not rewrite Zion for everyone.
 *  So the place is the starting point and the course owns what it takes.
 */
export async function placeContactsFor(instanceId: string): Promise<
  { from: string; name: string; phones: string[]; emails: string[] }[]
> {
  const { admin } = await requireTeam(instanceId)
  const { data: inst } = await admin
    .from('course_instances')
    .select('venue_id, region')
    .eq('id', instanceId)
    .single()
  if (!inst) return []

  const [{ data: venue }, { data: regions }] = await Promise.all([
    inst.venue_id
      ? admin.from('venues').select('name, region_code, contacts').eq('id', inst.venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('region_info').select('region_code, contacts'),
  ])

  // Read upward, the way the day reads its weather: the venue, then the state
  // the venue is in — falling back to the course's own region when it has no
  // venue, which is most of them.
  const code = venue?.region_code ?? inst.region ?? null
  const region = ((regions ?? []) as { region_code: string; contacts: unknown[] }[])
    .find((r) => r.region_code === code)

  type PlaceContact = { name?: string; role?: string; phone?: string; email?: string }
  const take = (rows: unknown[] | null | undefined, from: string) =>
    ((rows ?? []) as PlaceContact[])
      .filter((c) => c.name)
      .map((c) => ({
        from,
        // The role is kept in the name, because a course contact has nowhere
        // else to put it and "Ranger district" alone does not say what for.
        name: c.role ? `${c.name} (${c.role})` : String(c.name),
        phones: c.phone ? [c.phone] : [],
        emails: c.email ? [c.email] : [],
      }))

  return [
    ...take(venue?.contacts as unknown[], venue?.name ?? 'this venue'),
    ...take(region?.contacts, regionLabel(code) || 'the state'),
  ]
}

export type ContactShelf = 'client' | 'venue' | 'region'

// The places a course's contact can be filed with, read off the course as
// saved: its venue, and the state (from the venue, else the course's own).
async function contactShelves(instanceId: string) {
  const { admin } = await requireTeam(instanceId)
  const { data: inst } = await admin
    .from('course_instances')
    .select('venue_id, region, client_id, venues(name, region_code), clients(id, name)')
    .eq('id', instanceId)
    .single()
  const venue = inst?.venues as unknown as { name?: string; region_code?: string | null } | null
  const client = inst?.clients as unknown as { id: string; name: string } | null
  const regionCode = (venue?.region_code ?? inst?.region ?? null) as string | null
  return {
    admin,
    // The client first: a course's points of contact are the client's
    // people, and filing the sergeant who books the slot under the canyon he
    // asked about is filing him under the wrong noun.
    client: client ? { id: client.id, label: client.name } : null,
    venue: inst?.venue_id ? { id: inst.venue_id as string, label: venue?.name ?? 'The venue' } : null,
    region: regionCode ? { code: regionCode, label: regionLabel(regionCode) || regionCode } : null,
  }
}

/** Where the filing form can put a contact, best first: a ranger district or
 *  a landowner is usually about the venue, so that leads when there is one. */
export async function contactFilingShelves(
  instanceId: string
): Promise<{ shelf: ContactShelf; label: string }[]> {
  const { client, venue, region } = await contactShelves(instanceId)
  return [
    ...(client ? [{ shelf: 'client' as const, label: client.label }] : []),
    ...(venue ? [{ shelf: 'venue' as const, label: venue.label }] : []),
    ...(region ? [{ shelf: 'region' as const, label: region.label }] : []),
  ]
}

/** Files a contact typed on a course with a place: the venue or the state, as
 *  the person filing chose. The course keeps its own copy — this only adds
 *  them to the list the next course there is offered. The places are resolved
 *  here from the course, never taken from the browser, and addPlaceContact is
 *  admin only, as on the places page, because that list is shared by every
 *  course that goes there. Returns where it went, so the row can say so. */
export async function fileContactToPlace(
  instanceId: string,
  shelf: ContactShelf,
  contact: { name: string; role?: string; phone?: string; email?: string; note?: string }
): Promise<{ error: string } | { filedWith: string }> {
  const { admin, client, venue, region } = await contactShelves(instanceId)
  const name = contact.name.trim()
  if (!name) return { error: 'A contact needs a name.' }

  // The client keeps its own people (266). Same question, a different noun
  // underneath — which is why it is the same control and the same verb.
  if (shelf === 'client') {
    if (!client) return { error: 'Say which client this course is for first.' }
    const { data: held } = await admin.from('clients').select('contacts').eq('id', client.id).maybeSingle()
    const have = (held?.contacts ?? []) as { name?: string }[]
    if (have.some((c) => c.name?.trim().toLowerCase() === name.toLowerCase())) {
      return { filedWith: client.label }
    }
    const row = {
      name: name.slice(0, 120),
      role: contact.role?.trim().slice(0, 80) || undefined,
      phone: contact.phone?.trim().slice(0, 40) || undefined,
      email: contact.email?.trim().slice(0, 120) || undefined,
      note: contact.note?.trim().slice(0, 300) || undefined,
    }
    const { error } = await admin
      .from('clients')
      .update({ contacts: [...have, row].slice(0, 24) })
      .eq('id', client.id)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/clients')
    return { filedWith: client.label }
  }

  const target = shelf === 'venue' ? venue : region
  if (!target) return { error: 'Say where the course is first, so there is a place to file them with.' }
  const scope = shelf === 'venue' ? { venueId: venue!.id } : { regionCode: region!.code }

  // Already on file there — most often picked from that list and then given a
  // new number. Saying so beats a second copy of the person.
  const { data: held } = 'venueId' in scope
    ? await admin.from('venues').select('contacts').eq('id', scope.venueId).maybeSingle()
    : await admin.from('region_info').select('contacts').eq('region_code', scope.regionCode).maybeSingle()
  const key = name.toLowerCase()
  if (((held?.contacts ?? []) as { name?: string }[]).some((c) => c.name?.trim().toLowerCase() === key)) {
    return { filedWith: target.label }
  }

  const refused = await addPlaceContact(scope, { ...contact, name })
  if (refused) return refused
  return { filedWith: target.label }
}

// Uploading a document onto a course, and keeping it.
//
// The course could take a link and the library could take a file, but the
// course could not take a file: the only way to get a PDF of a MEDEVAC plan
// onto a course was to put it in Drive first and paste the link. Which is a
// second place for it to live, and the thing the library's own file rows were
// built to stop.
const RESOURCE_BUCKET = 'task-documents'
const MAX_RESOURCE_BYTES = 20 * 1024 * 1024

export async function createResourceUploadTargets(
  instanceId: string,
  files: { name: string; size: number }[]
): Promise<{ targets: { path: string; token: string }[] } | { error: string }> {
  const { admin } = await requireTeam(instanceId)
  const { randomUUID } = await import('crypto')

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_RESOURCE_BYTES) return refuse(`“${file.name}” is over the 20 MB limit`)
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `courses/${instanceId}/resources/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(RESOURCE_BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return { targets }
}

/** Filed and attached in one go: the library row is made first, and the
    course points at it. A file added this way is on the shelf by the time it
    is on the course, which is the difference between this and pasting a
    link nobody else will ever find. */
export async function finalizeResourceUploads(
  instanceId: string,
  uploads: { path: string; filename: string }[],
  kind: string,
  audience: 'internal' | 'shared'
): Promise<ActionResult> {
  const { user, admin } = await requireTeam(instanceId)
  if (uploads.length === 0) return

  const { fileToLibrary } = await import('@/lib/library-file')
  let sort = await nextSort(admin, instanceId)
  for (const u of uploads) {
    const r = await fileToLibrary(admin, {
      path: u.path,
      filename: u.filename,
      instanceId,
      told: kind,
      audience,
    })
    if ('error' in r) return r
    const { error } = await admin.from('course_resources').insert({
      instance_id: instanceId,
      library_item_id: r.id,
      audience,
      sort_order: sort++,
      added_by: user.id,
    })
    if (error) throw new Error(error.message)
  }
  revalidate(instanceId)
  revalidatePath('/admin/library')
}

/** What the filing panel needs to ask its questions, fetched when somebody
    ticks "add to the library" rather than loaded onto every course page for
    the one time in ten it is wanted. */
export async function libraryFilingOptions(): Promise<{
  venues: Venue[]
  sites: SiteOption[]
  clients: ClientSelectGroup[]
}> {
  const { admin } = await requireAdmin()
  const { CLIENT_COLUMNS, clientSelectGroups } = await import('@/lib/clients')
  const [{ data: venueRows }, { data: siteRows }, { data: clientRows }] = await Promise.all([
    admin.from('venues').select('id, name, region, region_code, client_name, notes, links, contacts, active').order('name'),
    admin.from('sites').select('id, name, kind, beta, venue_id, venues(name)').eq('active', true).order('name'),
    admin.from('clients').select(CLIENT_COLUMNS).order('name'),
  ])
  type ClientRow = Parameters<typeof clientSelectGroups>[0][number]
  return {
    venues: (venueRows ?? []) as Venue[],
    sites: ((siteRows ?? []) as unknown as {
      id: string; name: string; kind: string | null; beta: string | null; venue_id: string | null; venues: { name: string } | null
    }[]).map((s) => ({ id: s.id, name: s.name, kind: s.kind, beta: s.beta, venue_id: s.venue_id, venue_name: s.venues?.name ?? null })),
    // Grouped by sector, the way the library's own Client field reads it.
    clients: clientSelectGroups((clientRows ?? []) as ClientRow[]),
  }
}
