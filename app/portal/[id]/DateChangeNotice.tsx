'use client'

import { useState } from 'react'
import { announceDateChange, skipDateChange } from '@/app/admin/courses/actions'
import { errorFrom } from '@/lib/action-result'

// The question a date move used to answer by itself, once per drag: does the
// crew hear about this? Asked for as long as the dates on the course differ
// from the ones they were last told, so working the week out by dragging
// sends nothing, and leaving the page without answering does not lose it.
export default function DateChangeNotice({
  instanceId,
  was,
  now,
  people,
}: {
  instanceId: string
  /** The dates the crew last heard, already worded. */
  was: string
  now: string
  /** Inboxes the email reaches. */
  people: number
}) {
  const [busy, setBusy] = useState<'send' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(which: 'send' | 'skip') {
    setBusy(which)
    setError(null)
    try {
      const r = which === 'send' ? await announceDateChange(instanceId) : await skipDateChange(instanceId)
      if (r && 'error' in r) setError(r.error)
    } catch (e) {
      setError(errorFrom(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
      <p className="text-amber-200">
        Dates changed from {was} to {now}. The crew haven’t been told.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act('send')}
          className="px-3 py-1.5 rounded bg-amber-500/90 hover:bg-amber-400 text-zinc-950 font-medium text-xs transition-colors disabled:opacity-50"
        >
          {busy === 'send' ? 'Sending…' : `Email ${people} ${people === 1 ? 'person' : 'people'}`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act('skip')}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors disabled:opacity-50"
        >
          {busy === 'skip' ? 'Dismissing…' : 'Don’t email'}
        </button>
        {error && <span className="text-xs text-pr-red-light">{error}</span>}
      </div>
    </div>
  )
}
