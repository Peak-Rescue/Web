'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPlaceInline } from '@/app/admin/library/actions'
import { type SiteOption } from '@/app/admin/schedules/types'
import { type Venue } from '@/lib/library'
import { countryName, regionLabel, splitRegion } from '@/lib/regions'

/** One field for "where is this about", at whatever level is known.
 *
 * It used to be two: a state picker and, under it, a place picker that the
 * state narrowed. Two dropdowns for one question, and the answer could be
 * split across them — a map filed to Washington and to nothing else read as
 * unplaced on the venue shelf while insisting it had a region.
 *
 * So: one list, nested the way the venue shelf is. Country, the states inside
 * it, the venues inside those, the canyons inside those — and every line is
 * selectable, because a map of Washington is a real answer and so is a map of
 * one drainage.
 *
 * The value is `region:<code>`, `venue:<id>` or `site:<id>`. The server fills
 * in everything above whichever level was picked: a site answers for its venue
 * and its state, so the levels can never contradict each other.
 *
 * Only regions that something is already filed under are listed. The full
 * country list is a different control for a reason — a native select's
 * type-ahead only jumps within one list, so a flat list of states and
 * countries makes "F" land on Florida with no key that reaches France.
 * Somewhere genuinely new is made with the button underneath.
 */
export const placeValue = (
  region: string | null,
  venueId: string | null,
  siteId: string | null
) => (siteId ? `site:${siteId}` : venueId ? `venue:${venueId}` : region ? `region:${region}` : '')

export default function PlaceSelect({
  name,
  venues,
  sites,
  value,
  defaultValue,
  onChange,
  required,
  className,
}: {
  name: string
  venues: Venue[]
  sites: SiteOption[]
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  required?: boolean
  className?: string
}) {
  const router = useRouter()
  const [making, setMaking] = useState(false)
  const [fresh, setFresh] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sitesOf = new Map<string, SiteOption[]>()
  for (const s of sites) {
    if (!s.venue_id) continue
    sitesOf.set(s.venue_id, [...(sitesOf.get(s.venue_id) ?? []), s])
  }

  // Grouped the way the venue shelf groups: country, then state, then what is
  // in it. A venue with no region sits under "No country set" rather than
  // being dropped — unfiled is a state of things, not a reason to hide them.
  const byRegion = new Map<string, Venue[]>()
  for (const v of venues) byRegion.set(v.region_code ?? '', [...(byRegion.get(v.region_code ?? '') ?? []), v])

  const byCountry = new Map<string, string[]>()
  for (const code of byRegion.keys()) {
    const { country } = splitRegion(code)
    byCountry.set(country, [...(byCountry.get(country) ?? []), code])
  }
  const countries = [...byCountry.entries()]
    .map(([country, codes]) => ({
      country,
      label: country ? countryName(country) : 'No country set',
      codes: codes.sort((a, b) => regionLabel(a).localeCompare(regionLabel(b))),
    }))
    .sort((a, b) => (a.country ? 0 : 1) - (b.country ? 0 : 1) || a.label.localeCompare(b.label))

  const indent = '  '

  async function make(typed: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await createPlaceInline(typed, null)
      if ('error' in r) { setError(r.error); return }
      setFresh(r)
      onChange?.(`venue:${r.id}`)
      setMaking(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

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
          Enter to add, Escape to go back. Which state it is in is set on the venues screen.
        </p>
        {error && <p className="text-[11px] text-pr-red">{error}</p>}
      </div>
    )
  }

  const controlled = value !== undefined
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
          <option value={`venue:${fresh.id}`}>{fresh.name}</option>
        )}
        {countries.map((c) => (
          <optgroup key={c.country || '_none'} label={c.label}>
            {c.country && <option value={`region:${c.country}`}>{c.label} — anywhere in it</option>}
            {c.codes.flatMap((code) => {
              const stateName = code.includes('-') ? regionLabel(code).split(',')[0] : ''
              return [
                ...(stateName
                  ? [<option key={code} value={`region:${code}`}>{indent}{stateName} — anywhere in it</option>]
                  : []),
                ...(byRegion.get(code) ?? []).flatMap((v) => [
                  <option key={v.id} value={`venue:${v.id}`}>{indent}{indent}{v.name}</option>,
                  ...(sitesOf.get(v.id) ?? []).map((s) => (
                    <option key={s.id} value={`site:${s.id}`}>
                      {indent}{indent}{indent}{s.name}{s.kind ? ` · ${s.kind}` : ''}
                    </option>
                  )),
                ]),
              ]
            })}
          </optgroup>
        ))}
        {sites.filter((s) => !s.venue_id).length > 0 && (
          <optgroup label="Canyons with no venue">
            {sites.filter((s) => !s.venue_id).map((s) => (
              <option key={s.id} value={`site:${s.id}`}>{s.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {/* Somewhere new is not an edge case — it is every first course at a
          place. Without this, filing a map of somewhere the list has never
          heard of means abandoning the half-typed map to go and make the
          venue on another screen. */}
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
