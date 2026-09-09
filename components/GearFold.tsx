'use client'

import { useRef } from 'react'
import { sawGearList } from '@/app/portal/[id]/update-actions'

// The gear list's fold, which also notices that it was opened.
//
// "Waiting on a check" cannot tell not-yet from no-news, and the asker is
// left to guess which silence they are looking at. Recorded on the fold
// rather than on the page: the list is behind this caret, and a course page
// view is not a read of what is inside it — a signal that means the weaker
// thing would be worse than none.
//
// Once per open, and once per mount: a reader who keeps folding it shut and
// open again while reading has not read it four times. `first_seen_at` on the
// row is kept by the server for the same reason.
export default function GearFold({
  instanceId,
  listIds,
  record,
  summary,
  children,
}: {
  instanceId: string
  listIds: string[]
  /** Only the crew and admins have a row to write — a student opening the
      list they were sent is not an answer anybody is waiting on. */
  record: boolean
  summary: React.ReactNode
  children: React.ReactNode
}) {
  const told = useRef(false)

  return (
    <details
      className="group/gear"
      onToggle={(e) => {
        if (!e.currentTarget.open || told.current) return
        if (!record || listIds.length === 0) return
        told.current = true
        // Nothing on screen depends on this landing, so a failure is left to
        // the console rather than dressed up as something the reader did.
        sawGearList(instanceId, listIds).catch((err) => {
          told.current = false
          console.error('Could not record the gear list as seen:', err)
        })
      }}
    >
      {summary}
      {children}
    </details>
  )
}
