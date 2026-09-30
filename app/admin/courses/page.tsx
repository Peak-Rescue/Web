import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInstance } from './actions'
import CreateCourseButton from './CreateCourseButton'
import CancelNewCourseButton from './CancelNewCourseButton'
import { CourseTypeSelect } from './CourseTypeSelect'
import { courseShortName, courseEventTitle, crewFirstNames } from '@/lib/courses'
import CourseCalendar, { type CalendarCourse } from '@/components/CourseCalendar'
import NewCourseDates from '@/components/NewCourseDates'
import CourseContactsEditor from '@/components/CourseContactsEditor'
import CourseList, { type Instance } from './CourseList'
import CourseLocationFields from '@/components/CourseLocationFields'
import { todayHere } from '@/lib/course-clock'
import { loadCourseExtras, loadBooksSettleDays, showsSteps, coursePhase } from '@/lib/course-readiness'
import { loadCourseOwners } from '@/lib/course-owner'
import InfoHint from '@/components/InfoHint'
import { CREW_SEAT_FIELDS, ROLE_TEXT } from '@/lib/staffing-roles'
import { clashesAcross, clashNames, asClashCourse } from '@/lib/staffing-conflicts'

function firstStartDate(inst: Instance): string | null {
  return inst.starts_at ?? null
}

function lastEndDate(inst: Instance): string | null {
  return inst.ends_at ?? null
}

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ cal?: string; cat?: string; new?: string }> }) {
  const { cal, cat, new: openNew } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: raw }, { data: venueRows }, { data: allOffDays }] = await Promise.all([
    admin
      .from('course_instances')
      .select(`
        id, ref_number, slug, course_type, course_category, custom_title, status, location, client_name, contacts, owner_id, invite_token, invite_expires_at, starts_at, ends_at, max_students, instructor_slots, lead_slots, assist_slots, shadow_slots, internal,
        instance_instructors(count),
        crew:instance_instructors(instructor_id, role, in_charge, instructors(name)),
        enrollments(count),
        course_estimates(count)
      `),
    admin.from('venues').select('id, name, region_code').eq('active', true).order('name'),
    // Breaks, for every course at once. Needed because a clash is counted day by
    // day: a course running entirely inside another's rest week is not a clash,
    // and without the breaks the chain would cry double-booked at a crew who are
    // genuinely free. One small query, and it saves a per-row one.
    admin.from('instance_off_days').select('instance_id, off_date, end_date'),
  ])

  // Who could be driving a course, for the pill on every row and the filter
  // that asks which of them are yours.
  const owners = await loadCourseOwners(admin)

  const instances = (raw ?? []) as unknown as Instance[]

  const today = todayHere()

  // Who is on two courses at once, across the whole book, in one pass over rows
  // already loaded. This used to be knowable only by opening the staffing panel
  // on one of the two courses — so a date move that created a clash said nothing
  // and the chain went on reading "2 of 2". Now the chain asks.
  const offDaysByCourse = new Map<string, { off_date: string; end_date: string | null }[]>()
  for (const o of allOffDays ?? []) {
    const list = offDaysByCourse.get(o.instance_id as string) ?? []
    list.push({ off_date: o.off_date as string, end_date: (o.end_date as string | null) ?? null })
    offDaysByCourse.set(o.instance_id as string, list)
  }
  const clashesByCourse = clashesAcross(
    instances.map((i) => ({
      // Built field by field rather than spread: the list's row already uses
      // `instance_instructors` for a count, and the clash shape wants ids under
      // that name. Spreading one into the other compiles and means nothing.
      ...asClashCourse({
        ref_number: i.ref_number,
        course_type: i.course_type,
        custom_title: i.custom_title,
        client_name: i.client_name,
        status: i.status,
        starts_at: i.starts_at,
        ends_at: i.ends_at,
      }),
      id: i.id,
      offDays: offDaysByCourse.get(i.id) ?? [],
      crew: (i.crew ?? []).map((c) => ({ instructor_id: c.instructor_id })),
    }))
  )
  const nameById = new Map<string, string>()
  for (const i of instances) {
    for (const c of i.crew ?? []) {
      if (c.instructors?.name) nameById.set(c.instructor_id, c.instructors.name)
    }
  }
  const doubleBooked: Record<string, string[]> = Object.fromEntries(
    Object.entries(clashesByCourse).map(([courseId, conflicts]) => [
      courseId,
      clashNames(conflicts, (id) => nameById.get(id)),
    ])
  )

  // Everything already on the books, for the date painter's overlay in the
  // create form — the same set the calendar below draws, minus its chrome.
  const otherCourses = instances
    .filter((i) => i.starts_at && i.ends_at && i.status !== 'cancelled')
    .map((i) => ({
      id: i.id,
      label: courseEventTitle(i, []),
      starts_at: i.starts_at!,
      ends_at: i.ends_at! >= i.starts_at! ? i.ends_at! : i.starts_at!,
      category: i.course_category ?? null,
      internal: Boolean(i.internal),
      client: i.client_name,
    }))

  // Upcoming: last end date is today or in the future (or no dates yet)
  // Past: last end date is before today
  const upcoming = instances
    .filter(i => {
      const end = lastEndDate(i)
      return !end || end >= today
    })
    .sort((a, b) => {
      const aDate = firstStartDate(a) ?? 'z'
      const bDate = firstStartDate(b) ?? 'z'
      return aDate.localeCompare(bDate)
    })

  const past = instances
    .filter(i => {
      const end = lastEndDate(i)
      return !!end && end < today
    })
    .sort((a, b) => {
      const aDate = firstStartDate(a) ?? ''
      const bDate = firstStartDate(b) ?? ''
      return bDate.localeCompare(aDate) // most recent first
    })

  // What each course still owes.
  //
  // Two lists, because two kinds of course are shown. The full chain and the
  // build track under it are drawn only for courses still ahead of us or
  // running — a course that has already happened is not waiting on a gear
  // list. Every non-cancelled course still gets its money and its books, past
  // ones included: an unsent invoice on a course that ran last month is
  // exactly the thing this page exists to surface.
  const shown = [...upcoming, ...past].filter((i) => showsSteps(i.status))
  const chainIds = shown.filter((i) => coursePhase(i, today) !== 'over').map((i) => i.id)
  const [extras, settleDays] = await Promise.all([
    loadCourseExtras(admin, chainIds, shown.map((i) => i.id)),
    loadBooksSettleDays(admin),
  ])

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="text-zinc-400 mt-1">Schedule and manage course instances</p>
        </div>

        {/* What the next person needs to pick this up: who asked, who to call,
            what they said, when, where, how many, and how likely it is to
            happen at all.

            None of it is filler. Every field here answers something that only
            exists in the head of whoever took the call — including the two
            that look like setup numbers and the one that looks like workflow
            state. The headcount drives gear, staffing and the estimate, and
            the status is how sure we are the thing is real. */}
        {/* Opens itself for the + on the portal calendar, which is where
            the gap you are filling was visible. */}
        <details id="new-course" open={Boolean(openNew)} className="mb-10 group scroll-mt-24">
          <summary className="cursor-pointer list-none">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded font-medium text-sm transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Course Instance
            </div>
          </summary>
          <form action={createInstance} className="mt-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CourseTypeSelect />

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Status</label>
              <select name="status" defaultValue="tentative" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
                <option value="tentative">Tentative</option>
                <option value="quoted">Quoted</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Location</label>
              <input name="location" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <CourseLocationFields venues={venueRows ?? []} />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Client / organization</label>
              <input name="client_name" placeholder="e.g. 24th STS" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <CourseContactsEditor initial={[]} />
            <NewCourseDates today={today} others={otherCourses} />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Number of students</label>
              <input name="max_students" type="number" min="1" placeholder="e.g. 10" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Crew plan
                <InfoHint text="How many of each the course runs. Each is a wage, and it is what the call-out asks an instructor to accept. Empty is fine at intake." />
              </label>
              <div className="flex items-end gap-2">
                {CREW_SEAT_FIELDS.map((f) => (
                  <div key={f.name} className="flex-1 min-w-0">
                    <span className={`block text-[10px] font-semibold uppercase tracking-wide mb-1 ${ROLE_TEXT[f.role]}`}>{f.label}</span>
                    <input
                      name={f.name}
                      type="number"
                      min="0"
                      step="1"
                      placeholder={f.role === 'lead' ? '1' : f.role === 'assist' ? '2' : ''}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <textarea name="notes" rows={3} placeholder="What they asked for, rough timing, budget signals, follow-ups…" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-zinc-500" />
            </div>

            {/* A way out, beside the way in. The form opens from a summary
                that scrolls off the top once it is filled in, and from the +
                on the calendar, where there was no summary to click back. */}
            <div className="sm:col-span-2 flex items-center gap-2">
              <CreateCourseButton />
              <CancelNewCourseButton />
            </div>
          </form>
        </details>

        {/* ── Calendar (collapsed by default; auto-open while navigating months) ── */}
        <details open={Boolean(cal)} className="mb-16 group">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-lg font-semibold select-none">
            <span className="text-zinc-600 text-sm transition-transform group-open:rotate-90">▶</span>
            Calendar
          </summary>
          <div className="mt-4">
          <CourseCalendar
            month={/^\d{4}-\d{2}$/.test(cal ?? '') ? cal! : today.slice(0, 7)}
            basePath="/admin/courses"
            category={cat}
            courses={
              instances
                .filter((i) => i.starts_at && i.ends_at && i.status !== 'cancelled')
                .map((i) => {
                  const crew = crewFirstNames(
                    (i.crew ?? [])
                      .filter((r) => r.instructors)
                      .map((r) => ({ role: r.role, name: r.instructors!.name }))
                  )
                  return {
                    id: i.id,
                    // Mirrors the Google Calendar event title convention.
                    label: courseEventTitle(i, crew),
                    status: i.status,
                    starts_at: i.starts_at!,
                    ends_at: i.ends_at! >= i.starts_at! ? i.ends_at! : i.starts_at!,
                    href: `/portal/${i.id}`,
                    category: i.course_category ?? null,
                    internal: !!i.internal,
                    name: courseShortName(i.course_type, i.custom_title),
                    client: i.client_name,
                    location: i.location,
                    crew,
                  }
                }) as CalendarCourse[]
            }
          />
          </div>
        </details>

        {/* ── Course list with filters ─────────────────────────────── */}
        <CourseList upcoming={upcoming} past={past} extras={extras} today={today} settleDays={settleDays} owners={owners} doubleBooked={doubleBooked} />
      </div>
    </main>
  )
}
