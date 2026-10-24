'use client'

import { useState } from 'react'
import { type ContactHome } from '@/lib/contact-homes'

// One person's details, and everywhere they are known from.
//
// The same panel wherever a contact is written — the client page, a venue, a
// state, and both of a course's two lists — because four editors of one
// record is four places for the question "can this person belong to a client
// *and* a canyon?" to be answered differently. It is answered here, once:
// yes, by ticking both.
//
// The homes are keys (`client:<id>`, `venue:<id>`, `region:<code>`) except on
// a course, which passes its own three shelves under their own names and
// resolves them server-side from the course rather than trusting the browser
// with an id.

export type ContactDetails = {
  name: string
  role: string
  phone: string
  email: string
  note?: string
}

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

export default function ContactFields({
  value,
  onChange,
  homes,
  chosen,
  onChosenChange,
  /** The one you are standing in. Shown ticked and not untickable: filing
      somebody out of the list you opened them from is what the trash is
      for, and it says what it leaves behind. */
  lockedKey,
  catalog,
  onNeedCatalog,
  rolePlaceholder = 'What for',
  withNote = true,
  compact = false,
}: {
  value: ContactDetails
  onChange: (next: ContactDetails) => void
  homes: ContactHome[]
  chosen: string[]
  onChosenChange: (next: string[]) => void
  lockedKey?: string
  /** Everywhere else they could be filed, grouped. Absent where the caller
      offers a fixed set — a course knows its own client and venue and has no
      business offering the other two hundred. */
  catalog?: { clients: ContactHome[]; venues: ContactHome[]; regions: ContactHome[] } | null
  onNeedCatalog?: () => void
  rolePlaceholder?: string
  withNote?: boolean
  compact?: boolean
}) {
  const [adding, setAdding] = useState(false)

  const field = (label: string, key: keyof ContactDetails, extra?: { type?: string; placeholder?: string }) => (
    <label className="block">
      <span className="block text-[11px] text-zinc-500 mb-1">{label}</span>
      <input
        className={input}
        type={extra?.type}
        placeholder={extra?.placeholder}
        value={value[key] ?? ''}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  )

  // Everything the catalog holds that is not already on offer, so the second
  // control never repeats the first.
  const known = new Set(homes.map((h) => h.key))
  const more = catalog
    ? [
        { group: 'Clients', items: catalog.clients.filter((c) => !known.has(c.key)) },
        { group: 'Venues', items: catalog.venues.filter((v) => !known.has(v.key)) },
        { group: 'States and countries', items: catalog.regions.filter((r) => !known.has(r.key)) },
      ].filter((g) => g.items.length > 0)
    : []

  return (
    <div className={`grid grid-cols-1 gap-2 ${compact ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
      <div className={compact ? 'sm:col-span-4' : 'sm:col-span-3'}>
        <span className="block text-[11px] text-zinc-500 mb-1">Filed with</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
          {homes.map((h) => {
            const locked = h.key === lockedKey
            return (
              <label
                key={h.key}
                className={`flex items-center gap-1.5 text-xs ${locked ? 'text-zinc-500' : 'text-zinc-300 cursor-pointer'}`}
                title={locked ? 'The list you are on — use the trash to take them off it' : undefined}
              >
                <input
                  type="checkbox"
                  className="accent-red-600"
                  disabled={locked}
                  checked={locked || chosen.includes(h.key)}
                  onChange={() =>
                    onChosenChange(
                      chosen.includes(h.key) ? chosen.filter((k) => k !== h.key) : [...chosen, h.key]
                    )
                  }
                />
                {h.label}
              </label>
            )
          })}

          {/* A client on a venue's page, a canyon on a client's. Fetched when
              it is asked for: every client and every venue is a long list to
              carry on a page that usually only reads a phone number. */}
          {onNeedCatalog && !adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true)
                if (!catalog) onNeedCatalog()
              }}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + Somewhere else
            </button>
          )}
          {adding && (
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
              value=""
              onChange={(e) => {
                if (e.target.value) onChosenChange([...chosen, e.target.value])
                setAdding(false)
              }}
            >
              <option value="">{catalog ? 'Pick a client, venue or state…' : 'Loading…'}</option>
              {catalog && more.length === 0 && <option value="" disabled>Nowhere else to file them</option>}
              {more.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((i) => (
                    <option key={i.key} value={i.key}>{i.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </div>

      {field('Name', 'name')}
      {field('Role', 'role', { placeholder: rolePlaceholder })}
      {field('Phone', 'phone', { type: 'tel' })}
      {field('Email', 'email', { type: 'email' })}
      {withNote && field('Note', 'note', { placeholder: 'Best hours, gate code…' })}
    </div>
  )
}
