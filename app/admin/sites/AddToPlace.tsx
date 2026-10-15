'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSite, addPlaceLink, addPlaceContact, type PlaceScope } from './actions'
import { SITE_KINDS, type MeetingPointRecord } from '@/lib/sites'
import { createLibraryItem } from '@/app/admin/library/actions'
import { errorFrom } from '@/lib/action-result'

// Adding to a place, asking what it is first.
//
// The level is never asked for — the form is standing in it, and the commonest
// way a map ends up filed nowhere is a form that made the place optional on a
// page that had already answered it.
//
// What is asked for depends entirely on the answer, because the four things a
// place holds are four different shapes. One box taking a title and a URL
// could make a map and a ropewiki link and nothing else: a canyon's beta is a
// paragraph somebody writes, and a contact is a person with a number.

type Kind = 'map' | 'beta' | 'weather' | 'contact'


const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function AddToPlace({
  scope,
  place,
  placeName,
  points = [],
}: {
  scope: PlaceScope
  /** Meetups this canyon could use, so the morning is answered while the
      canyon is being written rather than on a second visit. */
  points?: MeetingPointRecord[]
  /** `venue:<id>` or `region:<code>`, for the library forms that take a place. */
  place: string
  placeName: string
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind | null>(null)
  const [busy, setBusy] = useState(false)
  // A canyon has a route page, a gauge and a driving pin far more often than
  // it has one link, so the form starts with room for the three.
  const [links, setLinks] = useState([
    { label: 'ropewiki', url: '' },
    { label: 'water gauge', url: '' },
    { label: 'trailhead', url: '' },
  ])
  const [error, setError] = useState<string | null>(null)

  // Written beta is a canyon with a write-up on it, and a canyon belongs to a
  // venue. At state level there is nothing for it to hang off, so only the
  // link shape is offered there.
  const atVenue = 'venueId' in scope

  const choices: { k: Kind; label: string }[] = [
    { k: 'map', label: 'Map' },
    { k: 'beta', label: 'Beta' },
    { k: 'weather', label: 'Weather' },
    { k: 'contact', label: 'Contact' },
  ]

  async function run(fn: () => Promise<{ error: string } | void>) {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (r && 'error' in r) { setError(r.error); return }
      setKind(null)
      router.refresh()
    } catch (e) {
      setError(errorFrom(e, 'That didn’t save'))
    } finally {
      setBusy(false)
    }
  }

  if (!kind) {
    return (
      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-zinc-600">Add to {placeName}:</span>
        {choices.map((c) => (
          <button
            key={c.k}
            onClick={() => setKind(c.k)}
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
          >
            {c.label}
          </button>
        ))}
      </div>
    )
  }

  const back = (
    <button
      type="button"
      onClick={() => { setKind(null); setError(null) }}
      disabled={busy}
      className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
    >
      Cancel
    </button>
  )

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
      {/* A map and a ropewiki page are both a link with a name, so they share
          a form and differ only in which type is recorded. */}
      {kind === 'map' && (
        <form action={createLibraryItem} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-center">
          <input type="hidden" name="kind" value="map" />
          <input type="hidden" name="place" value={place} />
          <input type="hidden" name="audience" value="internal" />
          <input name="title" required autoFocus className={input} placeholder="What the map is called" />
          <input name="url" required className={`${input} font-mono`} placeholder="https://…" />
          <button className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors">
            Add map
          </button>
          {back}
        </form>
      )}

      {/* One shape, whether or not it ends up with a link on it. Beta is
          what the descent is like: a paragraph, an address, usually both, and
          asking which before you start made the form's own plumbing into the
          first question. */}
      {kind === 'beta' && (
        // The same fields the canyon's own row carries, so what you fill in
        // here is what you will see when you open it — at every level, because
        // beta is one shape and which level it hangs off is not a reason to
        // ask for less of it. The place is not asked for: the form is standing
        // in it.
        <form action={createSite} className="space-y-2">
            {atVenue ? (
              <input type="hidden" name="venue_id" value={(scope as { venueId: string }).venueId} />
            ) : (
              <input type="hidden" name="region_code" value={(scope as { regionCode: string }).regionCode} />
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={label}>Name</label>
                <input name="name" required autoFocus className={input} placeholder="Keyhole Canyon" />
              </div>
              <div>
                <label className={label}>Kind</label>
                <input name="kind" list="add-site-kinds" defaultValue="canyon" className={input} />
                <datalist id="add-site-kinds">
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
              <div className="sm:col-span-2">
                <label className={label}>Coordinates — of the canyon itself</label>
                <input name="coords" className={input} placeholder="20.8071, -156.1136" />
              </div>
            </div>

            <div>
              <label className={label}>Beta — approach, raps, exit, hazards. The breaks are kept.</label>
              <textarea name="beta" rows={5} className={`${input} resize-y`}
                        placeholder={'Approach:\npark in the small turn-off…\n\nRoute:\n…'} />
            </div>

            <div>
              <label className={label}>Links — route page, gauge, driving pin</label>
              <div className="space-y-1.5">
                {links.map((l, i) => (
                  <div key={i} className="grid grid-cols-[7.5rem_1fr_1.25rem] gap-2 items-center">
                    <input name="link_label" value={l.label} className={input}
                           onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <input name="link_url" value={l.url} spellCheck={false} className={`${input} font-mono`} placeholder="https://…"
                           onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                    <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))}
                            aria-label="Remove link"
                            className="text-xs text-zinc-600 hover:text-red-400 transition-colors">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  + Add link
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors">
                Add beta
              </button>
              {back}
            </div>
          </form>
      )}

      {kind === 'weather' && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-center"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(() => addPlaceLink(scope, {
              url: String(f.get('url')), label: String(f.get('label')), kind: 'weather',
            }))
          }}
        >
          <input name="label" autoFocus className={input} placeholder="Forecast, gauge, avalanche centre" />
          <input name="url" required className={`${input} font-mono`} placeholder="https://…" />
          <button disabled={busy} className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-40">
            Add weather
          </button>
          {back}
        </form>
      )}

      {/* Not a link. The ranger district, the landowner, whoever holds the
          gate code — the local we actually ring about this area. */}
      {kind === 'contact' && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] items-center"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const who = String(f.get('who'))
            run(() => addPlaceContact(scope, {
              name: String(f.get('name')),
              role: String(f.get('role')),
              phone: who.includes('@') ? undefined : who,
              email: who.includes('@') ? who : undefined,
            }))
          }}
        >
          <input name="name" required autoFocus className={input} placeholder="Who — ranger district, landowner" />
          <input name="role" className={input} placeholder="What for — permits, gate code" />
          <input name="who" className={input} placeholder="Phone or email" />
          <button disabled={busy} className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-40">
            Add contact
          </button>
          {back}
        </form>
      )}

      {error && <p className="text-[11px] text-pr-red">{error}</p>}
    </div>
  )
}
