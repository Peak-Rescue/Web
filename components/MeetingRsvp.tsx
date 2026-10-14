'use client'

import { useState, useTransition } from 'react'
import { setMeetingRsvp } from '@/app/portal/[id]/meeting-actions'

/** Going or not, for one meeting. The answer shows at once and is saved
    behind it; a failed save puts the old answer back and says so. */
export default function MeetingRsvp({
  instanceId,
  mine,
  compact = false,
}: {
  instanceId: string
  mine: boolean | null
  /** Smaller pills, for a row of other actions. */
  compact?: boolean
}) {
  const [answer, setAnswer] = useState(mine)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  function choose(going: boolean) {
    if (pending || answer === going) return
    const before = answer
    setAnswer(going)
    setFailed(false)
    start(async () => {
      try {
        await setMeetingRsvp(instanceId, going)
      } catch {
        setAnswer(before)
        setFailed(true)
      }
    })
  }

  const pill = (on: boolean, tone: 'yes' | 'no') =>
    `${compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-full border transition-colors ${
      on
        ? tone === 'yes'
          ? 'bg-teal-900/40 border-teal-600 text-teal-200'
          : 'bg-zinc-800 border-zinc-500 text-zinc-200'
        : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
    }`

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Will you be there?">
      <button type="button" aria-pressed={answer === true} onClick={() => choose(true)} className={pill(answer === true, 'yes')}>
        ✓ Going
      </button>
      <button type="button" aria-pressed={answer === false} onClick={() => choose(false)} className={pill(answer === false, 'no')}>
        ✗ Can’t make it
      </button>
      {failed && <span className="text-xs text-red-400">Not saved — try again</span>}
    </div>
  )
}
