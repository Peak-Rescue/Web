'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type SiteLink } from '@/lib/sites'
import { refuse, type ActionResult } from '@/lib/action-result'

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
    kind: ((formData.get('kind') as string) || '').trim() || null,
    beta: ((formData.get('beta') as string) || '').trim() || null,
    meeting_point_id: ((formData.get('meeting_point_id') as string) || '') || null,
    usual_meeting_time: ((formData.get('usual_meeting_time') as string) || '').trim() || null,
    coords: ((formData.get('coords') as string) || '').trim() || null,
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
