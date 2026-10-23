'use client'

import { useState } from 'react'
import TrashIcon from '@/components/TrashIcon'

// A list of people, edited in place.
//
// A contact filed from a course could be deleted and not corrected: a wrong
// number stayed wrong, and the fix was to delete the person and type them
// again. Both lists that hold people — a client's and a place's — use this,
// so a phone number is edited the same way wherever it was kept.

export type Contact = { name: string; role?: string; phone?: string; email?: string; note?: string }

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500'

export default function ContactList({
  contacts,
  onSave,
  addLabel = '+ Add a contact',
  rolePlaceholder = 'What for',
}: {
  contacts: Contact[]
  /** The whole list, every time: these are a handful of rows on one record,
      and a patch protocol for five names is more moving parts than the thing
      it moves. */
  onSave: (next: Contact[]) => Promise<unknown>
  addLabel?: string
  rolePlaceholder?: string
}) {
  const [rows, setRows] = useState<Contact[]>(contacts)
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const commit = async (next: Contact[]) => {
    setRows(next)
    setBusy(true)
    try { await onSave(next.filter((c) => c.name.trim())) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-1.5">
      {rows.length === 0 && <p className="text-[11px] text-zinc-600">Nobody on file yet.</p>}

      {rows.map((c, i) =>
        editing === i ? (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 items-center">
            {(['name', 'role', 'phone', 'email'] as const).map((k) => (
              <input
                key={k}
                className={input}
                placeholder={k === 'role' ? rolePlaceholder : k[0].toUpperCase() + k.slice(1)}
                value={c[k] ?? ''}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
              />
            ))}
            <div className="sm:col-span-4 flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={async () => { await commit(rows); setEditing(null) }}
                className="text-[11px] px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setRows(contacts); setEditing(null) }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="min-w-0 truncate">
              {c.name}
              {c.role && <span className="text-zinc-600"> · {c.role}</span>}
              {(c.phone || c.email) && (
                <a
                  href={c.phone ? `tel:${c.phone}` : `mailto:${c.email}`}
                  className="ml-1.5 text-zinc-300 hover:text-white underline underline-offset-2"
                >
                  {c.phone || c.email}
                </a>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditing(i)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${c.name}`}
              onClick={() => {
                if (!confirm(`Remove ${c.name}?`)) return
                void commit(rows.filter((_, j) => j !== i))
              }}
              className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          </div>
        )
      )}

      <button
        type="button"
        onClick={() => { setRows([...rows, { name: '' }]); setEditing(rows.length) }}
        className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {addLabel}
      </button>
    </div>
  )
}
