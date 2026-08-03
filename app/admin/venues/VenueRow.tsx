'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateVenue, deleteVenue } from '../library/actions'
import { type Venue } from '@/lib/library'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function VenueRow({ venue, itemCount }: { venue: Venue; itemCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: venue.name,
    region: venue.region ?? '',
    client_name: venue.client_name ?? '',
    notes: venue.notes ?? '',
  })

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{venue.name}</span>
            {venue.client_name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{venue.client_name}</span>
            )}
            {!venue.active && <span className="text-[10px] text-zinc-600">inactive</span>}
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5">
            {venue.region ?? 'no region'} ·{' '}
            <Link href={`/admin/library?status=all&venue=${venue.id}`} className="hover:text-zinc-400 transition-colors underline">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </Link>
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
            <label className={label}>Region</label>
            <input className={input} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Client</label>
            <input className={input} value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Notes</label>
            <textarea rows={2} className={`${input} resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              onClick={() => run(async () => { await updateVenue(venue.id, form); setOpen(false) })}
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
      )}
    </div>
  )
}
