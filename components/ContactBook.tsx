'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TrashIcon from '@/components/TrashIcon'
import ContactFields, { type ContactDetails } from '@/components/ContactFields'
import {
  contactHomes,
  deleteContactEverywhere,
  saveContact,
  unlinkContact,
  type BookContact,
} from '@/app/admin/contacts/actions'
import { keyOf, type ContactHome, type ContactScope } from '@/lib/contact-homes'

// The people known from one place, edited in place.
//
// One row per person (267), so the line under a name says where else they
// are known from rather than being a second copy of them — and correcting a
// number here corrects it wherever it is read. The editor is the same one a
// course uses, and it can file them with a client and a place at once:
// before, the list you were standing in was the only answer the form would
// take, so the venue's gate-code holder could not also be the client's.

type Draft = ContactDetails & { id?: string; homes: string[] }

export default function ContactBook({
  scope,
  scopeLabel,
  contacts,
  rolePlaceholder = 'What for',
  addLabel = '+ Add someone',
}: {
  scope: ContactScope
  /** What this list is called, for the ticked and locked box on the editor.
      The person is on it by virtue of being here. */
  scopeLabel: string
  contacts: BookContact[]
  rolePlaceholder?: string
  addLabel?: string
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof contactHomes>> | null>(null)

  const mine = keyOf(scope)
  const here = { key: mine, label: scopeLabel }

  // What the editor can show ticked: this list, wherever they are already
  // known from, and anything picked out of the catalog since it opened.
  const homesFor = (c?: BookContact): ContactHome[] => {
    const all = new Map<string, ContactHome>([[here.key, here]])
    for (const h of c?.homes ?? []) all.set(h.key, h)
    for (const k of draft?.homes ?? []) {
      if (all.has(k)) continue
      const found = catalog
        ? [...catalog.clients, ...catalog.venues, ...catalog.regions].find((x) => x.key === k)
        : undefined
      all.set(k, found ?? { key: k, label: k })
    }
    return [...all.values()]
  }

  const edit = (c: BookContact) =>
    setDraft({
      id: c.id,
      name: c.name,
      role: c.role ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      note: c.note ?? '',
      homes: (c.homes ?? []).map((h) => h.key).filter((k) => k !== mine),
    })

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const r = await saveContact(scope, draft, draft.homes)
      if ('error' in r) { setError(r.error); return }
      setDraft(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const panel = (c?: BookContact) => (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-2">
      <ContactFields
        value={draft!}
        onChange={(v) => setDraft({ ...draft!, ...v })}
        homes={homesFor(c)}
        chosen={draft!.homes}
        onChosenChange={(homes) => setDraft({ ...draft!, homes })}
        lockedKey={mine}
        catalog={catalog}
        onNeedCatalog={async () => setCatalog(await contactHomes())}
        rolePlaceholder={rolePlaceholder}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !draft!.name.trim()}
          onClick={save}
          className="text-[11px] px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
        {/* The other kind of delete. The trash on the row is "not ours any
            more" and leaves them wherever else they are known; this is "not
            a person we have", and it says how many lists it empties before
            it empties them. */}
        {c && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const others = (c.homes ?? []).filter((h) => h.key !== mine).map((h) => h.label)
              const also = others.length ? ` They are also known from ${others.join(', ')}, and go from there too.` : ''
              if (!confirm(`Delete ${c.name} everywhere?${also} This cannot be undone.`)) return
              setBusy(true)
              try { await deleteContactEverywhere(c.id); setDraft(null); router.refresh() } finally { setBusy(false) }
            }}
            className="ml-auto text-[11px] text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            Delete everywhere
          </button>
        )}
        {error && <span className="text-[11px] text-pr-red">{error}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-1.5">
      {contacts.length === 0 && !draft && <p className="text-[11px] text-zinc-600">Nobody on file yet.</p>}

      {contacts.map((c) => {
        const others = (c.homes ?? []).filter((h) => h.key !== mine).map((h) => h.label)
        return draft?.id === c.id ? (
          <div key={c.id}>{panel(c)}</div>
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
              {others.length > 0 && <span className="text-zinc-600"> · also {others.join(', ')}</span>}
            </span>
            <button
              type="button"
              onClick={() => edit(c)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Take ${c.name} off this list`}
              title={others.length ? `Takes them off this list only — still known from ${others.join(', ')}` : undefined}
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
      })}

      {draft && !draft.id && panel()}

      {!draft && (
        <button
          type="button"
          onClick={() => setDraft({ name: '', role: '', phone: '', email: '', note: '', homes: [] })}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {addLabel}
        </button>
      )}
    </div>
  )
}
