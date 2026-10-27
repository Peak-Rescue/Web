import SiteRow from './SiteRow'
import ContactBook from '@/components/ContactBook'
import { type BookContact } from '@/app/admin/contacts/actions'
import JumpToNewRow from '@/components/JumpToNewRow'
import AddToPlace from './AddToPlace'
import AddLevel from './AddLevel'
import EditVenue from './EditVenue'
import PlaceLinkChip from './PlaceLinkChip'
import RemovePlace from './RemovePlace'
import { type Site } from '@/lib/sites'
import { type LibraryItem, type Venue, type VenueContact, type VenueLink } from '@/lib/library'
import { countryName, regionLabel, splitRegion, SUBDIVISIONS } from '@/lib/regions'
import LibraryRow from '@/app/admin/library/LibraryRow'
import ItemRow from '@/app/admin/library/ItemRow'
import { type SiteOption } from '@/app/admin/schedules/types'


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
  maps,
  regionInfo,
  contactsByOwner,
  canEdit = true,
  dayCount,
  added,
}: {
  sites: Site[]
  venues: Venue[]
  /** The maps, read beside the places they are about rather than on a shelf
      of their own answering the same question differently. */
  maps: LibraryItem[]
  /** Weather, contacts and notes held against a state or a country. */
  regionInfo: Map<string, { links: VenueLink[]; contacts: VenueContact[]; notes: string | null }>
  /** People by the place that knows them, keyed `venue:<id>` or
      `region:<code>` (267). */
  contactsByOwner: Map<string, BookContact[]>
  /** False for an instructor reading the shelf. They get every level and
      everything filed on it — the same page, with the forms taken out. The
      alternative was a flat list of canyons, which showed one venue's beta
      and nothing about where anything was. */
  canEdit?: boolean
  /** How many schedule days point at each site. */
  dayCount: Map<string, number>
  /** A site just created, to scroll to. */
  added?: string
}) {
  // Grouped by venue, because that's how you go looking: "what have we got on
  // Maui?" rather than "show me every canyon we've ever run".
  const byVenue = new Map<string, Site[]>()
  // A canyon with no venue over it names its state instead, and is read under
  // that state rather than falling into the unfiled pile.
  const sitesAtRegion = new Map<string, Site[]>()
  for (const s of sites) {
    if (!s.venue_id && s.region_code) {
      sitesAtRegion.set(s.region_code, [...(sitesAtRegion.get(s.region_code) ?? []), s])
      continue
    }
    const k = s.venue_id ?? ''
    byVenue.set(k, [...(byVenue.get(k) ?? []), s])
  }
  // Two blocks, because they answer different questions about the same place:
  // a map shows you the ground, beta tells you what the descent is like.
  const mapsByVenue = new Map<string, LibraryItem[]>()
  const betaByVenue = new Map<string, LibraryItem[]>()
  const plansByVenue = new Map<string, LibraryItem[]>()
  const permitsByVenue = new Map<string, LibraryItem[]>()
  for (const m of maps) {
    // Filed to a state rather than a venue is still filed. These are drawn
    // under their state by RegionBlocks, and grouping them here as well put
    // them under "Nowhere yet" at the same time — the same item in two
    // places, one of them saying it was lost.
    if (!m.venue_id && !m.site_id && m.region) continue
    const k = m.venue_id ?? ''
    // The med plan and the evac plan are one answer to one question — where
    // the hospital is and how you get someone to it — and are often one
    // document: the Maui one is called Medical-MEDEVAC-Plan. They are two
    // types because they are sometimes written apart, and one block because
    // they are always read together.
    //
    // A permit is not among them. It is read months earlier by somebody
    // deciding whether the course can run at all.
    const into = m.kind === 'route'
      ? betaByVenue
      : m.kind === 'medevac'
        ? plansByVenue
        : m.kind === 'permit'
          ? permitsByVenue
          : mapsByVenue
    into.set(k, [...(into.get(k) ?? []), m])
  }
  // Every venue gets a heading. It used to have to earn one by holding
  // something — a canyon, a map, a link — which made a venue you had just
  // created invisible on the page you created it from, with nothing saying
  // why and nowhere to put the first thing in it. An empty venue is exactly
  // where something is about to go.
  const groups: {
    key: string; name: string; venue: Venue | null
    sites: Site[]; maps: LibraryItem[]; beta: LibraryItem[]; plans: LibraryItem[]; permits: LibraryItem[]
  }[] = [
    ...venues
      .map((v) => ({
        key: v.id,
        name: v.name,
        venue: v as Venue | null,
        sites: byVenue.get(v.id) ?? [],
        maps: mapsByVenue.get(v.id) ?? [],
        beta: betaByVenue.get(v.id) ?? [],
        plans: plansByVenue.get(v.id) ?? [],
        permits: permitsByVenue.get(v.id) ?? [],
      })),
    ...(byVenue.has('') || mapsByVenue.has('') || betaByVenue.has('')
      ? [{
          key: '_none',
          name: 'Not filed anywhere yet',
          venue: null,
          sites: byVenue.get('') ?? [],
          maps: mapsByVenue.get('') ?? [],
          beta: betaByVenue.get('') ?? [],
          plans: plansByVenue.get('') ?? [],
          permits: permitsByVenue.get('') ?? [],
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
  // A state exists because somebody added it, not because a venue is in it.
  // The list was built from venues alone, so adding Vermont wrote the row and
  // showed nothing — and the only place to put the first venue in Vermont was
  // under a heading that would not appear until something was already there.
  for (const code of [...regionInfo.keys(), ...atRegion.keys()]) {
    if (!regions.has(code)) regions.set(code, [])
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


  // An admin gets the row that can be opened and changed; everyone else gets
  // the row. Both are the library's own, so a map reads the same here as it
  // does on the shelf it came from.
  const PlaceItem = ({ item }: { item: LibraryItem }) =>
    canEdit
      ? <LibraryRow item={item} venues={venues} sites={siteOptions} />
      : <ItemRow item={item} venueName={item.venue_id ? venues.find((v) => v.id === item.venue_id)?.name ?? null : null} />

  // The same four blocks a venue has, for a state or a country. Maps and beta
  // are library rows filed to the code; weather and contacts are region_info,
  // which is keyed by the same code so there is no second list of states to
  // keep in step.
  const RegionBlocks = ({ code }: { code: string }) => {
    const items = atRegion.get(code) ?? []
    const info = regionInfo.get(code)
    const canyons = sitesAtRegion.get(code) ?? []
    const beta = items.filter((i) => i.kind === 'route')
    const plans = items.filter((i) => i.kind === 'medevac')
    const permits = items.filter((i) => i.kind === 'permit')
    const maps = items.filter((i) => !['route', 'medevac', 'permit'].includes(i.kind))
    const weather = (info?.links ?? []).filter((l) => l.kind === 'weather')
    const other = (info?.links ?? []).filter((l) => l.kind !== 'weather')
    const contacts = contactsByOwner.get(`region:${code}`) ?? []
    // Always rendered, because the add forms live here too: a state with
    // nothing in it is exactly where something is about to be put.
    const anything =
      weather.length > 0 || contacts.length > 0 || other.length > 0 ||
      canyons.length > 0 || beta.length > 0 || plans.length > 0 ||
      permits.length > 0 || maps.length > 0

    return (
      <div className="mb-2 space-y-2">
        {/* What filing something here means, where the filing happens. The
            level is the claim "this is true for everything under here", and
            that claim is the whole reason there are levels. */}
        {anything && (
          <p className="text-[10px] text-zinc-600">
            Filed to the {code.includes('-') ? 'state' : 'country'} — every venue and course under it inherits this.
          </p>
        )}
        {weather.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {weather.map((l, i) => (
              <PlaceLinkChip key={i} scope={{ regionCode: code }} link={l} tone="weather" />
            ))}
          </div>
        )}
        {/* Drawn only when there is somebody, like Weather and Maps and
            every other block here. An empty one announced "Nobody on file
            yet" under a heading, which is a sentence about nothing — the
            page does not say a place has no maps either. */}
        {contacts.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Contacts</p>
            <ContactBook
              scope={{ regionCode: code }}
              scopeLabel={regionLabel(code) || code}
              contacts={contacts}
              rolePlaceholder="Ranger district, landowner…"
              canAdd={false}
              canEdit={canEdit}
            />
          </div>
        )}
        {other.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {other.map((l, i) => (
              <PlaceLinkChip key={i} scope={{ regionCode: code }} link={l} />
            ))}
          </div>
        )}
        {(canyons.length > 0 || beta.length > 0) && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Beta</p>
            <div className="space-y-2">
              {canyons.map((x) => (
                <SiteRow key={x.id} site={x} venues={venues} dayCount={dayCount.get(x.id) ?? 0} canEdit={canEdit} />
              ))}
              {beta.map((b) => <PlaceItem key={b.id} item={b} />)}
            </div>
          </div>
        )}
        {plans.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">MEDEVAC</p>
            <div className="space-y-2">
              {plans.map((x) => <PlaceItem key={x.id} item={x} />)}
            </div>
          </div>
        )}
        {permits.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Permits</p>
            <div className="space-y-2">
              {permits.map((x) => <PlaceItem key={x.id} item={x} />)}
            </div>
          </div>
        )}
        {maps.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Maps</p>
            <div className="space-y-2">
              {maps.map((m) => <PlaceItem key={m.id} item={m} />)}
            </div>
          </div>
        )}
        {canEdit && (
          <AddToPlace scope={{ regionCode: code }} place={`region:${code}`} placeName={regionLabel(code) || code} />
        )}
      </div>
    )
  }


  return (
    <>
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
            <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-3 pb-2 border-b border-zinc-700">
              {c.label}
              {/* The level, said rather than inferred. Indentation and colour
                  tell three levels apart once you know there are three; the
                  word is for everyone else, and for the question this page
                  is actually asked — what does this thing cover. */}
              <span className="text-[10px] font-normal uppercase tracking-wide text-zinc-600">country</span>
              {canEdit && c.country && !c.hasStates && (
                <span className="ml-auto flex items-center shrink-0">
                  <RemovePlace what={c.label} regionCode={c.country} />
                </span>
              )}
            </h2>
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
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-pr-red-light/80 mb-2">
                    {sub.label || 'No state set'}
                    <span className="text-[10px] font-normal tracking-wide text-zinc-600 normal-case">state</span>
                    {canEdit && sub.code && (
                      <span className="ml-auto flex items-center shrink-0">
                        <RemovePlace what={sub.label || sub.code} regionCode={sub.code} />
                      </span>
                    )}
                  </p>
                )}
                {/* The state's own weather, contacts, maps and plans — and the
                    way to add them. The country had this block and the state
                    did not, so a permit true for all of Utah could be filed
                    only by pretending it belonged to one venue in it. */}
                {/* Not where the sub is the country — Bahamas has no
                    states, so its venues are filed to BS and the country's
                    own block and this one were the same block drawn twice.
                    Two "Nobody on file yet", two add rows, one place. */}
                {sub.code && sub.code !== c.country && <RegionBlocks code={sub.code} />}
                <div className="space-y-2">
        {sub.groups.map((g) => (
          <details key={g.key} className="group/venue rounded-lg border border-zinc-800 bg-zinc-900">
            <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/60 transition-colors">
              <span aria-hidden className="text-zinc-600 text-xs transition-transform group-open/venue:rotate-90">▶</span>
              <span className="text-sm font-medium text-zinc-200">{g.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-zinc-600">venue</span>
              {/* At the end of the row, where a canyon's and a document's
                  are. Beside the title they read as part of the name, and
                  the page had its verbs in two places. */}
              {canEdit && g.venue && (
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <EditVenue venue={g.venue} />
                  <RemovePlace what={g.venue.name} venueId={g.venue.id} />
                </span>
              )}
              {/* No tally. "1 beta · 1 map" told you a venue had something
                  without telling you what, and you were about to open it
                  either way. */}
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
                    <PlaceLinkChip key={i} scope={{ venueId: g.venue!.id }} link={l} tone="weather" />
                  ))}
                </div>
              </div>
            )}

            {g.venue && (contactsByOwner.get(`venue:${g.venue.id}`) ?? []).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Contacts</p>
                <ContactBook
                  scope={{ venueId: g.venue.id }}
                  scopeLabel={g.venue.name}
                  contacts={contactsByOwner.get(`venue:${g.venue.id}`) ?? []}
                  rolePlaceholder="Ranger district, landowner…"
                  canAdd={false}
                  canEdit={canEdit}
                />
              </div>
            )}

            {g.venue && (g.venue.links ?? []).filter((l) => l.kind !== 'weather').length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {g.venue.links.filter((l) => l.kind !== 'weather').map((l, i) => (
                  <PlaceLinkChip key={i} scope={{ venueId: g.venue!.id }} link={l} />
                ))}
              </div>
            )}

            {/* One Beta block, both shapes in it. A canyon with a write-up and
                a link to somebody else's write-up are the same answer to the
                same question, and they were in two places on the page: the
                canyons in an unlabelled list, the links under a heading. Which
                shape a given one happens to be is not a reason to look
                somewhere else for it. */}
            {(g.sites.length > 0 || g.beta.length > 0) && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Beta</p>
                <div className="space-y-2">
                  {g.sites.map((s) => (
                    <SiteRow key={s.id} site={s} venues={venues} dayCount={dayCount.get(s.id) ?? 0} canEdit={canEdit} />
                  ))}
                  {g.beta.map((b) => (
                    <PlaceItem key={b.id} item={b} />
                  ))}
                </div>
              </div>
            )}

            {g.plans.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">MEDEVAC</p>
                <div className="space-y-2">
                  {g.plans.map((x) => (
                    <PlaceItem key={x.id} item={x} />
                  ))}
                </div>
              </div>
            )}

            {g.permits.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Permits</p>
                <div className="space-y-2">
                  {g.permits.map((x) => (
                    <PlaceItem key={x.id} item={x} />
                  ))}
                </div>
              </div>
            )}

            {g.maps.length > 0 && (
              <div className="mt-2">
                {/* Always labelled. The heading used to appear only when
                    something else was above it, so a venue holding one map and
                    nothing else showed a bare row and no word for what it was. */}
                <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Maps</p>
                <div className="space-y-2">
                  {g.maps.map((m) => (
                    <PlaceItem key={m.id} item={m} />
                  ))}
                </div>
              </div>
            )}


            {canEdit && g.venue && (
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
                <div className="mt-2">
                  {canEdit && <AddLevel level="venue" country={sub.code || undefined} />}
                </div>
              </div>
            ))}
            {c.hasStates && (
              <div className="mt-2">
                {canEdit && <AddLevel level="state" country={c.country} />}
              </div>
            )}
          </div>
        ))}
        {canEdit && <AddLevel level="country" />}
        {sites.length === 0 && maps.length === 0 && <p className="text-sm text-zinc-500">Nothing filed by place yet.</p>}
      </div>


    </>
  )
}
