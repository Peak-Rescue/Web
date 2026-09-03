'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moveScheduleDay } from '@/app/admin/schedules/actions'

// Move a day up or down the running order, from the day's own header.
//
// These sit in the summary rather than behind "Edit day" because order is a
// relationship between days, not a field of one: reaching day three's editor to
// say "day three goes after day four" puts the control on the wrong card. And
// days already behind us are folded shut, so an editor-bound arrow could not
// reach them at all without opening the day first.
//
// They stay visible, unlike everything else that saves as you type. The
// read-first rule is there because a live field can have a start time nudged by
// a thumb on a phone; a press on an arrow is deliberate, so it does not carry
// that risk. Dim until the card is hovered or the button is focused, so a
// five-day course does not read as ten buttons.
export default function MoveDayArrows({
  dayId,
  isFirst,
  isLast,
}: {
  dayId: string
  isFirst: boolean
  isLast: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // Nothing to move it past in either direction.
  if (isFirst && isLast) return null

  const move = async (e: React.MouseEvent, direction: 'up' | 'down') => {
    // The button lives inside a <summary>, where any click folds the day. The
    // arrow moves the day; it does not also close it.
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    try {
      await moveScheduleDay(dayId, direction)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/day:opacity-100 focus-within:opacity-100">
      {([
        ['up', isFirst, 'Move day earlier', 'M18 15l-6-6-6 6'],
        ['down', isLast, 'Move day later', 'M6 9l6 6 6-6'],
      ] as const).map(([direction, atEnd, label, path]) => (
        <button
          key={direction}
          type="button"
          onClick={(e) => move(e, direction)}
          disabled={busy || atEnd}
          aria-label={label}
          title={label}
          className="rounded p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
        >
          <svg
            aria-hidden
            xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d={path} />
          </svg>
        </button>
      ))}
    </span>
  )
}
