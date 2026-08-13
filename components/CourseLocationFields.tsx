'use client'

import { useState } from 'react'
import RegionSelect from './RegionSelect'
import { regionLabel } from '@/lib/regions'

export type VenueOption = { id: string; name: string; region_code: string | null }

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-xs text-zinc-400 mb-1'

// Where a course happens, asked in the order it is known: country, then state,
// then the venue inside it. The venue list is the reason the region comes
// first — venues carry a region code, so once the state is set the list is the
// handful of places in that state instead of every venue in the company.
//
// Venues without a region code still appear, under their own group. They are
// unfiled, not elsewhere, and a venue you cannot pick is worse than a longer
// list.
export default function CourseLocationFields({
  venues,
  defaultRegion,
  defaultVenueId,
}: {
  venues: VenueOption[]
  defaultRegion?: string | null
  defaultVenueId?: string | null
}) {
  const [region, setRegion] = useState(defaultRegion ?? '')
  // Controlled, because changing the region moves options between optgroups and
  // an uncontrolled select would quietly drop the venue already chosen — which
  // on the auto-saving details form means saving the loss.
  const [venueId, setVenueId] = useState(defaultVenueId ?? '')

  const here = region ? venues.filter((v) => v.region_code === region) : []
  const elsewhere = venues.filter((v) => !here.includes(v) && v.region_code)
  const unfiled = venues.filter((v) => !v.region_code)

  return (
    <>
      <div>
        <label className={label}>Country / state</label>
        <RegionSelect name="region" defaultValue={defaultRegion} className={input} onChange={setRegion} />
        <p className="text-xs text-zinc-500 mt-1">Narrows the venues below and suggests maps.</p>
      </div>
      <div>
        <label className={label}>Venue</label>
        <select name="venue_id" value={venueId} onChange={(e) => setVenueId(e.target.value)} className={input}>
          <option value="">— none —</option>
          {here.length > 0 && (
            <optgroup label={regionLabel(region)}>
              {here.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </optgroup>
          )}
          {unfiled.length > 0 && (
            <optgroup label="No region set">
              {unfiled.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </optgroup>
          )}
          {elsewhere.length > 0 && (
            <optgroup label="Elsewhere">
              {elsewhere.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </optgroup>
          )}
        </select>
        <p className="text-xs text-zinc-500 mt-1">Brings in its maps, permits and rescue plans.</p>
      </div>
    </>
  )
}
