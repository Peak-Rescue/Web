'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateSite, deleteSite } from './actions'
import { SITE_KINDS, type Site, type SiteLink } from '@/lib/sites'
import { type Venue } from '@/lib/library'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function SiteRow({ site, venues, dayCount }: { site: Site; venues: Venue[]; dayCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: site.name,
    venue_id: site.venue_id ?? '',
    kind: site.kind ?? '',
    beta: site.beta ?? '',
    coords: site.coords ?? '',
  })
  const [links, setLinks] = useState<SiteLink[]>(site.links ?? [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  const venue = venues.find((v) => v.id === site.venue_id)
  // The first line of the beta is the scope line — "Upper Emerald only, to the
  // footbridge" — which is exactly what tells two sites at one canyon apart.
  const gist = (site.beta ?? '').split('\n').find((l) => l.trim()) ?? ''

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
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
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0">
          {open ? 'Close' : 'Edit'}
        </button>
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
            <label className={label}>Coordinates</label>
            <input className={input} value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} placeholder="20.7988, -156.1193" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Beta — approach, raps, exit, hazards. One blank-free line per fact; the breaks are kept.</label>
            <textarea
              rows={10}
              className={`${input} resize-y font-[13px] leading-relaxed`}
              value={form.beta}
              onChange={(e) => setForm({ ...form, beta: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Links — route page, gauge, driving pin</label>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={`${input} flex-1`}
                    value={l.url}
                    placeholder="https://…"
                    onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                  />
                  <input
                    className={`${input} w-32 shrink-0`}
                    value={l.label}
                    placeholder="label"
                    onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  />
                  <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0 px-1">
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
              onClick={() => run(async () => { await updateSite(site.id, { ...form, links }); setOpen(false) })}
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
