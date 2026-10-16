'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateVenue } from '@/app/admin/library/actions'
import { type Venue } from '@/lib/library'

/** Renaming a venue, on the row's own line.
 *
 * Only the name, because this sits inside the venue's <summary> and a form
 * panel cannot: it renders in a place that swallows its clicks, which is why
 * "More" appeared to do nothing. The rest of a venue's record is a disclosure
 * at the foot of the venue, where there is room for it.
 */
export default function EditVenue({ venue }: { venue: Venue }) {
  const { id, name } = venue
  const router = useRouter()
  const [editing, setEditing] = useState(false)
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
    </span>
  )
}
