'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ContactFields, { type ContactDetails } from '@/components/ContactFields'
import {
  contactHomes,
  deleteContactEverywhere,
  saveContact,
  type BookContact,
} from '@/app/admin/contacts/actions'
import { keyOf, type ContactHome, type ContactScope } from '@/lib/contact-homes'
import { errorFrom } from '@/lib/action-result'

// One person, written. The panel itself — the list that holds it and the row
// of add buttons under it both open this, so "add a contact" is the same act
// and the same form wherever it is pressed.

export default function ContactEditor({
  scope,
  scopeLabel,
  contact,
  rolePlaceholder = 'What for',
  onDone,
}: {
  scope: ContactScope
  /** What this list is called, for the ticked and locked box: the person is
      filed here by virtue of being added here. */
  scopeLabel: string
  /** The person being changed, or nobody for a new one. */
  contact?: BookContact
  rolePlaceholder?: string
  onDone: () => void
}) {
  const router = useRouter()
  const mine = keyOf(scope)
  const [draft, setDraft] = useState<ContactDetails & { homes: string[] }>({
    name: contact?.name ?? '',
    role: contact?.role ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    note: contact?.note ?? '',
    homes: (contact?.homes ?? []).map((h) => h.key).filter((k) => k !== mine),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof contactHomes>> | null>(null)

  // What can be ticked: this list, wherever they are already known from, and
  // anything picked out of the catalog since the panel opened.
  const homes: ContactHome[] = (() => {
    const all = new Map<string, ContactHome>([[mine, { key: mine, label: scopeLabel }]])
    for (const h of contact?.homes ?? []) all.set(h.key, h)
    for (const k of draft.homes) {
      if (all.has(k)) continue
      const found = catalog
        ? [...catalog.clients, ...catalog.venues, ...catalog.regions].find((x) => x.key === k)
        : undefined
      all.set(k, found ?? { key: k, label: k })
    }
    return [...all.values()]
  })()

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await saveContact(scope, { ...draft, id: contact?.id }, draft.homes)
      if ('error' in r) { setError(r.error); return }
      onDone()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-2">
      <ContactFields
        value={draft}
        onChange={(v) => setDraft({ ...draft, ...v })}
        homes={homes}
        chosen={draft.homes}
        onChosenChange={(h) => setDraft({ ...draft, homes: h })}
        lockedKey={mine}
        catalog={catalog}
        onNeedCatalog={async () => {
          // Caught and said out loud. Awaited with nothing watching it, a
          // refused fetch left the picker reading "Loading…" for ever —
          // which is the same lie a dead button tells.
          try { setCatalog(await contactHomes()) }
          catch (e) { setError(errorFrom(e, 'Could not load the places')) }
        }}
        rolePlaceholder={rolePlaceholder}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !draft.name.trim()}
          onClick={save}
          className="text-[11px] px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
        {/* The other kind of delete. The trash on a row is "not ours any
            more" and leaves them wherever else they are known; this is "not
            a person we have", and it says how many lists it empties before
            it empties them. */}
        {contact && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const others = (contact.homes ?? []).filter((h) => h.key !== mine).map((h) => h.label)
              const also = others.length ? ` They are also known from ${others.join(', ')}, and go from there too.` : ''
              if (!confirm(`Delete ${contact.name} everywhere?${also} This cannot be undone.`)) return
              setBusy(true)
              try { await deleteContactEverywhere(contact.id); onDone(); router.refresh() } finally { setBusy(false) }
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
}
