'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { removeRegion, removeVenue } from './actions'

// Undoing a level that was added by mistake — picking Nevada when you meant
// New Mexico, typing a venue twice.
//
// It refuses while anything is under it rather than asking whether you are
// sure: the one you want gone is the empty one you just made, and a confirm
// on a venue with four canyons under it is a confirm somebody will click.
export default function RemovePlace({
  what,
  ...scope
}: { what: string } & ({ venueId: string } | { regionCode: string })) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={busy}
        title={`Remove ${what}`}
        onClick={async (e) => {
          e.preventDefault()
          e.stopPropagation()
          setBusy(true)
          setError(null)
          try {
            const r = 'venueId' in scope ? await removeVenue(scope.venueId) : await removeRegion(scope.regionCode)
            if (r && 'error' in r) setError(r.error)
            else router.refresh()
          } finally {
            setBusy(false)
          }
        }}
        className="text-[11px] text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
      >
        ✕
      </button>
      {error && <span className="text-[11px] text-pr-red">{error}</span>}
    </>
  )
}
