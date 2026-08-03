'use client'

import { useEffect, useState } from 'react'

// Modal for attaching an external link (Google Drive, Dropbox, CalTopo…)
// alongside file uploads — used by the course Files section and task
// attachments. The parent owns the save and passes `busy` to lock controls.
export default function AddLinkDialog({
  open,
  busy,
  onSubmit,
  onCancel,
}: {
  open: boolean
  busy: boolean
  onSubmit: (name: string, url: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  // Reopening starts a fresh link — reset the drafts during render
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setName('')
    setUrl('')
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
  const submit = () => canSubmit && onSubmit(name, url)

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
