'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveCourseNotes } from './notes-actions'
import CloseButton from '@/components/CloseButton'
import ComposerTrigger, { NoteIcon } from '@/components/ComposerTrigger'

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
        <div className="flex justify-end">
          <CloseButton
            label="Cancel"
            disabled={busy}
            onClick={() => { setDraft(notes ?? ''); setError(null); setEditing(false) }}
          />
        </div>
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

        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notes && (
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap">
          {notes}
        </div>
      )}
      {/* Nothing written yet reads as the same invitation the composers give:
          one row that looks like the field it opens. With a note already here
          the row would be a second box under the first, so it steps down to
          the pencil every other edit on this page uses. */}
      {canEdit && !notes && (
        <ComposerTrigger label="Add notes" icon={<NoteIcon />} onClick={() => setEditing(true)} />
      )}
      {canEdit && notes && (
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit notes
        </button>
      )}
    </div>
  )
}
