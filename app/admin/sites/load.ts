import { createAdminClient } from '@/lib/supabase/admin'
import { type Site, type MeetingPointRecord } from '@/lib/sites'
import { type Venue } from '@/lib/library'

/** Everything the sites shelf renders, loaded once so its two doors — its own
    page and the library shelf — cannot drift apart. */
export async function loadSitesShelf() {
  const admin = createAdminClient()
  const [{ data: siteRows }, { data: venueRows }, { data: dayRows }, { data: pointRows }] = await Promise.all([
    admin.from('sites').select('id, venue_id, name, kind, beta, meeting_point_id, usual_meeting_time, coords, links, active').order('name'),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, links, active').order('name'),
    admin.from('schedule_days').select('site_id').not('site_id', 'is', null),
    admin.from('meeting_points').select('id, name, venue_id, directions, coords, links, active').order('name'),
  ])

  const sites = (siteRows ?? []) as Site[]
  const venues = (venueRows ?? []) as Venue[]
  const points = (pointRows ?? []) as MeetingPointRecord[]

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

  return { sites, venues, points, siteCount, dayCount }
}
