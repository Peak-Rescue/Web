'use client'

import { useEffect, useState } from 'react'
import { AUDIENCE_META, type LibraryAudience } from '@/lib/library'

// Modal for attaching an external link (Google Drive, Dropbox, CalTopo…)
// alongside file uploads — used by the course Files section and task
// attachments. The parent owns the save and passes `busy` to lock controls.
// Where the link has an audience (photo albums), `withAudience` asks for it
// here: who it's for is part of adding it, not a setting to find afterwards.
// `libraryPlace` does the same for reuse — naming a Maui med plan is the moment
// you know it belongs to Maui, not something to remember on a later screen.
export default function AddLinkDialog({
  open,
  busy,
  withAudience = false,
  libraryPlace = null,
  onSubmit,
  onCancel,
}: {
  open: boolean
  busy: boolean
  withAudience?: boolean
  // The venue or region this course sits in, when it has one. Null hides the
  // offer — there is nowhere to file the document against.
  libraryPlace?: string | null
  onSubmit: (name: string, url: string, audience: LibraryAudience, toLibrary: boolean) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [audience, setAudience] = useState<LibraryAudience>('internal')
  const [toLibrary, setToLibrary] = useState(false)

  // Reopening starts a fresh link — reset the drafts during render
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setName('')
    setUrl('')
    setAudience('internal')
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

  const canSubmit = !busy && url.trim().length > 0
  const submit = () => canSubmit && onSubmit(name, url, audience, toLibrary)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">Add a link</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Paste a link to Google Drive, Dropbox, CalTopo — anywhere the document already lives.
        </p>

        <label className="block text-xs text-zinc-500 mb-1">Link</label>
        <input
          autoFocus
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://drive.google.com/…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        />

        <label className="block text-xs text-zinc-500 mt-3 mb-1">Name</label>
        <input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="What everyone on the course sees — e.g. Packing list"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        />

        {withAudience && (
          <>
            <label className="block text-xs text-zinc-500 mt-3 mb-1">Who can see it</label>
            <select
              value={audience}
              disabled={busy}
              onChange={(e) => setAudience(e.target.value as LibraryAudience)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            >
              <option value="internal">{AUDIENCE_META.internal.choice}</option>
              <option value="shared">{AUDIENCE_META.shared.choice}</option>
            </select>
          </>
        )}

        {libraryPlace && (
          <label className="flex items-start gap-2 mt-3 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={toLibrary}
              disabled={busy}
              onChange={(e) => setToLibrary(e.target.checked)}
              className="accent-red-600 mt-0.5 shrink-0 disabled:opacity-50"
            />
            <span>
              Also save to the resource library for{' '}
              <span className="text-zinc-300">{libraryPlace}</span> — the next course here will
              find it.
            </span>
          </label>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add link'}
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
