'use client'

import { type SiteOption } from '@/app/admin/schedules/types'
import { type Venue } from '@/lib/library'
import { regionLabel } from '@/lib/regions'

/** One field for "where is this about", at either level.
 *
 * A map is about a place or it is not a map anybody can find: filed nowhere it
 * is offered to no course, which is how eleven of twenty-three ended up
 * unfiled without anyone noticing. So this is one required question rather
 * than two optional ones — an area, or the canyon inside it.
 *
 * The value is `venue:<id>` or `site:<id>`. The server derives the venue from
 * the site when a site is picked, so the two levels can never disagree.
 */
export const placeValue = (venueId: string | null, siteId: string | null) =>
  siteId ? `site:${siteId}` : venueId ? `venue:${venueId}` : ''

export default function PlaceSelect({
  name,
  venues,
  sites,
  value,
  defaultValue,
  onChange,
  required,
  className,
  region,
}: {
  name: string
  venues: Venue[]
  sites: SiteOption[]
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  required?: boolean
  className?: string
  /** The state or country already chosen, when the form asked. Narrows this to
      the handful of places in it rather than every place the company has
      worked — the same bargain the course form makes, for the same reason. */
  region?: string | null
}) {
  // Sites under the venue they belong to, so the list reads the way the place
  // does — "Maui, and these canyons on it" — rather than as two flat lists
  // that happen to be in the same box.
  const byVenue = new Map<string, SiteOption[]>()
  for (const s of sites) {
    if (!s.venue_id) continue
    byVenue.set(s.venue_id, [...(byVenue.get(s.venue_id) ?? []), s])
  }
  const orphans = sites.filter((s) => !s.venue_id)

  // In the chosen state first, then the ones filed under no state at all, then
  // everywhere else. Moved down, never hidden: a venue you cannot pick is
  // worse than a longer list, because it is the moment someone gives up and
  // leaves the map filed nowhere.
  const here = region ? venues.filter((v) => v.region_code === region) : venues
  const unfiled = region ? venues.filter((v) => !v.region_code) : []
  const elsewhere = region ? venues.filter((v) => v.region_code && v.region_code !== region) : []

  const indent = '  '
  const group = (list: Venue[], heading?: string) =>
    list.length === 0 ? null : (
      <optgroup label={heading ?? ' '}>
        {list.flatMap((v) => [
          <option key={v.id} value={`venue:${v.id}`}>{v.name} — the whole area</option>,
          ...(byVenue.get(v.id) ?? []).map((s) => (
            <option key={s.id} value={`site:${s.id}`}>
              {indent}{s.name}{s.kind ? ` · ${s.kind}` : ''}
            </option>
          )),
        ])}
      </optgroup>
    )

  const controlled = value !== undefined
  return (
    <select
      name={name}
      required={required}
      className={className}
      {...(controlled ? { value } : { defaultValue: defaultValue ?? '' })}
      onChange={(e) => onChange?.(e.target.value)}
    >
      <option value="">{required ? '— pick a place —' : '— none —'}</option>
      {group(here, region ? regionLabel(region) || 'Here' : undefined)}
      {group(unfiled, 'No state set')}
      {group(elsewhere, region ? `Outside ${regionLabel(region) || 'there'}` : undefined)}
      {orphans.length > 0 && (
        <optgroup label="Sites with no venue">
          {orphans.map((s) => (
            <option key={s.id} value={`site:${s.id}`}>{s.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
