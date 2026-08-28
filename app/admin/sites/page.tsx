import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSite, createMeetingPoint } from './actions'
import SiteRow from './SiteRow'
import MeetingPointRow from './MeetingPointRow'
import { SITE_KINDS, type Site, type MeetingPointRecord } from '@/lib/sites'
import { type Venue } from '@/lib/library'
import InfoHint from '@/components/InfoHint'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-xs text-zinc-400 mb-1'

export default async function SitesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: siteRows }, { data: venueRows }, { data: dayRows }, { data: pointRows }] = await Promise.all([
    admin.from('sites').select('id, venue_id, name, kind, beta, meeting_point_id, usual_meeting_time, coords, links, active').order('name'),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, active').order('name'),
    admin.from('schedule_days').select('site_id').not('site_id', 'is', null),
    admin.from('meeting_points').select('id, name, venue_id, directions, coords, links, active').order('name'),
  ])

  const sites = (siteRows ?? []) as Site[]
  const venues = (venueRows ?? []) as Venue[]
  const points = (pointRows ?? []) as MeetingPointRecord[]
  // How many canyons meet at each — the number that says why a meetup is its
  // own row rather than a sentence typed twice.
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

  // Grouped by venue, because that's how you go looking: "what have we got on
  // Maui?" rather than "show me every canyon we've ever run".
  const byVenue = new Map<string, Site[]>()
  for (const s of sites) {
    const k = s.venue_id ?? ''
    byVenue.set(k, [...(byVenue.get(k) ?? []), s])
  }
  const groups = [
    ...venues.filter((v) => byVenue.has(v.id)).map((v) => ({ name: v.name, sites: byVenue.get(v.id)! })),
    ...(byVenue.has('') ? [{ name: 'No venue', sites: byVenue.get('')! }] : []),
  ]

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/admin/venues" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Venues</Link>

        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Sites
          <InfoHint text="A site's beta is written once and shown live on every schedule day that points at it — correcting a rap count here corrects it everywhere. What's only true of one day stays in that day's notes." />
        </h1>
        <p className="text-zinc-400 mt-1 mb-8">The canyons, crags and towers a day actually happens at.</p>

        {/* Meetups first: a site points at one, so it has to exist before the
            site can say it meets there. Collapsed by default — this is set up
            once and then mostly read. */}
        <details className="group mb-10">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors">
            <span className="text-zinc-600 inline-block transition-transform group-open:rotate-90">▶</span>
            Meeting points
            <span className="text-zinc-600 text-xs">{points.length}</span>
            <InfoHint text="Where we gather, which is often not where we're going — one trailhead can serve several canyons, and we frequently meet where there's parking and carpool in. A site says which meetup it usually uses; a schedule day can say otherwise." />
          </summary>
          <div className="mt-3 space-y-2">
            {points.map((p) => (
              <MeetingPointRow key={p.id} point={p} venues={venues} siteCount={siteCount.get(p.id) ?? 0} />
            ))}
            {points.length === 0 && <p className="text-sm text-zinc-500">No meeting points yet.</p>}
            <form action={createMeetingPoint} className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Name *</label>
                <input name="name" required className={input} placeholder="Hanawi lower lot" />
              </div>
              <div>
                <label className={label}>Venue</label>
                <select name="venue_id" className={input} defaultValue="">
                  <option value="">— none —</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Directions</label>
                <input name="directions" className={input} placeholder="Gate on the mauka side past mile 12. Park along the fence." />
              </div>
              <div>
                <label className={label}>Coordinates</label>
                <input name="coords" className={input} placeholder="20.7988, -156.1193" />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="px-4 py-2 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors">
                  Add meeting point
                </button>
              </div>
            </form>
          </div>
        </details>

        <div className="space-y-8 mb-10">
          {groups.map((g) => (
            <div key={g.name}>
              <h2 className="text-[11px] uppercase tracking-wide text-zinc-600 mb-2">{g.name}</h2>
              <div className="space-y-2">
                {g.sites.map((s) => (
                  <SiteRow key={s.id} site={s} venues={venues} points={points} dayCount={dayCount.get(s.id) ?? 0} />
                ))}
              </div>
            </div>
          ))}
          {sites.length === 0 && <p className="text-sm text-zinc-500">No sites yet.</p>}
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            <span className="text-zinc-600 mr-2 inline-block transition-transform group-open:rotate-90">▶</span>
            Add a site
          </summary>
          <form action={createSite} className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Name *</label>
              <input name="name" required className={input} placeholder="Emerald Canyon (Upper)" />
            </div>
            <div>
              <label className={label}>Venue</label>
              <select name="venue_id" className={input} defaultValue="">
                <option value="">— none —</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Kind</label>
              <input name="kind" list="new-site-kinds" className={input} placeholder="canyon" />
              <datalist id="new-site-kinds">
                {SITE_KINDS.map((k) => <option key={k} value={k} />)}
              </datalist>
            </div>
            <div>
              <label className={label}>Usual meeting time</label>
              <input name="usual_meeting_time" className={input} placeholder="0530" />
            </div>
            <div>
              <label className={label}>Usual meeting point</label>
              <select name="meeting_point_id" className={input} defaultValue="">
                <option value="">— none —</option>
                {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Coordinates — the meeting pin</label>
              <input name="coords" className={input} placeholder="20.7988, -156.1193" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Beta</label>
              <textarea name="beta" rows={4} className={`${input} resize-y`} placeholder="Approach, raps, exit, hazards — line breaks are kept." />
            </div>
            <div className="sm:col-span-2">
              <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                Add site
              </button>
            </div>
          </form>
        </details>
      </div>
    </main>
  )
}
