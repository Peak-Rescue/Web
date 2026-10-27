'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateMeetingPoint, deleteMeetingPoint } from './actions'
import { type MeetingPointRecord, type SiteLink } from '@/lib/sites'
import { type Venue } from '@/lib/library'
import TrashIcon from '@/components/TrashIcon'
import { errorFrom } from '@/lib/action-result'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

// A meetup, edited from the canyon that meets there — you set one up in the
// same sitting as the site that uses it, and splitting them across two
// screens would put a navigation inside one decision. Shared: a trailhead
// often serves several canyons, so correcting it here corrects every one.
export default function MeetingPointForm({
  point,
  venues,
  onDone,
}: {
  point: MeetingPointRecord
  venues: Venue[]
  onDone: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: point.name,
    venue_id: point.venue_id ?? '',
    directions: point.directions ?? '',
    coords: point.coords ?? '',
  })
  const [links, setLinks] = useState<SiteLink[]>(point.links ?? [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(errorFrom(e, 'That didn’t save')) }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div className="sm:col-span-2">
        <label className={label}>Directions</label>
        <textarea
          rows={3}
          className={`${input} resize-y leading-relaxed`}
          value={form.directions}
          onChange={(e) => setForm({ ...form, directions: e.target.value })}
        />
      </div>
      <div>
        <label className={label}>Coordinates</label>
        <input className={input} value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} />
      </div>

      <div className="sm:col-span-2">
        <label className={label}>Links</label>
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
          onClick={() => run(async () => { await updateMeetingPoint(point.id, { ...form, links }); onDone() })}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => run(() => updateMeetingPoint(point.id, { active: !point.active }))}
          disabled={busy}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {point.active ? 'Mark inactive' : 'Reactivate'}
        </button>
        <button onClick={onDone} disabled={busy} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => {
            if (confirm(
              `Delete ${point.name}? Canyons and days meeting here fall back to whatever is behind them — usually nothing.`
            )) {
              run(async () => { await deleteMeetingPoint(point.id); onDone() })
            }
          }}
          disabled={busy}
          className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
      {error && <p className="sm:col-span-2 text-[11px] text-pr-red">{error}</p>}
    </div>
  )
}
