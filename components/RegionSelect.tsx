'use client'

import { useState } from 'react'
import { COUNTRIES, SUBDIVISIONS, splitRegion } from '@/lib/regions'

// One selector for "where is this?", used by courses, venues and library maps so
// all three speak the same codes.
//
// Country first, then the state — one flat list per step, because a native
// select's type-ahead only jumps within the list it is on. The old single list
// grouped states above countries, so typing "F" landed on Florida and there was
// no key that would ever reach France.
//
// Only countries we hold subdivisions for show a second step; everywhere else
// the country code is the whole answer. The stored value is one field either
// way ('US-WA', 'FR'), carried by a hidden input so plain form posts are
// unchanged.
export default function RegionSelect({
  name,
  defaultValue,
  className,
  onChange,
}: {
  name?: string
  defaultValue?: string | null
  className?: string
  onChange?: (code: string) => void
}) {
  const initial = splitRegion(defaultValue)
  // Nearly every course runs in the US, so an unset field opens on the state
  // list rather than on a country nobody has to pick. Only the country is
  // presumed — nothing is stored until a state is chosen, so this never puts a
  // place on a record by itself.
  const [country, setCountry] = useState(initial.country || 'US')
  const [sub, setSub] = useState(initial.sub)

  const subdivisions = SUBDIVISIONS[country]
  // A country with subdivisions isn't a place on its own — "US" is not a region
  // any map or course can match on — so it submits nothing until a state is set.
  const value = subdivisions ? sub : country

  function pick(nextCountry: string, nextSub: string) {
    setCountry(nextCountry)
    setSub(nextSub)
    onChange?.(SUBDIVISIONS[nextCountry] ? nextSub : nextCountry)
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <select
        value={country}
        onChange={(e) => pick(e.target.value, '')}
        className={className}
        aria-label="Country"
      >
        <option value="">— not set —</option>
        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
      {subdivisions && (
        <select
          value={sub}
          onChange={(e) => pick(country, e.target.value)}
          className={`${className ?? ''} mt-2`}
          aria-label={country === 'US' ? 'State' : 'Province'}
        >
          <option value="">{country === 'US' ? '— select a state —' : '— select a province —'}</option>
          {subdivisions.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      )}
    </>
  )
}
