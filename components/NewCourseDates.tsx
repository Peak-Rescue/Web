'use client'

import { useState } from 'react'
import CourseDatePainter, { type OtherCourse } from './CourseDatePainter'

/** The create form's dates, typed or painted.
 *
 *  The two date fields are what most intakes need: a call comes in, the dates
 *  are already decided, and typing them is faster than anything. What they
 *  could never answer is the question you ask when the dates are *not* decided
 *  — what else is that week — and that question was only answerable on the
 *  course page, after the course existed.
 *
 *  So the same painter the course page uses folds out from under the fields.
 *  It writes nothing: there is no row yet, and the two named inputs are what
 *  the form submits either way. Breaks stay behind, on the course page, where
 *  there is a course to cut one out of.
 *
 *  The calendar icon in the corner of a date field is where anyone would look
 *  for a calendar, so that is what it opens. The browser's own picker is
 *  hidden and ours takes the click — one month, what is already booked drawn
 *  on it, and both ends set in one gesture, none of which the native one
 *  does. The fields still take a typed date.
 */
export default function NewCourseDates({
  today,
  others,
}: {
  today: string
  others?: OtherCourse[]
}) {
  const [start, setStart] = useState<string | null>(null)
  const [end, setEnd] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // The native picker indicator is hidden rather than left beside ours: two
  // calendar icons on one field, opening two different calendars, is a coin
  // toss over which one you get.
  const field =
    'w-full bg-zinc-800 border border-zinc-700 rounded pl-3 pr-9 py-2 text-sm focus:outline-none focus:border-zinc-500 [&::-webkit-calendar-picker-indicator]:hidden'

  return (
    <>
      {([
        ['starts_at', 'Start date (optional)', start, setStart],
        ['ends_at', 'End date (optional)', end, setEnd],
      ] as const).map(([name, label, value, set]) => (
        <div key={name}>
          <label className="block text-xs text-zinc-400 mb-1">{label}</label>
          <div className="relative">
            <input
              name={name}
              type="date"
              value={value ?? ''}
              onChange={(e) => set(e.target.value || null)}
              className={field}
            />
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={open ? 'Hide the calendar' : 'Pick the dates on a calendar'}
              title={open ? 'Hide the calendar' : 'Pick the dates on a calendar'}
              className={`absolute inset-y-0 right-0 px-2.5 flex items-center transition-colors ${
                open ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </button>
          </div>
        </div>
      ))}
      {open && (
        <div className="sm:col-span-2 -mt-2">
          <CourseDatePainter
            startsAt={start}
            endsAt={end}
            today={today}
            others={others}
            onChange={(s, e) => {
              setStart(s)
              setEnd(e)
            }}
          />
        </div>
      )}
    </>
  )
}
