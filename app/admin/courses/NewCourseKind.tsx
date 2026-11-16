'use client'

import { createContext, useContext, useState } from 'react'
import { CourseTypeSelect, type NewKind } from './CourseTypeSelect'
import MeetingFields from './MeetingFields'

const FIELD =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

const KindContext = createContext<{ kind: NewKind; setKind: (kind: NewKind) => void }>({
  kind: 'course',
  setKind: () => {},
})

/** Holds what the form is making, for the fields and the submit button alike —
    they sit apart in the page, so the answer lives above both. */
export function NewKindScope({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = useState<NewKind>('course')
  return <KindContext.Provider value={{ kind, setKind }}>{children}</KindContext.Provider>
}

/** What the form is making, once somebody has said. */
export const useNewKind = () => useContext(KindContext).kind

/** A field only a course has — the student count. A job is a crew on a site,
    and an empty headcount box on it reads as something somebody forgot. Not
    mounted, so not submitted either. */
export function CourseOnly({ children }: { children: React.ReactNode }) {
  return useNewKind() === 'course' ? <>{children}</> : null
}

/** The top of the new-course form, and what follows from it.
 *
 *  The form is a course form until somebody picks Custom and then says it is
 *  a job or an internal meeting. From there the answer decides what the rest
 *  of the form is: a meeting has no client, no contact, no headcount and no
 *  crew plan, and leaving those on screen reads as four things somebody
 *  forgot. A job keeps all of those but the headcount. The course fields
 *  arrive as children, already rendered by the page, and are simply not
 *  mounted for a meeting — so they are not submitted either.
 */
export default function NewCourseKind({
  people,
  children,
}: {
  /** Every active instructor, for a meeting's invite list. */
  people: { id: string; name: string }[]
  children: React.ReactNode
}) {
  const { kind, setKind } = useContext(KindContext)

  return (
    <>
      <CourseTypeSelect kind={kind} onKindChange={setKind} />
      {kind !== 'meeting' ? (
        children
      ) : (
        <>
          <input type="hidden" name="status" value="confirmed" />
          <MeetingFields withType={false} repeat people={people}>
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
