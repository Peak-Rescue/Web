'use client'

import { useState, type ReactNode } from 'react'
import MeetingRsvp from '@/components/MeetingRsvp'

/** The next-meeting card above the calendar. Open until you have answered —
    the answer is what it is there to get — then folded to one line that
    still says what, when and what you said, and opens again on a click. */
export default function NextMeetingCard({
  instanceId,
  mine,
  canAnswer,
  brief,
  actions,
  children,
}: {
  instanceId: string
  mine: boolean | null
  canAnswer: boolean
  /** What and when, for the folded line. */
  brief: ReactNode
  /** Join, sign up to teach — beside the answer. */
  actions: ReactNode
  /** The full line beneath: what, when, where, who is teaching. */
  children: ReactNode
}) {
  const [answer, setAnswer] = useState(mine)
  const [open, setOpen] = useState(!canAnswer || mine === null)

  function answered(going: boolean | null) {
    setAnswer(going)
    setOpen(going === null)
  }

  if (!open) {
    return (
      <section className="mb-10 bg-zinc-900 border border-zinc-800 rounded-lg">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm text-zinc-400 hover:text-zinc-200"
        >
          <span className="text-zinc-600 text-xs">▶</span>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Next meeting</span>
          <span>{brief}</span>
          {answer === true && <span className="text-xs text-teal-300">✓ Going</span>}
          {answer === false && <span className="text-xs text-rose-300">✗ Can’t make it</span>}
        </button>
      </section>
    )
  }

  return (
    <section className="mb-10 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      {/* Two rows: everything you can do about it beside the heading —
          answer, join, sign up to teach — and what and when beneath. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          {answer !== null && canAnswer ? (
            <button type="button" onClick={() => setOpen(false)} className="uppercase tracking-wide hover:text-zinc-300">
              <span className="text-zinc-600 mr-2 inline-block rotate-90">▶</span>Next meeting
            </button>
          ) : (
            'Next meeting'
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {canAnswer && <MeetingRsvp instanceId={instanceId} mine={answer} compact onAnswer={answered} />}
          {actions}
        </div>
      </div>
      {children}
    </section>
  )
}
