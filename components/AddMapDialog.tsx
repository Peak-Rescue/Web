'use client'

import { useEffect, useState } from 'react'

// Adding a map to a course, which is not the same shape as adding a link.
//
// A map is usually two links to one thing: the editable copy the crew plans
// on, and the read-only view students get. The generic link dialog takes one,
// so the course path could only ever produce half a map — and the half it
// produced was the one the library then had to be visited to complete.
// Asking for both here is asking the question the map actually poses.
//
// Either field alone is fine: plenty of maps are only ever internal, and a
// student overview can arrive before anyone has made an editable twin.
export default function AddMapDialog({
  open,
  busy,
  libraryPlace,
  onSubmit,
  onCancel,
}: {
  open: boolean
  busy: boolean
  /** Venue or region, when the course has one — what the library files under. */
  libraryPlace?: string | null
  onSubmit: (input: { name: string; editUrl: string; readUrl: string; toLibrary: boolean }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [readUrl, setReadUrl] = useState('')
  const [toLibrary, setToLibrary] = useState(false)

  // Reopening starts a fresh map — reset during render, as the link dialog does.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setName('')
    setEditUrl('')
    setReadUrl('')
    setToLibrary(false)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  if (!open) return null

  // Two links do not fit on a course row — the pair is a library item, and one
  // of its two links is the students' one. So the choice is not offered when
  // both are given: it is already made, and a checkbox you cannot mean
  // anything by is worse than a sentence saying why.
  const both = editUrl.trim().length > 0 && readUrl.trim().length > 0
  const shelve = both || toLibrary

  const canSubmit = !busy && (editUrl.trim().length > 0 || readUrl.trim().length > 0)
  const submit = () =>
    canSubmit && onSubmit({ name, editUrl: editUrl.trim(), readUrl: readUrl.trim(), toLibrary: shelve })

  const field =
    'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">Add a map</h3>
        <p className="text-xs text-zinc-500 mb-4">
          CalTopo, SARTopo, Google Maps — wherever it already lives. One link or both.
        </p>

        <label className="block text-xs text-zinc-500 mb-1">Editable link — instructors</label>
        <input
          autoFocus
          value={editUrl}
          disabled={busy}
          onChange={(e) => setEditUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://caltopo.com/m/…"
          className={field}
        />

        <label className="block text-xs text-zinc-500 mt-3 mb-1">Read-only link — students</label>
        <input
          value={readUrl}
          disabled={busy}
          onChange={(e) => setReadUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://caltopo.com/m/… (the share view)"
          className={field}
        />

        <label className="block text-xs text-zinc-500 mt-3 mb-1">Name</label>
        <input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="What everyone on the course sees — e.g. Canyon overview"
          className={field}
        />

        {both ? (
          <p className="mt-3 px-3 py-2.5 rounded border border-zinc-700 bg-zinc-800/50 text-xs text-zinc-400">
            A map with two links lives in the map library{libraryPlace ? <>, filed under <span className="font-medium text-zinc-300">{libraryPlace}</span></> : null}, so
            both travel together to the next course in the same place.
          </p>
        ) : libraryPlace ? (
          <label className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded border border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 text-sm text-zinc-200 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={toLibrary}
              disabled={busy}
              onChange={(e) => setToLibrary(e.target.checked)}
              className="accent-red-600 w-4 h-4 shrink-0 disabled:opacity-50"
            />
            <span>
              Add to library for <span className="font-medium">{libraryPlace}</span>
            </span>
          </label>
        ) : null}

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add map'}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
