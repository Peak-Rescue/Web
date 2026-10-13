'use client'

import { useState } from 'react'
import MeetingFields from './MeetingFields'

const FIELD =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

/** The first question on the new-course form: is this a course, or a meeting
 *  of our own.
 *
 *  Asked first because the answer decides what the rest of the form is. A
 *  meeting has no client, no contact, no headcount and no crew plan, and
 *  leaving those on screen reads as four things somebody forgot. The course
 *  fields arrive as children, already rendered by the page, and are simply
 *  not mounted for a meeting — so they are not submitted either.
 */
export default function NewCourseKind({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = useState<'course' | 'meeting'>('course')

  return (
    <>
      <div className="sm:col-span-2 flex gap-1 text-xs">
        {([
          ['course', 'Course or job'],
          ['meeting', 'Internal meeting'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`px-2.5 py-1 rounded-full border transition-colors ${
              kind === value
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === 'course' ? (
        children
      ) : (
        <>
          <input type="hidden" name="status" value="confirmed" />
          <MeetingFields repeat>
            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Date *</label>
              <input name="starts_at" type="date" required className={FIELD} />
            </div>
          </MeetingFields>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Location</label>
            <input name="location" className={FIELD} />
          </div>
        </>
      )}
    </>
  )
}
