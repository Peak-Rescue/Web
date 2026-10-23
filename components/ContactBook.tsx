'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TrashIcon from '@/components/TrashIcon'
import { saveContact, unlinkContact, type BookContact, type ContactScope } from '@/app/admin/contacts/actions'

// The people known from one place, edited in place.
//
// One row per person (267), so the line under a name says where else they
// are known from rather than being a second copy of them — and correcting a
// number here corrects it wherever it is read.

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500'

type Draft = { id?: string; name: string; role: string; phone: string; email: string }
const blank: Draft = { name: '', role: '', phone: '', email: '' }

export default function ContactBook({
  scope,
  contacts,
  rolePlaceholder = 'What for',
  addLabel = '+ Add someone',
}: {
  scope: ContactScope
  contacts: BookContact[]
  rolePlaceholder?: string
  addLabel?: string
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const r = await saveContact(scope, draft)
      if ('error' in r) { setError(r.error); return }
      setDraft(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      {contacts.length === 0 && !draft && <p className="text-[11px] text-zinc-600">Nobody on file yet.</p>}

      {contacts.map((c) =>
        draft?.id === c.id ? (
          <div key={c.id} className="grid grid-cols-1 sm:grid-cols-4 gap-1.5">
            {(['name', 'role', 'phone', 'email'] as const).map((k) => (
              <input
                key={k}
                className={input}
                placeholder={k === 'role' ? rolePlaceholder : k[0].toUpperCase() + k.slice(1)}
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              />
            ))}
            <div className="sm:col-span-4 flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="text-[11px] px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              {error && <span className="text-[11px] text-pr-red">{error}</span>}
            </div>
          </div>
        ) : (
          <div key={c.id} className="flex items-center gap-2 text-[11px] text-zinc-400">
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
              {/* Where else they are known from — one person, several homes,
                  which is what used to be several rows of them. */}
              {c.alsoFrom && c.alsoFrom.length > 0 && (
                <span className="text-zinc-600"> · also {c.alsoFrom.join(', ')}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setDraft({ id: c.id, name: c.name, role: c.role ?? '', phone: c.phone ?? '', email: c.email ?? '' })}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Take ${c.name} off this list`}
              title={c.alsoFrom?.length ? `Takes them off this list only — still known from ${c.alsoFrom.join(', ')}` : undefined}
              onClick={async () => {
                if (!confirm(`Take ${c.name} off this list?`)) return
                setBusy(true)
                try { await unlinkContact(scope, c.id); router.refresh() } finally { setBusy(false) }
              }}
              className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          </div>
        )
      )}

      {draft && !draft.id && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5">
          {(['name', 'role', 'phone', 'email'] as const).map((k) => (
            <input
              key={k}
              autoFocus={k === 'name'}
              className={input}
              placeholder={k === 'role' ? rolePlaceholder : k[0].toUpperCase() + k.slice(1)}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          ))}
          <div className="sm:col-span-4 flex items-center gap-3">
            <button
              type="button"
              disabled={busy || !draft.name.trim()}
              onClick={save}
              className="text-[11px] px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Cancel
            </button>
            {error && <span className="text-[11px] text-pr-red">{error}</span>}
          </div>
        </div>
      )}

      {!draft && (
        <button
          type="button"
          onClick={() => setDraft({ ...blank })}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {addLabel}
        </button>
      )}
    </div>
  )
}
