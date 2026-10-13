'use client'

import { useState, useTransition } from 'react'
import InfoHint from '@/components/InfoHint'

const FIELD =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

/** What an internal meeting is, in place of what a course is.
 *
 *  A meeting is stored as a course — custom, internal, one day — because that
 *  is what puts it on the calendars. But asking for it through the course form
 *  meant walking past a client, a point of contact, a headcount and a crew
 *  plan, each looking like something to fill in, and it put a start time on a
 *  form that also makes week-long courses whose hours belong to their
 *  schedule. So the meeting has its own fields, the course's facts travel as
 *  hidden ones, and a start time exists nowhere else.
 *
 *  Used by the new-course form and by the details editor, so a meeting is
 *  edited through the same short form it was made with.
 */
export default function MeetingFields({
  defaultName = '',
  defaultCategory = 'specialty',
  withType = true,
  defaultCustomCategories = [],
  defaultStartTime = '',
  defaultEndTime = '',
  defaultVideoUrl = '',
  defaultAllStaff = true,
  repeat = false,
  applyToSeries,
  children,
}: {
  defaultName?: string
  /** Every course has one and the column is not null. One being edited keeps whatever it already had. */
  defaultCategory?: string
  /** False where the category and type selects are already on the form
      above, which is the new-course form: two fields of one name would send
      the first, and it is better not to rely on which that is. */
  withType?: boolean
  defaultCustomCategories?: string[]
  defaultStartTime?: string
  defaultEndTime?: string
  defaultVideoUrl?: string
  defaultAllStaff?: boolean
  /** Offer to make one a week. Only a form that creates can. */
  repeat?: boolean
  /** Set on a week of a repeating meeting: copies what is on the form to the
      weeks still to come, and answers with how many it changed. */
  applyToSeries?: (formData: FormData) => Promise<number>
  /** Drawn straight after the name — the date, on the form that has one. */
  children?: React.ReactNode
}) {
  const [applying, startApplying] = useTransition()
  const [applied, setApplied] = useState<number | null>(null)

  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {withType && (
        <>
          <input type="hidden" name="course_category" value={defaultCategory} />
          <input type="hidden" name="course_type" value="custom" />
        </>
      )}
      <input type="hidden" name="internal" value="on" />
      {defaultCustomCategories.map((c) => (
        <input key={c} type="hidden" name="custom_categories" value={c} />
      ))}

      <div className="sm:col-span-2">
        <label className="block text-xs text-zinc-400 mb-1">Meeting name *</label>
        <input name="custom_title" required defaultValue={defaultName} className={FIELD} />
      </div>
      {children}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Start time (Mountain) *</label>
        <input name="start_time" type="time" required defaultValue={defaultStartTime.slice(0, 5)} className={FIELD} />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">
          End time
          <InfoHint text="How long the Google Calendar event is drawn. Left empty, it is an hour." />
        </label>
        <input name="end_time" type="time" defaultValue={defaultEndTime.slice(0, 5)} className={FIELD} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-zinc-400 mb-1">Video link</label>
        <input name="video_url" type="url" defaultValue={defaultVideoUrl} placeholder="https://meet.google.com/…" className={FIELD} />
      </div>
      <label className="sm:col-span-2 flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
        <input type="checkbox" name="all_staff" defaultChecked={defaultAllStaff} className="accent-red-600" />
        All staff see it
        <InfoHint text="Puts it on every instructor’s calendar without adding them to the crew. For anyone not on the crew, clicking it there opens the video link. Unticked, only the people added to it see it." />
      </label>
      {repeat && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Repeats weekly until
            <InfoHint text="Makes one meeting a week, on the same weekday as the date, up to and including this one. Each week is its own, so it can be renamed, staffed or cancelled without touching the others." />
          </label>
          <input name="repeat_until" type="date" className={FIELD} />
        </div>
      )}
      {applyToSeries && (
        <div className="sm:col-span-2 flex items-center gap-2">
          <button
            type="button"
            disabled={applying}
            onClick={(e) => {
              const form = e.currentTarget.form
              if (!form) return
              const data = new FormData(form)
              startApplying(async () => setApplied(await applyToSeries(data)))
            }}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply to all upcoming weeks'}
          </button>
          <InfoHint text="Copies the times, the video link, who sees it, the invite list and the location to every week of this series that has not happened yet. Each week keeps its own name, crew and notes." />
          {applied !== null && !applying && (
            <span className="text-xs text-zinc-400">{applied === 1 ? '1 week updated' : `${applied} weeks updated`}</span>
          )}
        </div>
      )}
    </div>
  )
}
