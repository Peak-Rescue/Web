'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { updateSite, deleteSite } from './actions'
import { SITE_KINDS, type Site, type SiteLink, type MeetingPointRecord } from '@/lib/sites'
import { type Venue } from '@/lib/library'
import CloseButton from '@/components/CloseButton'
import TrashIcon from '@/components/TrashIcon'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function SiteRow({
  site, venues, points, dayCount,
}: {
  site: Site
  venues: Venue[]
  /** The meetups to choose from — shared rows, because a trailhead often
      serves several canyons and we as often meet where there is parking. */
  points: MeetingPointRecord[]
  dayCount: number
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
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: site.name,
    venue_id: site.venue_id ?? '',
    kind: site.kind ?? '',
    beta: site.beta ?? '',
    meeting_point_id: site.meeting_point_id ?? '',
    usual_meeting_time: site.usual_meeting_time ?? '',
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
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  const venue = venues.find((v) => v.id === site.venue_id)
  // The first line of the beta is the scope line — "Upper Emerald only, to the
  // footbridge" — which is exactly what tells two sites at one canyon apart.
  const gist = (site.beta ?? '').split('\n').find((l) => l.trim()) ?? ''

  return (
    <div id={`site-${site.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 scroll-mt-6">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{site.name}</span>
            {site.kind && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{site.kind}</span>}
            {!site.active && <span className="text-[10px] text-zinc-600">inactive</span>}
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
            {venue?.name ?? 'no venue'}
            {' · '}
            {dayCount} day{dayCount === 1 ? '' : 's'}
            {gist && <span className="text-zinc-700"> · {gist}</span>}
          </p>
        </div>
        {open ? (
          <CloseButton onClick={() => setToggled(!open)} />
        ) : (
          <button onClick={() => setToggled(!open)} className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0">Edit</button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
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
            <label className={label}>Kind</label>
            <input list="site-kinds" className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="canyon" />
          </div>
          <div>
            <label className={label}>Usual meeting time</label>
            <input className={input} value={form.usual_meeting_time} onChange={(e) => setForm({ ...form, usual_meeting_time: e.target.value })} placeholder="0530" />
          </div>
          {/* Picked, not typed: the same lot serves Emerald Upper and Lower,
              and two copies of one sentence is two places to correct a gate
              code. Edit the meetup itself in the section above. */}
          <div>
            <label className={label}>Usual meeting point</label>
            <select
              className={input}
              value={form.meeting_point_id}
              onChange={(e) => setForm({ ...form, meeting_point_id: e.target.value })}
            >
              <option value="">— none —</option>
              {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Coordinates — of the canyon itself</label>
            <input className={input} value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} placeholder="20.7988, -156.1193" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Beta — approach, raps, exit, hazards. One blank-free line per fact; the breaks are kept.</label>
            <textarea
              rows={10}
              className={`${input} resize-y leading-relaxed`}
              value={form.beta}
              onChange={(e) => setForm({ ...form, beta: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Links — route page, gauge, driving pin</label>
            {/* A grid, not a flex row: the shared input class carries w-full,
                so a width utility next to it is a coin toss on stylesheet
                order — which is how the URL field ended up a sliver and the
                label hogged the row. Columns decide the widths here, and the
                inputs are free to stay w-full inside them. */}
            <div className="space-y-1.5">
              {links.length > 0 && (
                <div className="grid grid-cols-[7.5rem_1fr_1.25rem] gap-2 px-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">Shown as</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">Address</span>
                </div>
              )}
              {links.map((l, i) => (
                <div key={i} className="grid grid-cols-[7.5rem_1fr_1.25rem] gap-2 items-center">
                  <input
                    className={input}
                    value={l.label}
                    placeholder="water gauge"
                    onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  />
                  <input
                    className={`${input} font-mono text-[12px]`}
                    value={l.url}
                    placeholder="https://…"
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
              onClick={() => run(async () => { await updateSite(site.id, { ...form, links }); setToggled(false) })}
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
            <button
              onClick={() => {
                if (confirm(`Delete ${site.name}? The ${dayCount} day(s) using it keep their own notes but lose the beta.`)) {
                  run(() => deleteSite(site.id))
                }
              }}
              disabled={busy}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <datalist id="site-kinds">
        {SITE_KINDS.map((k) => <option key={k} value={k} />)}
      </datalist>
    </div>
  )
}
