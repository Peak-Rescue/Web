'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TrashIcon from '@/components/TrashIcon'
import ContactEditor from '@/components/ContactEditor'
import { unlinkContact, type BookContact } from '@/app/admin/contacts/actions'
import { keyOf, type ContactScope } from '@/lib/contact-homes'

// The people known from one place, edited in place.
//
// One row per person (267), so the line under a name says where else they
// are known from rather than being a second copy of them — and correcting a
// number here corrects it wherever it is read. The editor is the same one a
// course uses, and it can file them with a client and a place at once:
// before, the list you were standing in was the only answer the form would
// take, so the venue's gate-code holder could not also be the client's.

export default function ContactBook({
  scope,
  scopeLabel,
  contacts,
  rolePlaceholder = 'What for',
  addLabel = '+ Add contact',
  canAdd = true,
}: {
  scope: ContactScope
  /** What this list is called, for the ticked and locked box on the editor.
      The person is on it by virtue of being here. */
  scopeLabel: string
  contacts: BookContact[]
  rolePlaceholder?: string
  addLabel?: string
  /** False where the place's own add row already offers Contact. */
  canAdd?: boolean
}) {
  const router = useRouter()
  /** A contact's id while it is being changed, or 'new'. */
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mine = keyOf(scope)

  return (
    <div className="space-y-1.5">

      {contacts.map((c) => {
        const others = (c.homes ?? []).filter((h) => h.key !== mine).map((h) => h.label)
        return editing === c.id ? (
          <div key={c.id}>
            <ContactEditor
              scope={scope}
              scopeLabel={scopeLabel}
              contact={c}
              rolePlaceholder={rolePlaceholder}
              onDone={() => setEditing(null)}
            />
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
              {others.length > 0 && <span className="text-zinc-600"> · also {others.join(', ')}</span>}
            </span>
            <button
              type="button"
              onClick={() => setEditing(c.id)}
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

      {editing === 'new' && (
        <ContactEditor
          scope={scope}
          scopeLabel={scopeLabel}
          rolePlaceholder={rolePlaceholder}
          onDone={() => setEditing(null)}
        />
      )}

      {/* Where the place's own row of add buttons offers Contact — the same
          act, in the line that offers Map and Permit — this would be the
          second door to it. */}
      {canAdd && !editing && (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {addLabel}
        </button>
      )}
    </div>
  )
}
