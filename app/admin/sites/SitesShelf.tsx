import Link from 'next/link'
import { createSite, createMeetingPoint } from './actions'
import SiteRow from './SiteRow'
import MeetingPointRow from './MeetingPointRow'
import JumpToNewRow from '@/components/JumpToNewRow'
import { SITE_KINDS, type Site, type MeetingPointRecord } from '@/lib/sites'
import { type LibraryItem, type Venue } from '@/lib/library'
import LibraryRow from '@/app/admin/library/LibraryRow'
import { type SiteOption } from '@/app/admin/schedules/types'
import InfoHint from '@/components/InfoHint'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-xs text-zinc-400 mb-1'

/** The sites shelf: the canyons, crags and towers themselves.
 *
 * One component, two doors. It is a shelf in the library because that is where
 * someone goes looking for material and a canyon's beta is material — it just
 * isn't a link. It is also still /admin/sites, because the "Edit beta" button
 * on a schedule day deep-links to a row here and a screen with two addresses
 * that renders twice is how the two drift apart.
 *
 * Venues are not a shelf of their own. A venue groups these and files a
 * course, which is work it does underneath something else — nobody goes
 * looking for a venue, they go looking for the canyon, so the venue is a
 * heading here and a door at the bottom rather than a card of its own.
 */
export default function SitesShelf({
  sites,
  venues,
  points,
  maps,
  siteCount,
  dayCount,
  added,
}: {
  sites: Site[]
  venues: Venue[]
  points: MeetingPointRecord[]
  /** The maps, read beside the places they are about rather than on a shelf
      of their own answering the same question differently. */
  maps: LibraryItem[]
  /** How many canyons meet at each point — the number that says why a meetup
      is its own row rather than a sentence typed twice. */
  siteCount: Map<string, number>
  /** How many schedule days point at each site. */
  dayCount: Map<string, number>
  /** A site just created, to scroll to. */
  added?: string
}) {
  // Grouped by venue, because that's how you go looking: "what have we got on
  // Maui?" rather than "show me every canyon we've ever run".
  const byVenue = new Map<string, Site[]>()
  for (const s of sites) {
    const k = s.venue_id ?? ''
    byVenue.set(k, [...(byVenue.get(k) ?? []), s])
  }
  const mapsByVenue = new Map<string, LibraryItem[]>()
  for (const m of maps) {
    const k = m.venue_id ?? ''
    mapsByVenue.set(k, [...(mapsByVenue.get(k) ?? []), m])
  }
  // A venue earns a heading by having anything under it at all — its own
  // links, a canyon, or a map.
  const groups = [
    ...venues
      .filter((v) => byVenue.has(v.id) || mapsByVenue.has(v.id) || (v.links ?? []).length > 0)
      .map((v) => ({
        key: v.id,
        name: v.name,
        venue: v as Venue | null,
        sites: byVenue.get(v.id) ?? [],
        maps: mapsByVenue.get(v.id) ?? [],
      })),
    ...(byVenue.has('') || mapsByVenue.has('')
      ? [{
          key: '_none',
          name: 'Nowhere yet',
          venue: null,
          sites: byVenue.get('') ?? [],
          maps: mapsByVenue.get('') ?? [],
        }]
      : []),
  ]
  // Sites under their venue carry the venue onto the map rows, so a map filed
  // to a canyon reads as that canyon rather than as its region.
  const siteOptions: SiteOption[] = sites.map((x) => ({
    id: x.id, name: x.name, kind: x.kind, beta: x.beta, venue_id: x.venue_id,
  }))

  return (
    <>
      {/* Meetups first: a site points at one, so it has to exist before the
          site can say it meets there. Collapsed by default — this is set up
          once and then mostly read. */}
      <details className="group mb-8">
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

      {added && sites.some((s) => s.id === added) && (
        <JumpToNewRow key={added} targetId={`site-${added}`} />
      )}

      <div className="space-y-8 mb-8">
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="text-[11px] uppercase tracking-wide text-zinc-600 mb-2">{g.name}</h2>

            {/* What is true of the whole area: the weather, the permit
                portal, the hospital, the drive in. Set on the venue itself —
                this is where they are read. */}
            {g.venue && (g.venue.links ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {g.venue.links.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {g.sites.map((s) => (
                <SiteRow key={s.id} site={s} venues={venues} points={points} dayCount={dayCount.get(s.id) ?? 0} />
              ))}
            </div>

            {/* Open, like the canyons above them. They were folded on the
                theory that maps are the long part of a venue — which is not
                true of a shelf holding four sites and twenty-three maps,
                where the biggest venue has four of either. Folding one and
                not the other just read as a rule nobody could see. If this
                grows to where a venue is a screenful, fold then, and fold
                both. */}
            {g.maps.length > 0 && (
              <div className="mt-2">
                {g.sites.length > 0 && (
                  <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Maps</p>
                )}
                <div className="space-y-2">
                  {g.maps.map((m) => (
                    <LibraryRow key={m.id} item={m} venues={venues} sites={siteOptions} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {sites.length === 0 && maps.length === 0 && <p className="text-sm text-zinc-500">Nothing filed by place yet.</p>}
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors">
          <span className="text-base leading-none text-zinc-500 group-open:hidden">+</span>
          <span className="hidden text-base leading-none text-zinc-500 group-open:inline">−</span>
          Add a site
        </summary>
        <form action={createSite} className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Name *</label>
            <input name="name" required className={input} placeholder="Keyhole Canyon" />
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
            <label className={label}>Coordinates — the canyon itself</label>
            <input name="coords" className={input} placeholder="20.7988, -156.1193" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Beta</label>
            <textarea name="beta" rows={4} className={`${input} resize-y`} placeholder="Approach, raps, exit, hazards — line breaks are kept. The first line is the scope line." />
          </div>
          <div className="sm:col-span-2">
            <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
              Add site
            </button>
          </div>
        </form>
      </details>

      {/* The venue is the region these are grouped under, and the only place
          it can be created or renamed. Not a shelf of its own — naming it
          without a way to reach it is how the same region gets typed twice. */}
      <p className="mt-6">
        <Link href="/admin/venues" className="text-sm text-zinc-500 hover:text-zinc-300 underline transition-colors">
          Venues →
        </Link>
        <span className="text-sm text-zinc-600"> the regions these sit in, and the links that are true of the whole area.</span>
      </p>
    </>
  )
}
