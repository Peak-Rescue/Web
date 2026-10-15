import { createAdminClient } from '@/lib/supabase/admin'
import { type Site, type MeetingPointRecord } from '@/lib/sites'
import { type LibraryItem, type Venue } from '@/lib/library'

/** Everything the sites shelf renders, loaded once so its two doors — its own
    page and the library shelf — cannot drift apart. */
export async function loadSitesShelf() {
  const admin = createAdminClient()
  const [{ data: siteRows }, { data: venueRows }, { data: dayRows }, { data: pointRows }, { data: mapRows }] = await Promise.all([
    admin.from('sites').select('id, venue_id, name, kind, beta, meeting_point_id, usual_meeting_time, coords, links, active').order('name'),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, links, contacts, active').order('name'),
    admin.from('schedule_days').select('site_id').not('site_id', 'is', null),
    admin.from('meeting_points').select('id, name, venue_id, directions, coords, links, active').order('name'),
    // The maps and the route write-ups. Both are about a place and nothing
    // else, which is why they are read here rather than on a shelf of their
    // own. Not everything filed to a venue — 147 items carry a venue and most
    // are course material that happened to be taught there.
    admin
      .from('library_items')
      .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
      .in('kind', ['map', 'route'])
      .neq('status', 'archived')
      .order('title'),
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

  return { sites, venues, points, maps, siteCount, dayCount }
}
