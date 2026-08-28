'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateMeetingPoint, deleteMeetingPoint } from './actions'
import { type MeetingPointRecord, type SiteLink } from '@/lib/sites'
import { type Venue } from '@/lib/library'
import CloseButton from '@/components/CloseButton'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

// A meetup, edited where the canyons are — you set one up in the same sitting
// as the site that uses it, and splitting them across two screens would put a
// navigation inside one decision.
export default function MeetingPointRow({
  point,
  venues,
  siteCount,
}: {
  point: MeetingPointRecord
  venues: Venue[]
  /** How many sites meet here. It is the whole reason this row is shared, and
      the number you want before deleting it. */
  siteCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: point.name,
    venue_id: point.venue_id ?? '',
    directions: point.directions ?? '',
    coords: point.coords ?? '',
  })
  const [links, setLinks] = useState<SiteLink[]>(point.links ?? [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  const venue = venues.find((v) => v.id === point.venue_id)
  const gist = (point.directions ?? '').split('\n').find((l) => l.trim()) ?? ''

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{point.name}</span>
            {!point.active && <span className="text-[10px] text-zinc-600">inactive</span>}
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
            {venue?.name ?? 'no venue'}
            {' · '}
            {siteCount} site{siteCount === 1 ? '' : 's'}
            {gist && <span className="text-zinc-700"> · {gist}</span>}
          </p>
        </div>
        {open ? (
          <CloseButton onClick={() => setOpen((v) => !v)} />
        ) : (
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0">Edit</button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Name</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hanawi lower lot" />
          </div>
          <div>
            <label className={label}>Venue</label>
            <select className={input} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
              <option value="">— none —</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Directions — what someone reads at 0500. Where to turn, where to park, what to look for.</label>
            <textarea
              rows={3}
              className={`${input} resize-y leading-relaxed`}
              value={form.directions}
              onChange={(e) => setForm({ ...form, directions: e.target.value })}
              placeholder={'Gate on the mauka side past mile 12. Park along the fence, not on the grass.'}
            />
          </div>
          <div>
            <label className={label}>Coordinates — the pin you drive to</label>
            <input className={input} value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} placeholder="20.7988, -156.1193" />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Links — driving pin, gate code page</label>
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
                    placeholder="driving pin"
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
                    ✕
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
              onClick={() => run(async () => { await updateMeetingPoint(point.id, { ...form, links }); setOpen(false) })}
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
            <button
              onClick={() => {
                if (confirm(
                  `Delete ${point.name}? The ${siteCount} site(s) meeting here fall back to whatever is behind them — usually nothing.`
                )) {
                  run(() => deleteMeetingPoint(point.id))
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
    </div>
  )
}
