'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TrashIcon from '@/components/TrashIcon'
import { removePlaceContact, type PlaceScope } from './actions'
import { errorFrom } from '@/lib/action-result'

// A contact on a place, with the way back out.
//
// Links had a trash and contacts did not, so a mistyped number was permanent
// — the one thing on this page that could be added and not unadded.
export default function PlaceContactChip({
  scope,
  contact,
}: {
  scope: PlaceScope
  contact: { name: string; role?: string; phone?: string; email?: string }
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1.5">
      <span>
        {contact.name}
        {contact.role && <span className="text-zinc-600"> · {contact.role}</span>}
        {(contact.phone || contact.email) && (
          <a
            href={contact.phone ? `tel:${contact.phone}` : `mailto:${contact.email}`}
            className="ml-1.5 text-zinc-300 hover:text-white underline underline-offset-2"
          >
            {contact.phone || contact.email}
          </a>
        )}
      </span>
      <button
        type="button"
        disabled={busy}
        aria-label={`Remove ${contact.name}`}
        onClick={async () => {
          if (!confirm(`Remove ${contact.name} from this place?`)) return
          setBusy(true)
          try {
            const r = await removePlaceContact(scope, contact.name)
            if (r?.error) setError(r.error)
            else router.refresh()
          } catch (e) {
            setError(errorFrom(e, 'That didn’t save'))
          } finally {
            setBusy(false)
          }
        }}
        className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
      >
        <TrashIcon />
      </button>
      {error && <span className="text-pr-red">{error}</span>}
    </span>
  )
}
