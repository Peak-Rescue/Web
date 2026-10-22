'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { removeRegion, removeVenue } from './actions'
import TrashIcon from '@/components/TrashIcon'

// Undoing a level that was added by mistake — picking Nevada when you meant
// New Mexico, typing a venue twice.
//
// It refuses while a canyon, a document or a course is under it — but those
// were never everything it holds. A venue's own weather links and contacts
// are part of the venue, so they do not block the delete and went with it
// silently, which is the case the confirm is for: the thing you are about to
// lose is the thing nothing warned you about.
export default function RemovePlace({
  what,
  ...scope
}: { what: string } & ({ venueId: string } | { regionCode: string })) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ href: string; label: string } | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={busy}
        title={`Remove ${what}`}
        onClick={async (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!confirm(
            `Delete ${what}? Any weather links and contacts on it go too, and this cannot be undone.`
          )) return
          setBusy(true)
          setError(null)
          try {
            const r = 'venueId' in scope ? await removeVenue(scope.venueId) : await removeRegion(scope.regionCode)
            if (r && 'error' in r) { setError(r.error); setLink(r.link ?? null) }
            else router.refresh()
          } finally {
            setBusy(false)
          }
        }}
        className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
      >
        <TrashIcon />
      </button>
      {/* The refusal and the way to act on it. Naming what is in the way
          without linking to it is how somebody goes looking for a course by
          opening the list and guessing. */}
      {error && (
        <span className="text-[11px] text-pr-red">
          {error}
          {link && (
            <>
              {' '}
              <Link href={link.href} className="underline hover:text-white transition-colors">
                {link.label}
              </Link>
            </>
          )}
        </span>
      )}
    </>
  )
}
