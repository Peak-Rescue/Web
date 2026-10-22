'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIBRARY_KINDS, BUCKET_ORDER, bucketForKind } from '@/lib/library'
import { isValidRegion } from '@/lib/regions'
import { CAPABILITY_ORDER } from '@/lib/capabilities'
import { refuse, type ActionRefusal, type ActionResult } from '@/lib/action-result'

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

/** Looking at something is what sorting it means, so saying anything about
    where it belongs takes the mark off. Nobody has to remember to delete a
    word the software put in their tag box. */
async function clearSortingMark(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  if (ids.length === 0) return
  await admin.rpc('clear_sorting_mark', { ids })
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
  admin_only?: boolean
  disciplines?: string[]
  topicsRaw?: string
  /** `venue:<id>` or `site:<id>`. The venue is derived when a site is named,
      so the two levels cannot contradict each other. */
  place?: string
  venue_id?: string | null
  expires_at?: string | null
  status?: 'pending' | 'published' | 'archived'
  bucket?: string | null
  course_types?: string[]
  clientId?: string | null
  region?: string | null
}

export async function updateLibraryItem(id: string, patch: LibraryPatch) {
  const admin = await requireAdmin()

  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 200) || 'Untitled'
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.url !== undefined) update.url = patch.url?.trim() || null
  if (patch.clientId !== undefined) update.client_id = patch.clientId
  if (patch.edit_url !== undefined) update.edit_url = patch.edit_url?.trim() || null
  if (patch.kind !== undefined && VALID_KINDS.has(patch.kind)) update.kind = patch.kind
  if (patch.audience !== undefined) update.audience = patch.audience
  // Never shared and admin-only at once: the flag adds a restriction on top of
  // the ladder, so the rung underneath it has to be the restrictive one or the
  // two disagree about the same row.
  if (patch.admin_only !== undefined) {
    update.admin_only = patch.admin_only
    if (patch.admin_only) update.audience = 'internal'
  }
  if (patch.disciplines !== undefined) {
    update.disciplines = patch.disciplines.filter((d) => VALID_DISCIPLINES.has(d))
  }
  if (patch.topicsRaw !== undefined) update.topics = cleanTags(patch.topicsRaw)
  if (patch.place !== undefined) {
    const place = await resolvePlace(admin, patch.place)
    update.venue_id = place.venue_id
    update.site_id = place.site_id
    update.region = place.region
  } else if (patch.venue_id !== undefined) {
    update.venue_id = patch.venue_id || null
  }
  if (patch.bucket !== undefined && patch.bucket !== null && VALID_BUCKETS.has(patch.bucket)) update.bucket = patch.bucket
  if (patch.region !== undefined) update.region = isValidRegion(patch.region) ? patch.region : null
  if (patch.expires_at !== undefined) update.expires_at = patch.expires_at || null
  // An empty list is "any offering its discipline matches", which is what
  // nearly everything is.
  if (patch.course_types !== undefined) update.course_types = patch.course_types
  if (patch.status !== undefined) {
    update.status = patch.status
    if (patch.status === 'published') update.reviewed_at = new Date().toISOString()
  }
  update.updated_at = new Date().toISOString()

  const { error } = await admin.from('library_items').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  // Saying what it is, where it goes or where it is counts as having looked at
  // it. Renaming alone does not — a better title is not a filing decision.
  const classified = ['kind', 'bucket', 'place', 'venue_id', 'admin_only']
    .some((f) => (patch as Record<string, unknown>)[f] !== undefined)
  if (classified) await clearSortingMark(admin, [id])
  revalidate()
}

/** `venue:<id>` or `site:<id>` from a PlaceSelect, resolved to the pair stored
    on the row. A site answers for its venue too — the matching that offers a
    map to a course reads the venue, and nothing should have to know whether
    the filing happened to be precise. */
async function resolvePlace(
  admin: ReturnType<typeof createAdminClient>,
  raw: string
): Promise<{ venue_id: string | null; site_id: string | null; region: string | null }> {
  const i = raw.indexOf(':')
  const level = i === -1 ? '' : raw.slice(0, i)
  const id = i === -1 ? '' : raw.slice(i + 1)
  if (!id) return { venue_id: null, site_id: null, region: null }

  // A state or a country on its own is a real answer — a map of Washington is
  // a map of Washington — so it is stored as the region with no venue under
  // it, rather than being refused for not naming somewhere smaller.
  if (level === 'region') {
    return { venue_id: null, site_id: null, region: isValidRegion(id) ? id : null }
  }

  if (level === 'venue') {
    const { data } = await admin.from('venues').select('region_code').eq('id', id).maybeSingle()
    return { venue_id: id, site_id: null, region: data?.region_code ?? null }
  }

  if (level !== 'site') return { venue_id: null, site_id: null, region: null }
  // Everything above the site, filled in from the site: it answers for its
  // venue and its venue answers for the state, so the three can never
  // contradict each other.
  const { data } = await admin
    .from('sites')
    .select('venue_id, venues(region_code)')
    .eq('id', id)
    .maybeSingle()
  const venue = data?.venues as unknown as { region_code: string | null } | null
  return { venue_id: data?.venue_id ?? null, site_id: id, region: venue?.region_code ?? null }
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

  // Where it is, at whichever level was picked. A map must answer; everything
  // else may. The venue is derived when a site is named rather than asked for
  // twice, so the two levels cannot contradict each other — which they already
  // had: Mineral Creek, in the Alpine Lakes, was filed to Dingford Creek.
  const place = await resolvePlace(admin, (formData.get('place') as string) || '')
  // Any level counts. A map of the whole United States is a map of
  // somewhere, and the Locations shelf offers "Add to United States: Map" —
  // so this refused what the page in front of it had just invited, and the
  // throw surfaced as the library failing to render.
  //
  // Thrown, not returned: this is a plain `action=` form whose signature is
  // void, and the field is `required`, so the normal path cannot reach here.
  // Only a submit that went around the form can — which is a fault, not a
  // person making a mistake.
  if (isMap && !place.venue_id && !place.site_id && !place.region) {
    throw new Error('A map needs a place — pick the country, state, venue or canyon it is about.')
  }

  const { data: created, error } = await admin.from('library_items').insert({
    title: ((formData.get('title') as string) || '').trim().slice(0, 200) || 'Untitled',
    description: ((formData.get('description') as string) || '').trim() || null,
    url: url || null,
    edit_url: ((formData.get('edit_url') as string) || '').trim() || null,
    drive_file_id: driveMatch?.[1] ?? null,
    source_type: driveMatch ? 'drive' : youtube ? 'youtube' : 'link',
    kind: VALID_KINDS.has(kind) ? kind : 'reference',
    bucket: isMap ? 'map' : VALID_BUCKETS.has(bucket) ? bucket : 'resource',
    audience: (formData.get('audience') as string) === 'shared' ? 'shared' : 'internal',
    admin_only: (formData.get('audience') as string) === 'admin',
    disciplines: (formData.getAll('disciplines') as string[]).filter((d) => VALID_DISCIPLINES.has(d)),
    topics: cleanTags((formData.get('topics') as string) || ''),
    venue_id: place.venue_id,
    site_id: place.site_id,
    region: place.region,
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
  /** Course setups using it, by name. These block the delete. */
  templates: string[]
  /** The first of them, so the refusal can open it rather than naming it and
      leaving somebody to find it on a shelf. */
  templateId: string | null
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
        .select('id, course_template_sections!inner(course_templates!inner(id, name))')
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
  let templateId: string | null = null
  for (const r of templates ?? []) {
    const section = r.course_template_sections as unknown as { course_templates: { id: string; name: string } | null } | null
    if (section?.course_templates?.name) names.add(section.course_templates.name)
    templateId ??= section?.course_templates?.id ?? null
  }

  return {
    maps: (maps ?? []).length,
    resources: (resources ?? []).length,
    items: (items ?? []).length,
    courses: courses.size,
    templates: [...names].sort(),
    templateId,
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
    // Named and opened. "The template X uses this item" with nowhere to click
    // leaves somebody to find a setup by its name on a shelf of eleven, and
    // the whole reason they are reading the sentence is to go and deal with
    // that setup.
    return refuse(
      `${uses.templates.length === 1 ? 'The course setup' : 'Course setups'} ${uses.templates
        .map((t) => `“${t}”`)
        .join(', ')} ${uses.templates.length === 1 ? 'uses' : 'use'} this item, and a setup holds only a reference to it — deleting it would empty that section. Archive it instead: it disappears from the pickers and every setup keeps working.`,
      uses.templateId
        ? { href: `/admin/library?bucket=setup&template=${uses.templateId}&open=contents`, label: 'Open the setup' }
        : undefined
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

// Disciplines for a whole section at once. The Classroom topic a batch arrives
// under is usually the discipline answer for every item in it — "Standards
// Topics" is not thirteen separate judgements — and tagging them one at a time
// is the step that was being skipped, which leaves items on the shelf that no
// course will ever suggest.
//
// Sets rather than merges, like the audience control beside it: the group is
// the unit being judged, and a half-applied tag read as a group that disagreed
// with itself.
export async function setLibraryDisciplines(ids: string[], disciplines: string[]) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const clean = [...new Set(disciplines)].filter((d) => VALID_DISCIPLINES.has(d))
  const { error } = await admin.from('library_items').update({ disciplines: clean }).in('id', ids)
  if (error) throw new Error(error.message)
  revalidate()
}

// What a thing IS, for a whole group at once. 420 published items carry the
// catch-all type, which is what the Classroom import could tell from a file
// name — and while that is the type, the shelves group into one pile called
// "Reference" and the bullets everyone drew on paper mean nothing.
//
// Grouped the same way the review queue groups: by the room it was posted in.
// Things posted together are usually the same kind of thing, which is the only
// reason any of this is tractable.
export async function setLibraryKind(ids: string[], kind: string) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  if (!VALID_KINDS.has(kind)) throw new Error(`Not a type: ${kind}`)
  // And the shelf that type belongs on. The type is the answer to both
  // questions — saying "kit list" has already said Gear lists — and a row
  // typed here while its bucket stayed behind is a kit list sitting under
  // Reference, which is exactly what happened to two of them.
  // Null for a type whose card is not a bucket shelf; the column is NOT NULL,
  // so the row keeps the shelf it had and KINDS_OFF_BUCKET_SHELVES keeps that
  // leftover from listing it.
  const shelf = bucketForKind(kind)
  const { error } = await admin
    .from('library_items')
    .update({ kind, ...(shelf ? { bucket: shelf } : {}), updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
  await clearSortingMark(admin, ids)
  revalidate()
}

// Permits, COIs and MOUs, flagged together. Eighteen permits sit on the
// instructor shelf readable by twenty-two people, which is the kind of thing
// that is obvious once and then never looked at again.
export async function setLibraryAdminOnly(ids: string[], adminOnly: boolean) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const update: Record<string, unknown> = { admin_only: adminOnly, updated_at: new Date().toISOString() }
  if (adminOnly) update.audience = 'internal'
  const { error } = await admin.from('library_items').update(update).in('id', ids)
  if (error) throw new Error(error.message)
  await clearSortingMark(admin, ids)
  revalidate()
}

export async function rejectLibraryItems(ids: string[]) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const { error } = await admin.from('library_items').update({ status: 'archived' }).in('id', ids)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function createPlaceInline(
  name: string,
  regionCode: string | null
): Promise<{ id: string; name: string } | ActionRefusal> {
  const admin = await requireAdmin()
  const clean = name.trim().slice(0, 120)
  if (!clean) return refuse('A place needs a name.')

  // Already there under that name, probably typed because the list was long
  // rather than because it is missing. Hand back the one that exists.
  const { data: existing } = await admin
    .from('venues')
    .select('id, name')
    .ilike('name', clean)
    .limit(1)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await admin
    .from('venues')
    .insert({ name: clean, region_code: isValidRegion(regionCode ?? '') ? regionCode : null })
    .select('id, name')
    .single()
  if (error) throw new Error(error.message)
  revalidate()
  return data
}

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
  // To the shelf, which is where venues live now. (Outside any try: redirect
  // throws.)
  redirect(`/admin/library?bucket=venue&added=${data.id}`)
}

export async function updateVenue(id: string, patch: { name?: string; region?: string | null; region_code?: string | null; client_name?: string | null; notes?: string | null; links?: { url: string; label: string; kind?: string }[]; contacts?: Record<string, string>[]; active?: boolean }) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120)
  if (patch.region !== undefined) update.region = patch.region?.trim() || null
  if (patch.region_code !== undefined) update.region_code = isValidRegion(patch.region_code) ? patch.region_code : null
  if (patch.client_name !== undefined) update.client_name = patch.client_name?.trim() || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  // Same cleaning a site's links get: an http(s) address or it is not a link,
  // a label that falls back to the host, and a ceiling so a paste cannot turn
  // a venue into a link farm.
  if (patch.links !== undefined) {
    update.links = patch.links
      .map((l) => ({ url: String(l?.url ?? '').trim(), label: String(l?.label ?? '').trim() }))
      .filter((l) => /^https?:\/\//i.test(l.url))
      .map((l, i) => ({
        url: l.url.slice(0, 500),
        label: (l.label || venueLinkHost(l.url)).slice(0, 80),
        kind: ['weather', 'access', 'other'].includes(patch.links![i]?.kind ?? '')
          ? patch.links![i].kind
          : 'other',
      }))
      .slice(0, 12)
  }
  // A contact with no name is a phone number nobody can place, so it is
  // dropped rather than saved as a blank row somebody has to work out later.
  if (patch.contacts !== undefined) {
    update.contacts = patch.contacts
      .map((c) => ({
        name: String(c.name ?? '').trim().slice(0, 120),
        role: String(c.role ?? '').trim().slice(0, 80) || undefined,
        phone: String(c.phone ?? '').trim().slice(0, 40) || undefined,
        email: String(c.email ?? '').trim().slice(0, 120) || undefined,
        note: String(c.note ?? '').trim().slice(0, 300) || undefined,
      }))
      .filter((c) => c.name)
      .slice(0, 12)
  }
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await admin.from('venues').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

function venueLinkHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'link' }
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

/** Changing a link that is already there — its address, what it opens as, or
    who it is for. `setMapLink` upserts on (access, audience), so it can only
    ever correct a URL in place; changing the access would quietly leave the
    old row behind and add a second one. This updates the row itself. */
export async function updateMapLink(
  linkId: string,
  patch: Partial<MapLinkInput>
): Promise<ActionResult> {
  const admin = await requireAdmin()

  const update: Record<string, unknown> = {}
  if (patch.url !== undefined) {
    const url = patch.url.trim()
    if (!url) return refuse('A link needs a URL.')
    if (!/^https?:\/\//i.test(url)) {
      return refuse('That doesn’t look like a link — it should start with https://')
    }
    update.url = url
  }
  if (patch.access !== undefined) {
    if (!['read', 'edit'].includes(patch.access)) throw new Error('Unknown access')
    update.access = patch.access
  }
  if (patch.audience !== undefined) {
    if (!['students', 'instructors'].includes(patch.audience)) throw new Error('Unknown audience')
    update.audience = patch.audience
  }
  if (Object.keys(update).length === 0) return

  const { error } = await admin.from('library_item_links').update(update).eq('id', linkId)
  // One map holds one link per access-and-audience pair; asking for a pair
  // that is taken is a request to have two of the same thing, and the other
  // row is the one on screen directly above or below.
  if (error?.code === '23505') {
    return refuse('This map already has a link for that access and audience.')
  }
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
  patch: {
    name?: string
    description?: string | null
    courseType?: string | null
    /** The filing panel's fields, which every shelf now answers. See 256,
        258 and 260. */
    courseTypes?: string[]
    disciplines?: string[]
    topics?: string[]
    audience?: 'internal' | 'shared'
    url?: string | null
    clientId?: string | null
    place?: string
  }
) {
  const admin = await requireAdmin()

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || 'Untitled setup'
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.courseType !== undefined) update.course_type = patch.courseType || null
  if (patch.courseTypes !== undefined) {
    update.course_types = patch.courseTypes
    update.course_type = patch.courseTypes[0] ?? null
  }
  if (patch.topics !== undefined) update.topics = patch.topics
  if (patch.audience !== undefined) update.audience = patch.audience
  if (patch.url !== undefined) update.url = patch.url?.trim() || null
  if (patch.clientId !== undefined) update.client_id = patch.clientId
  if (patch.place !== undefined) {
    const { resolvePlaceValue } = await import('@/lib/library-file')
    Object.assign(update, await resolvePlaceValue(admin, patch.place))
  }
  if (patch.disciplines !== undefined) {
    update.disciplines = patch.disciplines.filter((d) => VALID_DISCIPLINES.has(d))
  }
  update.updated_at = new Date().toISOString()

  const { error } = await admin.from('course_templates').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

/** A setup's contents.
 *
 * These were frozen in the shape Classroom imported them: 091 called a setup
 * "the section structure of a Classroom class", and every screen since has
 * repeated that its material is built elsewhere. There was nowhere else. The
 * import filled eleven setups with 152 items and the library has 822, so the
 * other 670 belonged to no course type and no hand could put them in one.
 *
 * A setup holds references, never copies — adding an item here points at the
 * library row, so the same document sits in Canyon Mobility and Class C Canyon
 * Rescue as one row that is corrected once.
 */
export async function addCourseSetupSection(templateId: string, title: string) {
  const admin = await requireAdmin()
  const name = title.trim().slice(0, 120)
  if (!name) return refuse('A section needs a name.')
  // Appended, not sorted: the order of a class is the order it is taught in.
  const { data: last } = await admin
    .from('course_template_sections')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await admin.from('course_template_sections').insert({
    template_id: templateId,
    title: name,
    sort_order: (last?.sort_order ?? -1) + 1,
  })
  if (error) throw new Error(error.message)
  revalidate()
  return { ok: true as const }
}

export async function renameCourseSetupSection(sectionId: string, title: string) {
  const admin = await requireAdmin()
  const name = title.trim().slice(0, 120)
  if (!name) return refuse('A section needs a name.')
  const { error } = await admin
    .from('course_template_sections')
    .update({ title: name })
    .eq('id', sectionId)
  if (error) throw new Error(error.message)
  revalidate()
  return { ok: true as const }
}

/** Only an empty one. A section with material in it is a thing someone built;
    emptying it first makes that a decision rather than a side effect. */
export async function deleteCourseSetupSection(sectionId: string) {
  const admin = await requireAdmin()
  const { count } = await admin
    .from('course_template_items')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', sectionId)
  if ((count ?? 0) > 0) {
    return refuse(`This section still holds ${count} item${count === 1 ? '' : 's'}. Take them out first.`)
  }
  const { error } = await admin.from('course_template_sections').delete().eq('id', sectionId)
  if (error) throw new Error(error.message)
  revalidate()
  return { ok: true as const }
}

export async function addCourseSetupItems(sectionId: string, itemIds: string[]) {
  const admin = await requireAdmin()
  if (itemIds.length === 0) return { ok: true as const }
  const { data: last } = await admin
    .from('course_template_items')
    .select('sort_order')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let next = (last?.sort_order ?? -1) + 1
  // The table already refuses the same item twice in one section; ignoring the
  // conflict means adding a batch that overlaps what is there does the useful
  // half instead of failing whole.
  const { error } = await admin
    .from('course_template_items')
    .upsert(
      itemIds.map((item_id) => ({ section_id: sectionId, item_id, sort_order: next++ })),
      { onConflict: 'section_id,item_id', ignoreDuplicates: true }
    )
  if (error) throw new Error(error.message)
  revalidate()
  return { ok: true as const }
}

/** Takes the reference out of the setup. The library keeps the item — this is
    the row that said "this material belongs on this kind of course", and it is
    only that claim being withdrawn. */
export async function removeCourseSetupItem(rowId: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('course_template_items').delete().eq('id', rowId)
  if (error) throw new Error(error.message)
  revalidate()
  return { ok: true as const }
}

/** Candidates for a section, searched rather than listed: the shelf is 822
    rows and the question is always "where is this one document". Published
    only — pending material has not been sorted yet, and putting it on a course
    type is a judgement that comes after the one in the review queue. */
export async function searchLibraryForSetup(q: string, limit = 25) {
  const admin = await requireAdmin()
  const term = q.trim()
  if (term.length < 2) return []
  const { data, error } = await admin
    .from('library_items')
    .select('id, title, kind, bucket, audience, disciplines, source_class')
    .eq('status', 'published')
    .ilike('title', `%${term}%`)
    .order('title')
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Filing a hand-picked set to one place.
 *
 * The group move was removed because a kind-group is not a destination —
 * seven forms are a waiver, a kit list and an equipment log. A set somebody
 * ticked is a destination: they looked at each row and said these ones.
 */
export async function setLibraryPlace(ids: string[], place: string) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const resolved = await resolvePlace(admin, place)
  const { error } = await admin
    .from('library_items')
    .update({ ...resolved, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
  await clearSortingMark(admin, ids)
  revalidate()
}

/** An offering added to a hand-picked set. Added rather than set, because
    the point of the list is that a row can serve two — and a bulk control
    that replaced the list would quietly untie the one row in the selection
    that already said something. Taking one off is done on the row, where you
    can see what else is on it. */
export async function addLibraryOffering(ids: string[], courseType: string) {
  const admin = await requireAdmin()
  if (ids.length === 0 || !courseType) return
  const { data: rows } = await admin.from('library_items').select('id, course_types').in('id', ids)
  for (const r of rows ?? []) {
    const have = (r.course_types ?? []) as string[]
    if (have.includes(courseType)) continue
    const { error } = await admin
      .from('library_items')
      .update({ course_types: [...have, courseType], updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) throw new Error(error.message)
  }
  await clearSortingMark(admin, ids)
  revalidate()
}

/** Archiving a hand-picked set. Archived rather than deleted: it stays
    searchable on its own tab and is never suggested, which is what "get rid
    of it" means for something somebody may have to find once more. */
export async function archiveLibraryItems(ids: string[]) {
  const admin = await requireAdmin()
  if (ids.length === 0) return
  const { error } = await admin
    .from('library_items')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
  revalidate()
}

/** Deleting a hand-picked set, one at a time and under the same guards.
 *
 * Deliberately not one `.in('id', …)` delete: each row has its own answer to
 * "is anything pointing at this", and the refusals are the useful part — a
 * batch that silently skipped three would read as a batch that deleted
 * everything. Comes back with what was kept and why.
 */
export async function deleteLibraryItems(
  ids: string[]
): Promise<{ deleted: number; kept: { title: string; reason: string }[] }> {
  const admin = await requireAdmin()
  if (ids.length === 0) return { deleted: 0, kept: [] }

  const { data: rows } = await admin.from('library_items').select('id, title').in('id', ids)
  const titleOf = new Map((rows ?? []).map((r) => [r.id as string, r.title as string]))

  let deleted = 0
  const kept: { title: string; reason: string }[] = []
  for (const id of ids) {
    const r = await deleteLibraryItem(id)
    if (r?.error) kept.push({ title: titleOf.get(id) ?? 'An item', reason: r.error })
    else deleted++
  }
  revalidate()
  return { deleted, kept }
}
