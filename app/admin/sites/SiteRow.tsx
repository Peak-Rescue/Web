'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { updateSite, deleteSite } from './actions'
import { type Site, type SiteLink, type MeetingPointRecord } from '@/lib/sites'
import { type Venue } from '@/lib/library'
import CloseButton from '@/components/CloseButton'
import TrashIcon from '@/components/TrashIcon'
import MeetingPointForm from './MeetingPointForm'
import { errorFrom } from '@/lib/action-result'

// A link's address is typed by hand, so it is not always a URL. Naming it
// must not be the thing that takes the row down.
const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function SiteRow({
  site, venues, meetup, points = [], canEdit = true,
}: {
  site: Site
  venues: Venue[]
  /** Where we meet for this canyon. Filed from a schedule day, so the row is
      the one place it can be read back without opening a course. */
  meetup: MeetingPointRecord | null
  /** Every meetup a canyon could use as its usual, for the edit form. */
  points?: MeetingPointRecord[]
  /** False for anyone who is not an admin: the beta is worth reading to
      everyone teaching off it, and setting a canyon up is not their errand. */
  canEdit?: boolean
}) {
  const router = useRouter()
  // Arriving from a schedule day's "Edit beta" opens this row. The hash is the
  // browser's state rather than React's — and it never reaches the server, so
  // it is subscribed to rather than seeded into state, which is what keeps the
  // first client render agreeing with the one the server sent.
  const targeted = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange)
      return () => window.removeEventListener('hashchange', onChange)
    },
    () => window.location.hash === `#site-${site.id}`,
    () => false
  )
  // Null until someone actually clicks: the link decides whether this row is
  // open, right up until the reader disagrees, and then they decide.
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? targeted
  // Opening a canyon reads it. Editing is a second press, and used to be the
  // only one: the beta — the thing the row exists for — could be read only by
  // opening the form that writes it, in a textarea ten rows deep.
  const [editing, setEditing] = useState(false)
  const [editingMeetup, setEditingMeetup] = useState(false)
  const [makingMeetup, setMakingMeetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: site.name,
    venue_id: site.venue_id ?? '',
    beta: site.beta ?? '',
    meeting_point_id: site.meeting_point_id ?? '',
    coords: site.coords ?? '',
  })
  const [links, setLinks] = useState<SiteLink[]>(site.links ?? [])

  // A row that opens offscreen looks exactly like a link that did nothing.
  useEffect(() => {
    if (!targeted) return
    document.getElementById(`site-${site.id}`)?.scrollIntoView({ block: 'center' })
  }, [targeted, site.id])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    // Caught: a throw in an async handler is an unhandled rejection, which
    // draws nothing and reads as a button that does not work.
    try { await fn(); router.refresh() }
    catch (e) { setError(errorFrom(e, 'That didn’t save')) }
    finally { setBusy(false) }
  }

  const venue = venues.find((v) => v.id === site.venue_id)
  // The meetup the edit form's picker is on — the saved one until it changes.
  const pickedMeetup = points.find((p) => p.id === form.meeting_point_id)
    ?? (meetup?.id === form.meeting_point_id ? meetup : null)
  // The first line of the beta is the scope line — "Upper Emerald only, to the
  // footbridge" — which is exactly what tells two sites at one canyon apart.
  const gist = (site.beta ?? '').split('\n').find((l) => l.trim()) ?? ''

  return (
    <div id={`site-${site.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 scroll-mt-6">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* The title opens it, the way a document's title on any other
                shelf opens the document. A row whose name is not the thing
                you press is a row you have to learn. */}
            <button
              type="button"
              onClick={() => { setToggled(!open); if (open) setEditing(false) }}
              className="text-sm font-medium text-left hover:text-pr-red-light transition-colors"
            >
              {site.name}
            </button>
            {!site.active && <span className="text-[10px] text-zinc-600">inactive</span>}
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
            {venue?.name ?? 'no venue'}
            {gist && <span className="text-zinc-700"> · {gist}</span>}
          </p>
        </div>
        {open ? (
          <>
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0"
              >
                Edit
              </button>
            )}
            <CloseButton onClick={() => { setToggled(false); setEditing(false) }} />
          </>
        ) : canEdit ? (
          <button
            onClick={() => { setToggled(true); setEditing(true) }}
            className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            Edit
          </button>
        ) : null}
        {/* On the row, where a venue's and a state's are. It was inside the
            edit form, so removing a canyon meant opening the thing that
            writes one. */}
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            aria-label={`Delete ${site.name}`}
            title={`Delete ${site.name}`}
            onClick={() => {
              if (!confirm(`Delete ${site.name}? Days using it keep their own notes but lose the beta.`)) return
              run(() => deleteSite(site.id))
            }}
            className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40 shrink-0"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {error && <p className="px-3 pb-2 text-[11px] text-pr-red">{error}</p>}

      {open && !editing && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 space-y-2">
          {site.beta ? (
            <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed max-w-prose">{site.beta}</p>
          ) : (
            <p className="text-xs text-zinc-600">No beta written yet.</p>
          )}
          {site.coords && (
            <p className="text-[11px] text-zinc-500 font-mono">{site.coords}</p>
          )}
          {meetup && (
            editingMeetup ? (
              <MeetingPointForm point={meetup} venues={venues} onDone={() => setEditingMeetup(false)} />
            ) : (
              <div className="text-xs space-y-1">
                <p className="text-zinc-500">
                  Meet at <span className="text-zinc-300">{meetup.name}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingMeetup(true)}
                      className="ml-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                    >
                      Edit meetup
                    </button>
                  )}
                </p>
                {/* Directions that are only a pasted pin say what the line
                    below already does. */}
                {meetup.directions && !/^\s*-?[\d.]+\s*,\s*-?[\d.]+\s*$/.test(meetup.directions) && (
                  <p className="text-zinc-400 whitespace-pre-line leading-relaxed max-w-prose">{meetup.directions}</p>
                )}
                {/* Plain text, to copy into whatever map you use. The links
                    are for the one tap into Google Maps. */}
                {meetup.coords && (
                  <p className="text-[11px] text-zinc-500 font-mono select-all">{meetup.coords}</p>
                )}
                {(meetup.links ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(meetup.links ?? []).map((l, i) => (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                      >
                        {l.label || hostOf(l.url)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
          {(site.links ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(site.links ?? []).map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  {l.label || hostOf(l.url)}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {open && editing && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            {/* Kind was a field and is a nudge: it only ever helped if
                everybody used the same few words, and in four rows it was
                "canyon" four times. The name carries it. */}
            <label className={label}>Name</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={label}>Venue</label>
            <select className={input} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
              <option value="">— none —</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Coordinates</label>
            <input className={input} value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} />
          </div>
          {/* The meetup is part of setting a canyon up, so it is part of
              this form. It used to be held in the form's state and drawn
              nowhere: pressing Edit was the one way to lose sight of it. */}
          <div className="sm:col-span-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Usual meetup</label>
                <div className="flex items-center gap-2">
                  <select
                    className={input}
                    value={form.meeting_point_id}
                    onChange={(e) => { setForm({ ...form, meeting_point_id: e.target.value }); setEditingMeetup(false); setMakingMeetup(false) }}
                  >
                    <option value="">— none —</option>
                    {points
                      .filter((p) => p.active || p.id === form.meeting_point_id)
                      .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {/* The picker only ever offered meetups that already
                      existed, and a new one could only be born typed onto a
                      course day — so setting a canyon up before anyone ran a
                      course at it had no door at all. */}
                  <button
                    type="button"
                    onClick={() => { setMakingMeetup((v) => !v); setEditingMeetup(false) }}
                    className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {makingMeetup ? 'Cancel' : '+ New'}
                  </button>
                </div>
              </div>
            </div>
            {makingMeetup && (
              <MeetingPointForm
                point={null}
                venues={venues}
                forSite={{ id: site.id, venueId: form.venue_id || site.venue_id || null }}
                onDone={(id) => {
                  // Saved as this canyon's usual already, so the picker is
                  // moved onto it rather than left on what it was.
                  if (id) setForm((f) => ({ ...f, meeting_point_id: id }))
                  setMakingMeetup(false)
                }}
              />
            )}

            {!makingMeetup && pickedMeetup && (
              editingMeetup ? (
                <MeetingPointForm point={pickedMeetup} venues={venues} onDone={() => setEditingMeetup(false)} />
              ) : (
                <div className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs space-y-1">
                  {pickedMeetup.directions && (
                    <p className="text-zinc-400 whitespace-pre-line leading-relaxed max-w-prose">{pickedMeetup.directions}</p>
                  )}
                  {pickedMeetup.coords && (
                    <p className="text-[11px] text-zinc-500 font-mono select-all">{pickedMeetup.coords}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingMeetup(true)}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    Edit {pickedMeetup.name}
                  </button>
                </div>
              )
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Beta</label>
            <textarea
              rows={10}
              className={`${input} resize-y leading-relaxed`}
              value={form.beta}
              onChange={(e) => setForm({ ...form, beta: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Links</label>
            {/* A grid, not a flex row: the shared input class carries w-full,
                so a width utility next to it is a coin toss on stylesheet
                order — which is how the URL field ended up a sliver and the
                label hogged the row. Columns decide the widths here, and the
                inputs are free to stay w-full inside them. */}
            <div className="space-y-1.5">
              {links.length > 0 && (
                <div className="grid grid-cols-[minmax(9rem,1fr)_minmax(0,1.6fr)_1.25rem] gap-2 px-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">Label</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">Address</span>
                </div>
              )}
              {links.map((l, i) => (
                <div key={i} className="grid grid-cols-[minmax(9rem,1fr)_minmax(0,1.6fr)_1.25rem] gap-2 items-center">
                  <input
                    className={input}
                    value={l.label}
                    onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  />
                  <input
                    className={`${input} font-mono text-[12px]`}
                    value={l.url}
                    spellCheck={false}
                    onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                  />
                  <button
                    onClick={() => setLinks(links.filter((_, j) => j !== i))}
                    aria-label={`Remove ${l.label || 'link'}`}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
              <button onClick={() => setLinks([...links, { url: '', label: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                + Add link
              </button>
            </div>
          </div>

          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              onClick={() => run(async () => { await updateSite(site.id, { ...form, links }); setEditing(false) })}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => run(() => updateSite(site.id, { active: !site.active }))}
              disabled={busy}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {site.active ? 'Mark inactive' : 'Reactivate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
