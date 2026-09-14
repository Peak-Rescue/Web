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

  const field = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Start date (optional)</label>
        <input
          name="starts_at"
          type="date"
          value={start ?? ''}
          onChange={(e) => setStart(e.target.value || null)}
          className={field}
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">End date (optional)</label>
        <input
          name="ends_at"
          type="date"
          value={end ?? ''}
          onChange={(e) => setEnd(e.target.value || null)}
          className={field}
        />
      </div>
      <div className="sm:col-span-2 -mt-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <span className={`inline-block mr-1 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          {open ? 'Hide the calendar' : 'Pick the dates on a calendar'}
        </button>
        {open && (
          <div className="mt-2">
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
      </div>
    </>
  )
}
