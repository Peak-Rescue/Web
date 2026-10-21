'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type SiteLink } from '@/lib/sites'
import { refuse, type ActionResult, type ActionRefusal } from '@/lib/action-result'
import { isValidRegion } from '@/lib/regions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorised')
  return admin
}

// A site's beta is read on the course page and printed on the schedule PDF, so
// correcting one has to reach every course showing it — not just this screen.
function revalidate() {
  revalidatePath('/admin/sites')
  revalidatePath('/admin/venues')
  revalidatePath('/admin/schedules', 'layout')
  revalidatePath('/portal', 'layout')
}

function cleanLinks(raw: unknown): SiteLink[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((l) => ({
      url: String((l as SiteLink)?.url ?? '').trim(),
      label: String((l as SiteLink)?.label ?? '').trim(),
    }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .map((l) => ({ url: l.url.slice(0, 500), label: (l.label || hostOf(l.url)).slice(0, 80) }))
    .slice(0, 10)
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'link' }
}

export async function createSite(formData: FormData) {
  const admin = await requireAdmin()
  const name = ((formData.get('name') as string) || '').trim()
  if (!name) throw new Error('Name is required')
  const { data, error } = await admin.from('sites').insert({
    name: name.slice(0, 160),
    venue_id: ((formData.get('venue_id') as string) || '') || null,
    // Set when there is no venue over it; the venue answers for the state
    // when there is one.
    region_code: isValidRegion(formData.get('region_code') as string)
      ? (formData.get('region_code') as string)
      : null,
    kind: ((formData.get('kind') as string) || '').trim() || null,
    beta: ((formData.get('beta') as string) || '').trim() || null,
    meeting_point_id: ((formData.get('meeting_point_id') as string) || '') || null,
    usual_meeting_time: ((formData.get('usual_meeting_time') as string) || '').trim() || null,
    coords: ((formData.get('coords') as string) || '').trim() || null,
    // Beta is written here and also lives on ropewiki as often as not, and a
    // canyon usually has three links rather than one — the route page, the
    // gauge, the driving pin. Taken on the same form so adding a canyon does
    // not mean adding it and then going back for everything about it.
    links: (() => {
      const urls = formData.getAll('link_url') as string[]
      const labels = formData.getAll('link_label') as string[]
      return urls
        .map((u, i) => ({ url: (u ?? '').trim(), label: (labels[i] ?? '').trim() }))
        .filter((l) => /^https?:\/\//i.test(l.url))
        .map((l) => ({ url: l.url.slice(0, 500), label: (l.label || 'link').slice(0, 80) }))
        .slice(0, 10)
    })(),
  }).select('id').single()
  if (error) throw new Error(error.message)
  revalidate()
  // The list is grouped by venue and sorted by name, so a new site lands
  // anywhere but here — the form it was typed into is at the foot of the page.
  // Redirecting names the row so the page can go to it. (Outside any try:
  // redirect throws.)
  redirect(`/admin/sites?added=${data.id}`)
}

export async function updateSite(
  id: string,
  patch: {
    name?: string
    venue_id?: string | null
    kind?: string | null
    beta?: string | null
    meeting_point_id?: string | null
    usual_meeting_time?: string | null
    coords?: string | null
    links?: SiteLink[]
    active?: boolean
  }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 160) || 'Untitled site'
  if (patch.venue_id !== undefined) update.venue_id = patch.venue_id || null
  if (patch.kind !== undefined) update.kind = patch.kind?.trim() || null
  if (patch.beta !== undefined) update.beta = patch.beta?.trim() || null
  if (patch.meeting_point_id !== undefined) update.meeting_point_id = patch.meeting_point_id || null
  if (patch.usual_meeting_time !== undefined) update.usual_meeting_time = patch.usual_meeting_time?.trim() || null
  if (patch.coords !== undefined) update.coords = patch.coords?.trim() || null
  if (patch.links !== undefined) update.links = cleanLinks(patch.links)
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await admin.from('sites').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function deleteSite(id: string) {
  const admin = await requireAdmin()
  // Days keep their own notes and location; the FK's ON DELETE SET NULL just
  // drops the link, so deleting a site never blanks a schedule.
  const { error } = await admin.from('sites').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

// ─── Meeting points ─────────────────────────────────────────────────────────
//
// A meetup outlives the courses that use it and is shared by every site that
// meets there, so correcting a gate code here corrects it everywhere at once —
// the same bargain a site's beta makes, drawn around the thing that varies.

export async function createMeetingPoint(formData: FormData) {
  const admin = await requireAdmin()
  const name = ((formData.get('name') as string) || '').trim()
  if (!name) throw new Error('Name is required')
  const { error } = await admin.from('meeting_points').insert({
    name: name.slice(0, 160),
    venue_id: ((formData.get('venue_id') as string) || '') || null,
    directions: ((formData.get('directions') as string) || '').trim() || null,
    coords: ((formData.get('coords') as string) || '').trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidate()
}

export async function updateMeetingPoint(
  id: string,
  patch: {
    name?: string
    venue_id?: string | null
    directions?: string | null
    coords?: string | null
    links?: SiteLink[]
    active?: boolean
  }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 160) || 'Untitled meeting point'
  if (patch.venue_id !== undefined) update.venue_id = patch.venue_id || null
  if (patch.directions !== undefined) update.directions = patch.directions?.trim() || null
  if (patch.coords !== undefined) update.coords = patch.coords?.trim() || null
  if (patch.links !== undefined) update.links = cleanLinks(patch.links)
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await admin.from('meeting_points').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function deleteMeetingPoint(id: string) {
  const admin = await requireAdmin()
  // Both foreign keys are ON DELETE SET NULL, so a site or a day that met here
  // falls back to whatever is behind it rather than losing its morning.
  const { error } = await admin.from('meeting_points').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

// A meetup typed straight onto a course day, filed into the library from
// there. The words are already written and the person who wrote them is the
// one who knows it is a real place we will meet again — so the offer sits
// beside the box, and taking it is one press rather than a trip to the
// meeting-points screen to retype the same sentence.
//
// The day is pointed at the new row and its own text cleared in the same go:
// left in place, the typed words still beat the meetup (free text outranks
// both on a day), and the next correction made in the library would never
// reach the morning that started it.
export async function fileDayMeetingPoint(
  dayId: string,
  text: string
): Promise<{ id: string; name: string } | ActionRefusal> {
  const admin = await requireAdmin()
  const directions = text.trim()
  if (!directions) return refuse('There is nothing typed to file.')

  const { data: day, error: dayError } = await admin
    .from('schedule_days')
    .select('meeting_point_id, sites(venue_id), course_schedules(instance_id)')
    .eq('id', dayId)
    .single()
  if (dayError) throw new Error(dayError.message)
  if (day.meeting_point_id) return refuse('This day already meets at a saved meeting point.')

  // The name is the first line, minus any URL pasted into it — what someone
  // would call the place out loud. The whole text stays as the directions, so
  // nothing written on the day is lost by filing it, and the name can be
  // tidied on the meeting-points screen afterwards.
  const firstLine = directions.split('\n')[0].replace(/https?:\/\/\S+/gi, '').trim()
  const name = (firstLine || 'Untitled meeting point').slice(0, 80)
  // A pasted "lat, lng" is the pin itself, so it goes where the pin goes.
  const coords = directions.match(/-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/)?.[0]?.replace(/\s+/g, '') ?? null
  // Filed under the region of the canyon this day is at, so it sorts with the
  // lots near it in the picker. A site placed only by state has no venue, and
  // the meetup goes in unfiled rather than under a guess.
  const venueId = (day.sites as unknown as { venue_id: string | null } | null)?.venue_id ?? null

  const { data: row, error } = await admin
    .from('meeting_points')
    .insert({ name, venue_id: venueId, directions, coords })
    .select('id, name')
    .single()
  if (error) throw new Error(error.message)

  const { error: linkError } = await admin
    .from('schedule_days')
    .update({ meeting_point_id: row.id, meeting_point: null })
    .eq('id', dayId)
  if (linkError) throw new Error(linkError.message)

  const instanceId = (day.course_schedules as unknown as { instance_id: string | null } | null)?.instance_id
  if (instanceId) revalidatePath(`/admin/courses/${instanceId}`)
  revalidate()
  return row
}

// ─── Adding to a place, at whatever level it was opened from ─────────────────
//
// A place holds four things and they are four different shapes: a map is
// links, beta is either a canyon with a write-up or somebody else's write-up
// on ropewiki, weather is a link, and a contact is a person with a number.
// One "add" that took a title and a URL could only ever make two of them.
//
// The scope is the level the form was opened at — a venue, or a state or
// country code. It is never asked for, because the form is standing in it.

export type PlaceScope = { venueId: string } | { regionCode: string }

/** Weather, access, and whatever else is a link about a whole area. */
export async function addPlaceLink(
  scope: PlaceScope,
  link: { url: string; label: string; kind: 'weather' | 'access' | 'other' }
): Promise<ActionResult> {
  const admin = await requireAdmin()
  const url = link.url.trim()
  if (!/^https?:\/\//i.test(url)) return refuse('That needs to start with https://')
  const row = {
    url: url.slice(0, 500),
    label: (link.label.trim() || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]).slice(0, 80),
    kind: link.kind,
  }

  if ('venueId' in scope) {
    const { data } = await admin.from('venues').select('links').eq('id', scope.venueId).single()
    const { error } = await admin
      .from('venues')
      .update({ links: [...((data?.links as typeof row[]) ?? []), row].slice(0, 12) })
      .eq('id', scope.venueId)
    if (error) throw new Error(error.message)
  } else {
    const { data } = await admin
      .from('region_info').select('links').eq('region_code', scope.regionCode).maybeSingle()
    const { error } = await admin.from('region_info').upsert(
      { region_code: scope.regionCode, links: [...((data?.links as typeof row[]) ?? []), row].slice(0, 12), updated_at: new Date().toISOString() },
      { onConflict: 'region_code' }
    )
    if (error) throw new Error(error.message)
  }
  revalidate()
  revalidatePath('/admin/library')
}

/** The local someone we actually ring about this area. */
export async function addPlaceContact(
  scope: PlaceScope,
  contact: { name: string; role?: string; phone?: string; email?: string; note?: string }
): Promise<ActionResult> {
  const admin = await requireAdmin()
  const name = contact.name.trim()
  if (!name) return refuse('A contact needs a name.')
  const row = {
    name: name.slice(0, 120),
    role: contact.role?.trim().slice(0, 80) || undefined,
    phone: contact.phone?.trim().slice(0, 40) || undefined,
    email: contact.email?.trim().slice(0, 120) || undefined,
    note: contact.note?.trim().slice(0, 300) || undefined,
  }

  if ('venueId' in scope) {
    const { data } = await admin.from('venues').select('contacts').eq('id', scope.venueId).single()
    const { error } = await admin
      .from('venues')
      .update({ contacts: [...((data?.contacts as typeof row[]) ?? []), row].slice(0, 12) })
      .eq('id', scope.venueId)
    if (error) throw new Error(error.message)
  } else {
    const { data } = await admin
      .from('region_info').select('contacts').eq('region_code', scope.regionCode).maybeSingle()
    const { error } = await admin.from('region_info').upsert(
      { region_code: scope.regionCode, contacts: [...((data?.contacts as typeof row[]) ?? []), row].slice(0, 12), updated_at: new Date().toISOString() },
      { onConflict: 'region_code' }
    )
    if (error) throw new Error(error.message)
  }
  revalidate()
  revalidatePath('/admin/library')
}

/** Makes a country or a state exist on the places page before anything is in
 *  it. A region is not a row anywhere — it is a code other things carry — so
 *  until something was filed under it there was no heading to file anything
 *  under. An empty `region_info` row is that heading. */
export async function addRegion(code: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!isValidRegion(code)) return refuse('That is not a country or state we know.')
  const { error } = await admin
    .from('region_info')
    .upsert({ region_code: code }, { onConflict: 'region_code', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  revalidate()
  revalidatePath('/admin/library')
}

/** Taking a link back off a place.
 *
 * Lived on the venue record panel, which asked for a state the heading
 * already shows and notes nobody writes. The panel went; this had to go
 * somewhere, and the chip it is on is the obvious place — the same bargain
 * every other row on this page makes.
 */
export async function removePlaceLink(scope: PlaceScope, url: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const drop = (rows: { url: string }[] | null | undefined) => (rows ?? []).filter((l) => l.url !== url)

  if ('venueId' in scope) {
    const { data } = await admin.from('venues').select('links').eq('id', scope.venueId).single()
    const { error } = await admin
      .from('venues')
      .update({ links: drop(data?.links as { url: string }[]) })
      .eq('id', scope.venueId)
    if (error) throw new Error(error.message)
  } else {
    const { data } = await admin
      .from('region_info').select('links').eq('region_code', scope.regionCode).maybeSingle()
    const { error } = await admin
      .from('region_info')
      .update({ links: drop(data?.links as { url: string }[]) })
      .eq('region_code', scope.regionCode)
    if (error) throw new Error(error.message)
  }
  revalidate()
  revalidatePath('/admin/library')
}

/** Undoing a place that was added by mistake.
 *
 * Every level can be removed and none of them takes anything with it: a
 * level with something in it refuses and says what, because the thing you
 * want gone is the empty one you just made by picking the wrong state, and
 * the thing you would hate to lose is a venue with four canyons on it.
 */
export async function removeVenue(id: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const [{ count: sites }, { count: items }, { count: courses }] = await Promise.all([
    admin.from('sites').select('id', { count: 'exact', head: true }).eq('venue_id', id),
    admin.from('library_items').select('id', { count: 'exact', head: true }).eq('venue_id', id),
    admin.from('course_instances').select('id', { count: 'exact', head: true }).eq('venue_id', id),
  ])
  const held = [
    sites && `${sites} canyon${sites === 1 ? '' : 's'}`,
    items && `${items} document${items === 1 ? '' : 's'}`,
    courses && `${courses} course${courses === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ')
  if (held) return refuse(`This venue still has ${held}. Move or remove those first.`)

  const { error } = await admin.from('venues').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
  revalidatePath('/admin/library')
}

/** The same for a state or a country. A region is only a heading — the row
    behind it is `region_info` — so removing it is removing the heading, and
    it refuses while anything is filed under it. */
export async function removeRegion(code: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const [{ count: venues }, { count: items }, { count: sites }] = await Promise.all([
    admin.from('venues').select('id', { count: 'exact', head: true }).eq('region_code', code),
    admin.from('library_items').select('id', { count: 'exact', head: true }).eq('region', code).is('venue_id', null),
    admin.from('sites').select('id', { count: 'exact', head: true }).eq('region_code', code).is('venue_id', null),
  ])
  const held = [
    venues && `${venues} venue${venues === 1 ? '' : 's'}`,
    sites && `${sites} canyon${sites === 1 ? '' : 's'}`,
    items && `${items} document${items === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ')
  if (held) return refuse(`This still has ${held} in it. Move or remove those first.`)

  const { error } = await admin.from('region_info').delete().eq('region_code', code)
  if (error) throw new Error(error.message)
  revalidate()
  revalidatePath('/admin/library')
}
