'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPlaceInline } from '@/app/admin/library/actions'
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

  const router = useRouter()
  const [making, setMaking] = useState(false)
  const [fresh, setFresh] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function make(typed: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await createPlaceInline(typed, region ?? null)
      if ('error' in r) { setError(r.error); return }
      // Selected on the spot. The list it came from is server-rendered, so the
      // new row is held here until the refresh catches up — without it the
      // picker would snap back to nothing having just been told to pick it.
      setFresh(r)
      onChange?.(`venue:${r.id}`)
      setMaking(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const controlled = value !== undefined

  if (making) {
    return (
      <div className="space-y-1">
        <input
          autoFocus
          disabled={busy}
          placeholder="Name of the place — Fremont Canyon"
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); make((e.target as HTMLInputElement).value) }
            if (e.key === 'Escape') setMaking(false)
          }}
          onBlur={(e) => { if (e.target.value.trim()) make(e.target.value); else setMaking(false) }}
          className={className}
        />
        <p className="text-[11px] text-zinc-600">
          Enter to add{region ? ` in ${regionLabel(region)}` : ''}, Escape to go back. The rest of
          what a venue knows is filled in on the venues screen.
        </p>
        {error && <p className="text-[11px] text-pr-red">{error}</p>}
      </div>
    )
  }

  return (
    <>
    <select
      name={name}
      required={required}
      className={className}
      {...(controlled ? { value } : { defaultValue: defaultValue ?? '' })}
      onChange={(e) => onChange?.(e.target.value)}
    >
      <option value="">{required ? '— pick a place —' : '— none —'}</option>
      {/* Held locally until the server list catches up. */}
      {fresh && !venues.some((v) => v.id === fresh.id) && (
        <option value={`venue:${fresh.id}`}>{fresh.name} — the whole area</option>
      )}
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
    {/* Somewhere new is not an edge case — it is every first course at a
        place. Without this, filing a map of somewhere the list has never
        heard of means abandoning the half-typed map to go and make the venue
        on another screen. */}
    <button
      type="button"
      onClick={() => setMaking(true)}
      className="mt-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
    >
      + Somewhere not on the list
    </button>
    </>
  )
}
