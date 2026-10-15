import Link from 'next/link'
import { createSite, createMeetingPoint } from './actions'
import SiteRow from './SiteRow'
import MeetingPointRow from './MeetingPointRow'
import JumpToNewRow from '@/components/JumpToNewRow'
import AddToPlace from './AddToPlace'
import { SITE_KINDS, type Site, type MeetingPointRecord } from '@/lib/sites'
import { type LibraryItem, type Venue, type VenueContact, type VenueLink } from '@/lib/library'
import { countryName, regionLabel, splitRegion, SUBDIVISIONS } from '@/lib/regions'
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
  regionInfo,
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
  /** Weather, contacts and notes held against a state or a country. */
  regionInfo: Map<string, { links: VenueLink[]; contacts: VenueContact[]; notes: string | null }>
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
  // Two blocks, because they answer different questions about the same place:
  // a map shows you the ground, beta tells you what the descent is like.
  const mapsByVenue = new Map<string, LibraryItem[]>()
  const betaByVenue = new Map<string, LibraryItem[]>()
  for (const m of maps) {
    const k = m.venue_id ?? ''
    const into = m.kind === 'route' ? betaByVenue : mapsByVenue
    into.set(k, [...(into.get(k) ?? []), m])
  }
  // A venue earns a heading by having anything under it at all — its own
  // links, a canyon, or a map.
  const groups: {
    key: string; name: string; venue: Venue | null
    sites: Site[]; maps: LibraryItem[]; beta: LibraryItem[]
  }[] = [
    ...venues
      .filter((v) => byVenue.has(v.id) || mapsByVenue.has(v.id) || betaByVenue.has(v.id) || (v.links ?? []).length > 0)
      .map((v) => ({
        key: v.id,
        name: v.name,
        venue: v as Venue | null,
        sites: byVenue.get(v.id) ?? [],
        maps: mapsByVenue.get(v.id) ?? [],
        beta: betaByVenue.get(v.id) ?? [],
      })),
    ...(byVenue.has('') || mapsByVenue.has('') || betaByVenue.has('')
      ? [{
          key: '_none',
          name: 'Nowhere yet',
          venue: null,
          sites: byVenue.get('') ?? [],
          maps: mapsByVenue.get('') ?? [],
          beta: betaByVenue.get('') ?? [],
        }]
      : []),
  ]
  // Venues sit at three different scales — a country (Taiwan), a state, a
  // named area inside one — so the list is grouped by where they are rather
  // than alphabetically across all of them. Country, then state: looking for
  // Dingford means knowing it is in Washington long before remembering how it
  // is spelled.
  //
  // The state headings are plain text, not another thing to open. Two levels
  // of disclosure to reach a venue would be one more click than the list is
  // long enough to deserve, and the venues themselves already fold.
  // Filed to a state or a country rather than to a venue — a map of
  // Washington, the ropewiki index for Nevada. These were being loaded and
  // then rendered nowhere: every block on this page hung off a venue, so
  // anything filed above one simply vanished.
  const atRegion = new Map<string, LibraryItem[]>()
  for (const m of maps) {
    if (m.venue_id || m.site_id || !m.region) continue
    atRegion.set(m.region, [...(atRegion.get(m.region) ?? []), m])
  }

  const venueOf = new Map(venues.map((v) => [v.id, v]))
  const regions = new Map<string, typeof groups>()
  for (const g of groups) {
    const v = g.venue ? venueOf.get(g.venue.id) : null
    regions.set(v?.region_code ?? '', [...(regions.get(v?.region_code ?? '') ?? []), g])
  }
  const byCountry = new Map<string, { code: string; label: string; groups: typeof groups }[]>()
  for (const [code, gs] of regions) {
    const { country } = splitRegion(code)
    const label = code.includes('-') ? regionLabel(code).split(',')[0] : ''
    byCountry.set(country, [...(byCountry.get(country) ?? []), { code, label, groups: gs }])
  }
  const countries = [...byCountry.entries()]
    .map(([country, subs]) => ({
      country,
      // Unfiled last, under its own heading rather than pretending to be a
      // country called "".
      label: country ? countryName(country) : 'No country set',
      // Bahamas has no states, so "No state set" under it is not a gap worth
      // reporting — it is a level that country does not have. The line is
      // only drawn where a state was expected and is missing.
      hasStates: Boolean(SUBDIVISIONS[country]),
      subs: subs.sort((a, b) => (a.label || '\uffff').localeCompare(b.label || '\uffff')),
    }))
    .sort((a, b) => (a.country ? 0 : 1) - (b.country ? 0 : 1) || a.label.localeCompare(b.label))

  // Sites under their venue carry the venue onto the map rows, so a map filed
  // to a canyon reads as that canyon rather than as its region.
  const siteOptions: SiteOption[] = sites.map((x) => ({
    id: x.id, name: x.name, kind: x.kind, beta: x.beta, venue_id: x.venue_id,
  }))


  // The same four blocks a venue has, for a state or a country. Maps and beta
  // are library rows filed to the code; weather and contacts are region_info,
  // which is keyed by the same code so there is no second list of states to
  // keep in step.
  const RegionBlocks = ({ code }: { code: string }) => {
    const items = atRegion.get(code) ?? []
    const info = regionInfo.get(code)
    const beta = items.filter((i) => i.kind === 'route')
    const maps = items.filter((i) => i.kind !== 'route')
    const weather = (info?.links ?? []).filter((l) => l.kind === 'weather')
    const other = (info?.links ?? []).filter((l) => l.kind !== 'weather')
    const contacts = info?.contacts ?? []
    // Always rendered, because the add forms live here too: a state with
    // nothing in it is exactly where something is about to be put.
    return (
      <div className="mb-2 space-y-2">
        {weather.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {weather.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                 className="text-[11px] px-2 py-1 rounded border border-sky-900/60 bg-sky-950/30 text-sky-300 hover:text-white hover:border-sky-700 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        )}
        {contacts.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {contacts.map((c, i) => (
              <span key={i} className="text-[11px] text-zinc-400">
                {c.name}
                {c.role && <span className="text-zinc-600"> · {c.role}</span>}
                {(c.phone || c.email) && (
                  <a href={c.phone ? `tel:${c.phone}` : `mailto:${c.email}`}
                     className="ml-1.5 text-zinc-300 hover:text-white underline underline-offset-2">
                    {c.phone || c.email}
                  </a>
                )}
              </span>
            ))}
          </div>
        )}
        {other.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {other.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                 className="text-[11px] px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        )}
        {beta.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Beta</p>
            <div className="space-y-2">
              {beta.map((b) => <LibraryRow key={b.id} item={b} venues={venues} sites={siteOptions} />)}
            </div>
          </div>
        )}
        {maps.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Maps</p>
            <div className="space-y-2">
              {maps.map((m) => <LibraryRow key={m.id} item={m} venues={venues} sites={siteOptions} />)}
            </div>
          </div>
        )}
        <AddToPlace scope={{ regionCode: code }} place={`region:${code}`} placeName={regionLabel(code) || code} />
      </div>
    )
  }


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

      <div className="space-y-6 mb-8">
        {/* A place is the unit you scan, so a place is what folds. Open it and
            everything about it is there — the links that are true of the whole
            area, its canyons, its maps — and so is the way to add more of any
            of them, which is the thing that was missing: you could see what a
            venue had and had to leave to give it anything. */}
        {countries.map((c) => (
          // Three levels, told apart three ways at once: size, colour and how
          // far in they start. Weight alone was not enough to read at a
          // glance, which is the only thing this page is for.
          <div key={c.country || '_none'} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
            <h2 className="text-lg font-bold text-white mb-3 pb-2 border-b border-zinc-700">{c.label}</h2>
            {c.country && <RegionBlocks code={c.country} />}
            {c.subs.map((sub) => (
              // A state heading only where a state is a thing that country
              // has. Bahamas has none, so "No state set" under it reported a
              // gap that cannot exist.
              <div
                key={sub.code || '_nosub'}
                className={sub.label || c.hasStates ? 'mb-4 pl-3 border-l-2 border-zinc-700' : 'mb-4'}
              >
                {(sub.label || c.hasStates) && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pr-red-light/80 mb-2">
                    {sub.label || 'No state set'}
                  </p>
                )}
                <div className="space-y-2">
        {sub.groups.map((g) => (
          <details key={g.key} className="group/venue rounded-lg border border-zinc-800 bg-zinc-900">
            <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/60 transition-colors">
              <span aria-hidden className="text-zinc-600 text-xs transition-transform group-open/venue:rotate-90">▶</span>
              <span className="text-sm font-medium text-zinc-200">{g.name}</span>
              <span className="text-[11px] text-zinc-600">
                {[
                  g.sites.length && `${g.sites.length} site${g.sites.length === 1 ? '' : 's'}`,
                  g.maps.length && `${g.maps.length} map${g.maps.length === 1 ? '' : 's'}`,
                  g.beta.length && `${g.beta.length} beta`,
                  g.venue && (g.venue.links ?? []).length && `${g.venue.links.length} link${g.venue.links.length === 1 ? '' : 's'}`,
                  g.venue && (g.venue.contacts ?? []).length && `${g.venue.contacts.length} contact${g.venue.contacts.length === 1 ? '' : 's'}`,
                ].filter(Boolean).join(' · ') || 'nothing yet'}
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1">

            {/* Four blocks, because a venue answers four questions and they
                are not asked together: what the ground looks like, what the
                descent is like, what the water and sky are doing, and who to
                ring. Weather is first — it is the one read at 0500. */}
            {g.venue && (g.venue.links ?? []).filter((l) => l.kind === 'weather').length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Weather</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.venue.links.filter((l) => l.kind === 'weather').map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                       className="text-[11px] px-2 py-1 rounded border border-sky-900/60 bg-sky-950/30 text-sky-300 hover:text-white hover:border-sky-700 transition-colors">
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {g.venue && (g.venue.contacts ?? []).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Contacts</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {g.venue.contacts.map((c, i) => (
                    <span key={i} className="text-[11px] text-zinc-400">
                      {c.name}
                      {c.role && <span className="text-zinc-600"> · {c.role}</span>}
                      {(c.phone || c.email) && (
                        <a href={c.phone ? `tel:${c.phone}` : `mailto:${c.email}`}
                           className="ml-1.5 text-zinc-300 hover:text-white underline underline-offset-2">
                          {c.phone || c.email}
                        </a>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {g.venue && (g.venue.links ?? []).filter((l) => l.kind !== 'weather').length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {g.venue.links.filter((l) => l.kind !== 'weather').map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                     className="text-[11px] px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
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
            {g.beta.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Beta</p>
                <div className="space-y-2">
                  {g.beta.map((b) => (
                    <LibraryRow key={b.id} item={b} venues={venues} sites={siteOptions} />
                  ))}
                </div>
              </div>
            )}

            {g.maps.length > 0 && (
              <div className="mt-2">
                {(g.sites.length > 0 || g.beta.length > 0) && (
                  <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Maps</p>
                )}
                <div className="space-y-2">
                  {g.maps.map((m) => (
                    <LibraryRow key={m.id} item={m} venues={venues} sites={siteOptions} />
                  ))}
                </div>
              </div>
            )}

            {g.venue && (
              <AddToPlace
                scope={{ venueId: g.venue.id }}
                place={`venue:${g.venue.id}`}
                placeName={g.venue.name}
              />
            )}
            </div>
          </details>
        ))}
                </div>
              </div>
            ))}
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
