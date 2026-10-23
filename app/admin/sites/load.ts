import { createAdminClient } from '@/lib/supabase/admin'
import { type BookContact } from '@/app/admin/contacts/actions'

type BookPerson = { id: string; name: string; role: string | null; phone: string | null; email: string | null; note: string | null }
type LinkRow = { contact_id: string; client_id: string | null; venue_id: string | null; region_code: string | null }
import { type Site, type MeetingPointRecord } from '@/lib/sites'
import { type LibraryItem, type Venue, type VenueContact, type VenueLink } from '@/lib/library'

/** Everything the sites shelf renders, loaded once so its two doors — its own
    page and the library shelf — cannot drift apart. */
export async function loadSitesShelf() {
  const admin = createAdminClient()
  const [{ data: siteRows }, { data: venueRows }, { data: dayRows }, { data: pointRows }, { data: mapRows }, { data: regionRows }, { data: peopleRows }, { data: linkRows },
    { data: clientRows },
  ] = await Promise.all([
    admin.from('sites').select('id, venue_id, region_code, name, kind, beta, meeting_point_id, usual_meeting_time, coords, links, active').order('name'),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, links, contacts, active').order('name'),
    admin.from('schedule_days').select('site_id').not('site_id', 'is', null),
    admin.from('meeting_points').select('id, name, venue_id, directions, coords, links, active').order('name'),
    // Maps, route write-ups and the rescue and evac plans. All three are
    // about a place and nothing else, which is why they are read here rather
    // than on shelves of their own — a venue's evac plan was filed under
    // Documents with the company's blank templates, which is where you would
    // look for it only if you already knew. Not everything filed to a venue — 147 items carry a venue and most
    // are course material that happened to be taught there.
    admin
      .from('library_items')
      .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, course_types, client_id, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
      .in('kind', ['map', 'route', 'medevac', 'permit'])
      // Only the ones that are about somewhere. A blank "New Rescue Plan" and
      // a confined-space entry permit are templates — the kind is right and
      // there is no place, because there is no place to have. Without this
      // they pile into "Not filed anywhere yet" and read as twenty-one things
      // somebody forgot to file.
      .or('venue_id.not.is.null,site_id.not.is.null,region.not.is.null')
      .neq('status', 'archived')
      .order('title'),
    admin.from('region_info').select('region_code, links, contacts, notes'),
    // Who is known from where (267). One query for the lot: twenty people
    // and six links, and the shelf draws them under every place that knows
    // them.
    admin.from('contacts').select('id, name, role, phone, email, note'),
    admin.from('contact_links').select('contact_id, client_id, venue_id, region_code'),
    // Named, not "a client": the line under a venue contact says where else
    // they are known from, and "also a client" names nothing.
    admin.from('clients').select('id, name'),
  ])

  const sites = (siteRows ?? []) as Site[]
  const venues = (venueRows ?? []) as Venue[]
  const points = (pointRows ?? []) as MeetingPointRecord[]
  const maps = ((mapRows ?? []) as unknown as (LibraryItem & { library_item_links?: LibraryItem['links'] })[])
    .map((m) => ({ ...m, links: m.library_item_links ?? [] }) as LibraryItem)

  const siteCount = new Map<string, number>()
  for (const s of sites) {
    if (!s.meeting_point_id) continue
    siteCount.set(s.meeting_point_id, (siteCount.get(s.meeting_point_id) ?? 0) + 1)
  }
  const dayCount = new Map<string, number>()
  for (const r of dayRows ?? []) {
    const k = r.site_id as string
    dayCount.set(k, (dayCount.get(k) ?? 0) + 1)
  }

  // Keyed by code, so a state's weather is looked up the same way a venue's
  // is: by the thing the items are already filed under.
  const regionInfo = new Map<string, { links: VenueLink[]; contacts: VenueContact[]; notes: string | null }>()
  for (const r of (regionRows ?? []) as { region_code: string; links: VenueLink[]; contacts: VenueContact[]; notes: string | null }[]) {
    regionInfo.set(r.region_code, { links: r.links ?? [], contacts: r.contacts ?? [], notes: r.notes })
  }

  // People by the place that knows them, with the other places they are
  // known from on the row — which is the line that used to be a duplicate.
  const venueName = new Map(venues.map((v) => [v.id, v.name]))
  const clientName = new Map(((clientRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))
  const people = new Map((peopleRows ?? []).map((p) => [p.id as string, p as BookPerson]))
  const byOwner = new Map<string, BookContact[]>()
  const owners = new Map<string, { key: string; label: string }[]>()
  for (const l of (linkRows ?? []) as LinkRow[]) {
    const where = l.client_id
      ? { key: `client:${l.client_id}`, label: clientName.get(l.client_id) ?? 'a client' }
      : l.venue_id
        ? { key: `venue:${l.venue_id}`, label: venueName.get(l.venue_id) ?? 'a venue' }
        : { key: `region:${l.region_code}`, label: String(l.region_code) }
    owners.set(l.contact_id, [...(owners.get(l.contact_id) ?? []), where])
  }
  for (const l of (linkRows ?? []) as LinkRow[]) {
    const person = people.get(l.contact_id)
    if (!person) continue
    const key = l.client_id ? `client:${l.client_id}` : l.venue_id ? `venue:${l.venue_id}` : `region:${l.region_code}`
    byOwner.set(key, [
      ...(byOwner.get(key) ?? []),
      // Every home, not only the other ones: the row drops this list to say
      // "also …", and the editor needs the whole set to change it.
      { ...person, homes: owners.get(l.contact_id) ?? [] },
    ])
  }

  return { sites, venues, points, maps, regionInfo, siteCount, dayCount, contactsByOwner: byOwner }
}
