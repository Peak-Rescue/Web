'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSite, addPlaceLink, type PlaceScope } from './actions'
import { createLibraryItem } from '@/app/admin/library/actions'
import { errorFrom } from '@/lib/action-result'
import TrashIcon from '@/components/TrashIcon'
import ContactEditor from '@/components/ContactEditor'

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

type Kind = 'map' | 'beta' | 'plan' | 'permit' | 'weather' | 'contact'


const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function AddToPlace({
  scope,
  place,
  placeName,
}: {
  scope: PlaceScope
  /** `venue:<id>` or `region:<code>`, for the library forms that take a place. */
  place: string
  placeName: string
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind | null>(null)
  const [busy, setBusy] = useState(false)
  // One blank row. Three suggested labels made this a canyon form — a
  // ropewiki page and a water gauge are not what every place has — and this
  // is the only shape there is for beta, at every level.
  const [links, setLinks] = useState([{ label: '', url: '' }])
  const [error, setError] = useState<string | null>(null)

  // Written beta is a canyon with a write-up on it, and a canyon belongs to a
  // venue. At state level there is nothing for it to hang off, so only the
  // link shape is offered there.
  const atVenue = 'venueId' in scope

  const choices: { k: Kind; label: string }[] = [
    { k: 'map', label: 'Map' },
    { k: 'beta', label: 'Beta' },
    // The evac and risk plan for this place. It was filed under Documents
    // with the company's blank templates, which is where you would look for
    // it only if you already knew it was not here.
    // Where the hospital is, how long the drive is, how somebody gets to it.
    // The same fact every time a course goes there, and until now written
    // fresh per delivery and then lost — "we had one last time" with no way
    // back to it.
    { k: 'plan', label: 'MEDEVAC plan' },
    // Arrives admins-only and never reaches a course. A permit is the one
    // kind of place material where being seen by the wrong person is the
    // failure, so it is not a box anyone has to remember to tick.
    { k: 'permit', label: 'Permit' },
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
      {(kind === 'map' || kind === 'plan' || kind === 'permit') && (
        <form action={createLibraryItem} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-center">
          <input type="hidden" name="kind" value={{ map: 'map', plan: 'medevac', permit: 'permit' }[kind as 'map' | 'plan' | 'permit']} />
          <input type="hidden" name="place" value={place} />
          {/* One field, not two: a form carrying `audience` twice posts the
              first and the second reads as the answer. */}
          <input type="hidden" name="audience" value={kind === 'permit' ? 'admin' : 'internal'} />
          <input name="title" required autoFocus className={input}
                 placeholder={{ map: 'What the map is called', plan: 'What the plan is called', permit: 'What the permit is called' }[kind as 'map' | 'plan' | 'permit']} />
          <input name="url" required className={`${input} font-mono`} placeholder="https://…" />
          <button className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors">
            Add {{ map: 'map', plan: 'plan', permit: 'permit' }[kind as 'map' | 'plan' | 'permit']}
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
                <input name="name" required autoFocus className={input} />
              </div>
              <div>
                <label className={label}>Coordinates</label>
                <input name="coords" className={input} />
              </div>
            </div>

            <div>
              <label className={label}>Beta</label>
              <textarea name="beta" rows={5} className={`${input} resize-y`} />
            </div>

            <div>
              <label className={label}>Links</label>
              <div className="space-y-1.5">
                {links.map((l, i) => (
                  <div key={i} className="grid grid-cols-[minmax(9rem,1fr)_minmax(0,1.6fr)_1.25rem] gap-2 items-center">
                    <input name="link_label" value={l.label} className={input}
                           onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <input name="link_url" value={l.url} spellCheck={false} className={`${input} font-mono`}
                           onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                    <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))}
                            aria-label="Remove link"
                            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"><TrashIcon /></button>
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

      {/* The same editor the list above opens, and the same one a course
          and a client use: a contact is a person with homes, not three
          boxes. It is here as well because this row is where every other
          thing a place holds is added from, and Contact missing from it
          read as a place that cannot have one. */}
      {kind === 'contact' && (
        <ContactEditor
          scope={scope}
          scopeLabel={placeName}
          rolePlaceholder="Ranger district, landowner…"
          onDone={() => setKind(null)}
        />
      )}

      {error && <p className="text-[11px] text-pr-red">{error}</p>}
    </div>
  )
}
