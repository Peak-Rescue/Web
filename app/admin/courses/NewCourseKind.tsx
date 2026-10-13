'use client'

import { useState } from 'react'
import { CourseTypeSelect } from './CourseTypeSelect'
import MeetingFields from './MeetingFields'

const FIELD =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

/** The top of the new-course form, and what follows from it.
 *
 *  The form is a course form until somebody picks Custom and then says it is
 *  an internal meeting. From there the answer decides what the rest of the
 *  form is: a meeting has no client, no contact, no headcount and no crew
 *  plan, and leaving those on screen reads as four things somebody forgot.
 *  The course fields arrive as children, already rendered by the page, and
 *  are simply not mounted for a meeting — so they are not submitted either.
 */
export default function NewCourseKind({ children }: { children: React.ReactNode }) {
  const [meeting, setMeeting] = useState(false)

  return (
    <>
      <CourseTypeSelect meeting={meeting} onMeetingChange={setMeeting} />
      {!meeting ? (
        children
      ) : (
        <>
          <input type="hidden" name="status" value="confirmed" />
          <MeetingFields withType={false} repeat>
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
