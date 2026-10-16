'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { removePlaceLink, type PlaceScope } from './actions'
import type { VenueLink } from '@/lib/library'

// A link on a place, with the way to take it off.
//
// Removal used to be in the venue record panel, along with a state the
// heading already shows and notes nobody writes. The panel went and this
// came with it, to the chip — which is where everything else on this page is
// edited: on the thing itself.
export default function PlaceLinkChip({
  scope,
  link,
  tone,
}: {
  scope: PlaceScope
  link: VenueLink
  tone?: 'weather'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const cls = tone === 'weather'
    ? 'border-sky-900/60 bg-sky-950/30 text-sky-300 hover:border-sky-700'
    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] pl-2 pr-1 py-1 rounded border transition-colors ${cls}`}>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
        {link.label}
      </a>
      <button
        type="button"
        disabled={busy}
        title={`Take "${link.label}" off this place`}
        onClick={async () => {
          if (!confirm(`Take "${link.label}" off this place?`)) return
          setBusy(true)
          try { await removePlaceLink(scope, link.url); router.refresh() } finally { setBusy(false) }
        }}
        className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40 px-0.5"
      >
        ✕
      </button>
    </span>
  )
}
