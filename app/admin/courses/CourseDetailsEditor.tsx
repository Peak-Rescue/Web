import { updateInstanceDetails, updateInstanceDates, addOffDay, removeOffDay, setOffDayPaid } from './actions'
import AutoSaveForm from '@/components/AutoSaveForm'
import TrashIcon from '@/components/TrashIcon'
import InfoHint from '@/components/InfoHint'
import { CourseTypeSelect } from './CourseTypeSelect'
import CourseLocationFields from '@/components/CourseLocationFields'
import CourseContactsEditor from '@/components/CourseContactsEditor'
import { computeBlocks } from '@/lib/courses'

/** An off day as this screen needs it: the range for the arithmetic, the id,
    because the list next to it removes them, and whether the crew is paid
    through it — a break the instructors are paid for still costs a day. */
export type CourseOffDay = {
  id: string
  off_date: string
  end_date: string | null
  instructors_paid?: boolean | null
}
import { type CoursePOC } from '@/lib/contacts'
import { type Venue } from '@/lib/library'

function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export type CourseDetailsRow = {
  course_category: string | null
  course_type: string | null
  custom_title: string | null
  custom_categories: string[] | null
  status: string
  location: string | null
  region: string | null
  venue_id: string | null
  client_name: string | null
  max_students: number | null
  instructor_slots: number | null
  starts_at: string | null
  ends_at: string | null
}

// What a course *is*, as opposed to how it runs: the offering, who asked, who
// to call, how many, when.
//
// A server component, like the curriculum editor and for the same reason — it
// is auto-saving forms bound to server actions, which cannot be built inside a
// client component. Rendered by the admin course editor and, behind the same
// edit control as everything else, by the course page itself.
export default function CourseDetailsEditor({
  instanceId,
  course,
  contacts,
  venues,
  offDays,
  internal,
}: {
  instanceId: string
  course: CourseDetailsRow
  contacts: CoursePOC[]
  venues: Venue[]
  offDays: CourseOffDay[]
  internal: boolean
}) {
  const updateDetails = updateInstanceDetails.bind(null, instanceId)
  const updateDates = updateInstanceDates.bind(null, instanceId)
  const addOffDayHere = addOffDay.bind(null, instanceId)

  const blocks = course.starts_at && course.ends_at
    ? computeBlocks(course.starts_at, course.ends_at, offDays)
    : []

  return (
    <div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800">
      <AutoSaveForm action={updateDetails} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
        <CourseTypeSelect
          defaultCategory={course.course_category ?? undefined}
          defaultType={course.course_type ?? undefined}
          defaultCustomTitle={course.custom_title ?? ''}
          defaultCustomCategories={course.custom_categories ?? []}
          defaultInternal={internal}
        />
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Status</label>
          <select name="status" defaultValue={course.status} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
            <option value="tentative">Tentative</option>
            <option value="quoted">Quoted</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Location</label>
          <input name="location" defaultValue={course.location ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
        </div>
        <CourseLocationFields
          venues={venues}
          defaultRegion={course.region}
          defaultVenueId={course.venue_id}
        />
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Client / organization</label>
          <input name="client_name" defaultValue={course.client_name ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
        </div>
        <CourseContactsEditor initial={contacts} />
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Max students</label>
          <input name="max_students" type="number" min="1" defaultValue={course.max_students ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Instructor slots</label>
          <input name="instructor_slots" type="number" min="1" defaultValue={course.instructor_slots ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
        </div>
      </AutoSaveForm>

      <div className="p-6 pt-5 border-t border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">Dates</h3>

      {/* Overall window — auto-saved */}
      <AutoSaveForm action={updateDates} className="grid grid-cols-2 gap-4 p-4 bg-zinc-950/40 border border-zinc-800 rounded-lg mb-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Course start</label>
          <input name="starts_at" type="date" defaultValue={course.starts_at ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Course end</label>
          <input name="ends_at" type="date" defaultValue={course.ends_at ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
        </div>
      </AutoSaveForm>

      {/* Off days — folded behind a deliberate reveal: most courses run
          straight through, and an exposed date form here invites people
          to mistake it for the course dates. */}
      <details open={(offDays ?? []).length > 0} className="mb-4 group/off">
        <summary className="cursor-pointer list-none text-sm text-zinc-400 hover:text-zinc-200 transition-colors select-none">
          <span className="text-zinc-600 text-xs mr-1.5 inline-block transition-transform group-open/off:rotate-90">▶</span>
          Dates to exclude
        </summary>
        <div className="mt-3">
        <p className="text-xs text-zinc-500 mb-3">
          Rest days inside the course window — not the start/end.
        </p>
        {(offDays ?? []).length > 0 && (
          <div className="space-y-2 mb-3">
            {(offDays ?? []).map(o => {
              const removeOffDayWithArgs = removeOffDay.bind(null, instanceId, o.id)
              const isRange = o.end_date && o.end_date !== o.off_date
              return (
                <div key={o.id} className="flex items-center justify-between gap-2 px-4 py-2 bg-zinc-950/40 border border-zinc-800 rounded-lg">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 font-medium">{isRange ? 'Range' : 'Day'}</span>
                    <span className="text-sm">
                      {isRange ? `${fmt(o.off_date)} → ${fmt(o.end_date!)}` : fmt(o.off_date)}
                    </span>
                    {/* Answered when the break was added; flipped here rather
                        than by deleting and retyping the dates. */}
                    <form action={setOffDayPaid.bind(null, instanceId, o.id, !o.instructors_paid)}>
                      <button
                        type="submit"
                        title={
                          o.instructors_paid
                            ? 'Instructors are paid through this break — click to make it unpaid'
                            : 'Instructors are not paid through this break — click if they are'
                        }
                        className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                          o.instructors_paid
                            ? 'border-amber-700/60 text-amber-300/90 hover:border-amber-600'
                            : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {o.instructors_paid ? 'Instructors paid' : 'Unpaid'}
                      </button>
                    </form>
                  </div>
                  <form action={removeOffDayWithArgs}>
                    <button
                      type="submit"
                      title="Remove this date"
                      aria-label="Remove this date"
                      className="text-sm leading-none text-zinc-600 hover:text-pr-red-light transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
        <form action={addOffDayHere} className="flex gap-2 flex-wrap items-end p-4 bg-zinc-950/40 border border-dashed border-zinc-700 rounded-lg">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Start date</label>
            <input name="off_date" type="date" required className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">End date <span className="text-zinc-600">(optional)</span></label>
            <input name="end_date" type="date" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-zinc-300 pb-2 cursor-pointer">
            <input
              name="instructors_paid"
              type="checkbox"
              className="w-4 h-4 accent-pr-red bg-zinc-800 border-zinc-700 rounded"
            />
            Paying instructors
            <InfoHint
              below
              text="Whether the crew is on the clock through the break. A paid break still counts as an instructor day on the estimate; an unpaid one comes off it. Lodging, the vehicle and meals span the break either way — nobody returns the truck for a weekend."
            />
          </label>
          <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
            Add
          </button>
        </form>
        </div>
      </details>

      {/* Computed blocks preview — only when off-days split the course; a
          single block just repeats the start/end dates above */}
      {blocks.length > 1 && (
        <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-lg">
          <p className="text-xs text-zinc-500 mb-2">Calendar blocks ({blocks.length})</p>
          <div className="space-y-1">
            {blocks.map((b, i) => (
              <div key={i} className="text-sm">
                <span className="text-zinc-500 text-xs mr-2">Block {i + 1}</span>
                <span className="font-medium">{fmt(b.starts_at)}</span>
                {b.starts_at !== b.ends_at && <span className="text-zinc-400"> → {fmt(b.ends_at)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      </div>
    </div>
  )
}
