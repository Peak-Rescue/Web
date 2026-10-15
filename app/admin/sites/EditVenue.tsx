'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateVenue } from '@/app/admin/library/actions'

/** Editing a venue. Today that is its name and nothing else.
 *
 * Called Edit rather than Rename because what a venue needs changing about it
 * will grow, and the control should not have to be renamed when it does. The
 * settings panel that was briefly here asked for things this page has already
 * answered — which state it is in is the heading above it, its links and
 * contacts are the buttons below it — so it went, not the idea of editing.
 */
export default function EditVenue({ id, name }: { id: string; name: string }) {
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
        // the venue instead of starting a rename.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true) }}
        className="text-[11px] text-zinc-700 hover:text-zinc-300 transition-colors"
      >
        Edit
      </button>
    )
  }

  return (
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
  )
}
