'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveCourseNotes } from './notes-actions'

// Internal notes: read as a block, edited in place. Nothing here is emailed
// and nobody outside the team can see it, so there's no confirmation step —
// the risk of a typo is smaller than the risk of the note never being written.
export default function CourseNotes({
  instanceId,
  notes,
  canEdit,
}: {
  instanceId: string
  notes: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      await saveCourseNotes(instanceId, draft)
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-2">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder="Gate codes, client quirks, what to watch for."
          className="w-full resize-y bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
        />
        {error && <p className="text-xs text-pr-red">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save notes'}
          </button>
          <button
            onClick={() => { setDraft(notes ?? ''); setError(null); setEditing(false) }}
            disabled={busy}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notes ? (
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap">
          {notes}
        </div>
      ) : (
        canEdit && <p className="text-xs text-zinc-600">No notes on this course yet.</p>
      )}
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="text-[11px] text-zinc-500 hover:text-white transition-colors"
        >
          {notes ? 'Edit notes' : 'Add notes'}
        </button>
      )}
    </div>
  )
}
