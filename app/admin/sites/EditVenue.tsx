'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateVenue } from '@/app/admin/library/actions'
import VenueSettings from '@/components/VenueSettings'
import { type Venue } from '@/lib/library'

/** Editing a venue.
 *
 * The name inline, because renaming is most of what anyone comes for and a
 * panel to change one word is a panel in the way. Everything else — the
 * state, the notes, the links and contacts already on it, and deleting the
 * venue — behind "More", which is where it has to be now that this is the
 * only screen venues have.
 */
export default function EditVenue({ venue, itemCount }: { venue: Venue; itemCount: number }) {
  const { id, name } = venue
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save(next: string) {
    const clean = next.trim()
    if (!clean || clean === name) { setEditing(false); return }
    setBusy(true)
    try {
      await updateVenue(id, { name: clean })
      setEditing(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        // Inside the venue's <summary>: without this the click opens or closes
        // the venue instead of starting an edit.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true) }}
        className="text-[11px] text-zinc-700 hover:text-zinc-300 transition-colors"
      >
        Edit
      </button>
    )
  }

  if (more) {
    return (
      <span onClick={(e) => { e.preventDefault(); e.stopPropagation() }} className="block">
        <VenueSettings venue={venue} itemCount={itemCount} onDone={() => { setMore(false); setEditing(false) }} />
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
      <input
      autoFocus
      defaultValue={name}
      disabled={busy}
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); save((e.target as HTMLInputElement).value) }
        if (e.key === 'Escape') setEditing(false)
      }}
      onBlur={(e) => save(e.target.value)}
      className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
      />
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMore(true) }}
        className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        More…
      </button>
    </span>
  )
}
