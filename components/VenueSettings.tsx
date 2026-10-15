'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateVenue, deleteVenue } from '@/app/admin/library/actions'
import { type Venue, type VenueLink, type VenueContact, type VenueLinkKind } from '@/lib/library'
import RegionSelect from '@/components/RegionSelect'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

// What a venue is, as opposed to what is in it.
//
// Its name, which state it sits in, whose site it is, its standing links and
// the locals to ring. Lifted out of the venues page so the places shelf can
// carry it too: renaming a venue was the one thing about a venue that could
// only be done on a second screen, which is the kind of door the rest of this
// restructure spent its time closing.
export default function VenueSettings({
  venue,
  itemCount,
  onDone,
}: {
  venue: Venue
  /** Library rows filed to it, named in the delete confirm so "permanently"
      is not read as taking them with it. */
  itemCount: number
  onDone?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: venue.name,
    region: venue.region ?? '',
    region_code: venue.region_code ?? '',
    client_name: venue.client_name ?? '',
    notes: venue.notes ?? '',
  })
  const [links, setLinks] = useState<VenueLink[]>(venue.links ?? [])
  const [contacts, setContacts] = useState<VenueContact[]>(venue.contacts ?? [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  const setOpen = (v: boolean) => { if (!v) onDone?.() }

  return (
      <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Name</label>
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Region</label>
          <input className={input} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
        </div>
        {/* The code, not the label above it: this is what puts the venue in a
            state's list when a course is created there. */}
        <div className="sm:col-span-2">
          <label className={label}>Country / state</label>
          <RegionSelect
            defaultValue={form.region_code}
            className={input}
            onChange={(code) => setForm({ ...form, region_code: code })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Client</label>
          <input className={input} value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
        </div>
        {/* The region's standing links. Weather, the permit portal, the
            hospital, the drive from the airport — one URL and a label each,
            none of it teaching material, and before this they were typed
            onto a course as an update and died with it. The canyon's own
            route page and gauge stay on the site. */}
        <div className="sm:col-span-2">
          <label className={label}>Links — weather, permits, hospital, getting there</label>
          <div className="space-y-1.5">
            {links.length > 0 && (
              <div className="grid grid-cols-[6rem_minmax(9rem,1fr)_minmax(0,1.6fr)_1.25rem] gap-2 px-0.5">
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Block</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Forecast, permit portal…</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Address</span>
              </div>
            )}
            {links.map((l, i) => (
              <div key={i} className="grid grid-cols-[6rem_minmax(9rem,1fr)_minmax(0,1.6fr)_1.25rem] gap-2 items-center">
                <select
                  className={input}
                  value={l.kind ?? 'other'}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, kind: e.target.value as VenueLinkKind } : x)))}
                >
                  <option value="weather">Weather</option>
                  <option value="access">Access</option>
                  <option value="other">Other</option>
                </select>
                <input
                  className={input}
                  value={l.label}
                  placeholder="area weather"
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className={`${input} font-mono text-[12px]`}
                  value={l.url}
                  placeholder="https://…"
                  spellCheck={false}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                <button
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                  aria-label={`Remove ${l.label || 'link'}`}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => setLinks([...links, { url: '', label: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              + Add link
            </button>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Notes</label>
          <textarea rows={2} className={`${input} resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {/* Not links. The ranger district, the landowner, whoever holds the
            gate code — a name and a number, which squeezed into a URL field
            ends up in somebody's phone and nowhere else. */}
        <div className="sm:col-span-2">
          <label className={label}>Contacts — who to ring about this place</label>
          <div className="space-y-1.5">
            {contacts.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_1fr_1.25rem] gap-2 px-0.5">
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Who</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Role</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">Phone or email</span>
              </div>
            )}
            {contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.25rem] gap-2 items-center">
                <input className={input} value={c.name} placeholder="Ranger district"
                  onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={input} value={c.role ?? ''} placeholder="permits"
                  onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                <input className={input} value={c.phone || c.email || ''} placeholder="307…"
                  onChange={(e) => {
                    const v = e.target.value
                    const isEmail = v.includes('@')
                    setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: isEmail ? '' : v, email: isEmail ? v : '' } : x)))
                  }} />
                <button
                  onClick={() => setContacts(contacts.filter((_, j) => j !== i))}
                  aria-label={`Remove ${c.name || 'contact'}`}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => setContacts([...contacts, { name: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              + Add contact
            </button>
          </div>
        </div>

        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            onClick={() => run(async () => { await updateVenue(venue.id, { ...form, links, contacts }); setOpen(false) })}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => run(() => updateVenue(venue.id, { active: !venue.active }))}
            disabled={busy}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {venue.active ? 'Mark inactive' : 'Reactivate'}
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${venue.name}? Its ${itemCount} item(s) stay in the library but lose the venue link.`)) {
                run(() => deleteVenue(venue.id))
              }
            }}
            disabled={busy}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto"
          >
            Delete
          </button>
        </div>
      </div>
  )
}
