import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInstance } from './actions'
import CreateCourseButton from './CreateCourseButton'
import { CourseTypeSelect } from './CourseTypeSelect'
import { courseShortName, courseEventTitle, crewFirstNames } from '@/lib/courses'
import CourseCalendar, { type CalendarCourse } from '@/components/CourseCalendar'
import CourseContactsEditor from '@/components/CourseContactsEditor'
import CourseList, { type Instance } from './CourseList'
import CourseLocationFields from '@/components/CourseLocationFields'

function firstStartDate(inst: Instance): string | null {
  return inst.starts_at ?? null
}

function lastEndDate(inst: Instance): string | null {
  return inst.ends_at ?? null
}

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ cal?: string; cat?: string }> }) {
  const { cal, cat } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: raw }, { data: venueRows }] = await Promise.all([
    admin
      .from('course_instances')
      .select(`
        id, ref_number, slug, course_type, course_category, custom_title, status, location, client_name, starts_at, ends_at, max_students, internal,
        instance_instructors(count),
        crew:instance_instructors(role, instructors(name)),
        enrollments(count),
        course_estimates(count)
      `),
    admin.from('venues').select('id, name, region_code').eq('active', true).order('name'),
  ])

  const instances = (raw ?? []) as unknown as Instance[]

  const today = new Date().toISOString().slice(0, 10)

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
        <details className="mb-10 group">
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
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start date (optional)</label>
              <input name="starts_at" type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">End date (optional)</label>
              <input name="ends_at" type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Number of students</label>
              <input name="max_students" type="number" min="1" placeholder="e.g. 10" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Instructor slots</label>
              <input name="instructor_slots" type="number" min="1" placeholder="e.g. 3" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <textarea name="notes" rows={3} placeholder="What they asked for, rough timing, budget signals, follow-ups…" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-zinc-500" />
            </div>

            <div className="sm:col-span-2">
              <CreateCourseButton />
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
        <CourseList upcoming={upcoming} past={past} />
      </div>
    </main>
  )
}
