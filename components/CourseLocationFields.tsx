'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import RegionSelect from './RegionSelect'
import { createPlaceInline } from '@/app/admin/library/actions'
import { regionLabel, splitRegion } from '@/lib/regions'

export type VenueOption = { id: string; name: string; region_code: string | null }

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-xs text-zinc-400 mb-1'

// Where a course happens, asked in the order it is known: country, then state,
// then the venue inside it. The venue list is the reason the region comes
// first — venues carry a region code, so once the state is set the list is the
// handful of places in that state instead of every venue in the company.
//
// Venues in other states are left out once the state is set: the portal knows
// where every filed venue is, so listing them only buries the right one. The
// venue already chosen stays whatever its state, or the auto-saving form would
// save its loss. Venues without a region code still appear — they are unfiled,
// not elsewhere — and a state with no venues yet gets a way to add one there.
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
  const [fresh, setFresh] = useState<VenueOption | null>(null)
  const [making, setMaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const announce = useRef(false)
  const router = useRouter()

  // A venue made here is picked by setting state, which fires no change event,
  // so the form would never hear of it. Announce it once it has rendered.
  useEffect(() => {
    if (!announce.current) return
    announce.current = false
    selectRef.current?.dispatchEvent(new Event('change', { bubbles: true }))
  }, [venueId])

  const all = fresh && !venues.some((v) => v.id === fresh.id) ? [...venues, fresh] : venues
  // A country-level answer ('FR', 'US') takes in every state inside it.
  const inRegion = (code: string | null) =>
    !!code && (code === region || (!region.includes('-') && splitRegion(code).country === region))
  const here = region ? all.filter((v) => inRegion(v.region_code)) : []
  const elsewhere = all.filter(
    (v) => !here.includes(v) && v.region_code && (!region || v.id === venueId)
  )
  const unfiled = all.filter((v) => !v.region_code)

  async function make(typed: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await createPlaceInline(typed, region || null)
      if ('error' in r) { setError(r.error); return }
      setFresh({ ...r, region_code: region || null })
      announce.current = true
      setVenueId(r.id)
      setMaking(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div>
        <label className={label}>Country / state</label>
        <RegionSelect name="region" defaultValue={defaultRegion} className={input} onChange={setRegion} />
        <p className="text-xs text-zinc-500 mt-1">Narrows the venues below and suggests maps.</p>
      </div>
      <div>
        <label className={label}>Venue</label>
        <select ref={selectRef} name="venue_id" value={venueId} onChange={(e) => setVenueId(e.target.value)} className={input}>
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
            <optgroup label={region ? 'Chosen, but not in this state' : 'Elsewhere'}>
              {elsewhere.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </optgroup>
          )}
        </select>
        {making ? (
          <input
            autoFocus
            disabled={busy}
            placeholder="Name of the venue — Bridger Bowl"
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); make((e.target as HTMLInputElement).value) }
              if (e.key === 'Escape') setMaking(false)
            }}
            onBlur={(e) => { if (e.target.value.trim()) make(e.target.value); else setMaking(false) }}
            className={`${input} mt-1`}
          />
        ) : (
          region && (
            <button
              type="button"
              onClick={() => setMaking(true)}
              className="mt-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
            >
              + New venue in {regionLabel(region).split(',')[0]}
            </button>
          )
        )}
        {error && <p className="text-[11px] text-pr-red mt-1">{error}</p>}
        <p className="text-xs text-zinc-500 mt-1">Brings in its maps, permits and rescue plans.</p>
      </div>
    </>
  )
}
