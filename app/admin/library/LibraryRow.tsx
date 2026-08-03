'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateLibraryItem, deleteLibraryItem } from './actions'
import { KIND_META, LIBRARY_KINDS, AUDIENCE_META, type LibraryItem, type Venue } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function LibraryRow({ item, venues, hideProvenance = false }: { item: LibraryItem; venues: Venue[]; hideProvenance?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    title: item.title,
    url: item.url ?? '',
    edit_url: item.edit_url ?? '',
    kind: item.kind,
    audience: item.audience,
    disciplines: item.disciplines,
    topicsRaw: item.topics.join(', '),
    venue_id: item.venue_id ?? '',
    expires_at: item.expires_at ?? '',
  })

  const venue = venues.find((v) => v.id === item.venue_id)
  const pending = item.status === 'pending'

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  const save = () => run(async () => {
    await updateLibraryItem(item.id, { ...form, venue_id: form.venue_id || null, expires_at: form.expires_at || null })
    setOpen(false)
  })

  return (
    <div className={`rounded-lg border ${pending ? 'border-yellow-900/60 bg-yellow-950/10' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-pr-red-light transition-colors truncate">
                {item.title}
              </a>
            ) : (
              <span className="text-sm font-medium truncate">{item.title}</span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {KIND_META[item.kind as keyof typeof KIND_META] ?? item.kind}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              item.audience === 'shared' ? 'bg-teal-900/50 text-teal-300' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {AUDIENCE_META[item.audience].badge}
            </span>
            {venue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{venue.name}</span>}
            {item.topics.includes('needs-link-check') && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">link may be dead</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 mt-1 truncate">
            {item.url ? new URL(item.url, 'https://x').hostname.replace('www.', '') || 'link' : 'no link'}
            {' · '}
            {item.disciplines.map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d).join(', ') || 'no expertise tag'}
            {!hideProvenance && item.source_class && (
              <span className="text-zinc-700"> · from {item.source_class}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pending && (
            <button
              onClick={() => run(() => updateLibraryItem(item.id, { status: 'published' }))}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
            >
              Approve
            </button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-400 hover:text-white transition-colors">
            {open ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={label}>Title</label>
            <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Link</label>
            <input className={input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Edit link — internal only, never shown to participants (CalTopo/SARTopo)</label>
            <input className={input} value={form.edit_url} onChange={(e) => setForm({ ...form, edit_url: e.target.value })} />
          </div>
          <div>
            <label className={label}>Type</label>
            <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k]}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Who can see it</label>
            <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as 'internal' | 'shared' })}>
              <option value="internal">{AUDIENCE_META.internal.choice}</option>
              <option value="shared">{AUDIENCE_META.shared.choice}</option>
            </select>
          </div>
          <div>
            <label className={label}>Venue</label>
            <select className={input} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
              <option value="">— none —</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Expires (permits, dated docs)</label>
            <input type="date" className={input} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Disciplines</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
              {CAPABILITY_ORDER.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-red-600"
                    checked={form.disciplines.includes(c)}
                    onChange={() => setForm({
                      ...form,
                      disciplines: form.disciplines.includes(c)
                        ? form.disciplines.filter((x) => x !== c)
                        : [...form.disciplines, c],
                    })}
                  />
                  {CAPABILITY_META[c].label}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Topic tags (comma separated)</label>
            <input className={input} value={form.topicsRaw} onChange={(e) => setForm({ ...form, topicsRaw: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
            {item.status !== 'archived' && (
              <button onClick={() => run(() => updateLibraryItem(item.id, { status: 'archived' }))} disabled={busy} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Archive
              </button>
            )}
            <button
              onClick={() => { if (confirm('Delete this item permanently?')) run(() => deleteLibraryItem(item.id)) }}
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
