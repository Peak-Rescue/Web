'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addScheduleDay } from '@/app/admin/schedules/actions'

// Adding a day, from the page the schedule is read on.
//
// Everything else about a day is edited on that day, which is why the
// section-wide edit mode went away — but "add one" belongs to no day yet, and
// with the mode gone it went too. Losing the ability to extend a running order
// without changing screens was not the trade; this is the one control that
// stays at the foot of the list.
export default function AddScheduleDay({ scheduleId }: { scheduleId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={async () => {
          setBusy(true); setError(null)
          try { await addScheduleDay(scheduleId); router.refresh() }
          catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
          finally { setBusy(false) }
        }}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        <svg
          aria-hidden
          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        {busy ? 'Adding…' : 'Day'}
      </button>
      {error && <p className="text-xs text-pr-red">{error}</p>}
    </div>
  )
}
