import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import MyTaskCheckbox from '@/components/MyTaskCheckbox'
import CourseCalendar, { type CalendarCourse } from '@/components/CourseCalendar'
import { courseShortName } from '@/lib/courses'

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ cal?: string }> }) {
  const { cal } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role, first_name, last_name, email')
    .eq('id', user.id)
    .single()

  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const isAdmin = profile?.role === 'admin'
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    || profile?.email
    || user.email

  // Personalized: courses you're assigned to teach + tasks assigned to you.
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  type InstRow = {
    id: string
    ref_number: number
    course_type: string
    custom_title: string | null
    client_name: string | null
    location: string | null
    starts_at: string | null
    ends_at: string | null
    status: string
  }
  const [{ data: assignmentRows }, { data: taskRows }] = await Promise.all([
    admin
      .from('instance_instructors')
      .select('role, course_instances!inner(id, ref_number, course_type, custom_title, client_name, location, starts_at, ends_at, status), instructors!inner(profile_id)')
      .eq('instructors.profile_id', user.id),
    admin
      .from('course_tasks')
      .select('id, title, due_date, instance_id, course_instances(course_type, custom_title, status)')
      .eq('assigned_to', user.id)
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(12),
  ])

  const myCourses = (assignmentRows ?? [])
    .map((a) => ({ role: a.role as string, inst: a.course_instances as unknown as InstRow }))
    .filter((c) => c.inst && c.inst.status !== 'cancelled' && (!c.inst.ends_at || c.inst.ends_at >= today))
    .sort((a, b) => (a.inst.starts_at ?? '9999').localeCompare(b.inst.starts_at ?? '9999'))

  // Personal calendar: every assigned course with dates (past months included
  // so back-navigation isn't empty), cancelled excluded.
  const calendarCourses: CalendarCourse[] = (assignmentRows ?? [])
    .map((a) => a.course_instances as unknown as InstRow)
    .filter((i) => i && i.status !== 'cancelled' && i.starts_at && i.ends_at)
    .map((i) => ({
      id: i.id,
      label: courseShortName(i.course_type, i.custom_title),
      status: i.status,
      starts_at: i.starts_at!,
      ends_at: i.ends_at! >= i.starts_at! ? i.ends_at! : i.starts_at!,
      href: `/portal/${i.id}`,
    }))

  const myTasks = (taskRows ?? [])
    .filter((t) => (t.course_instances as unknown as { status: string } | null)?.status !== 'cancelled')
    .map((t) => ({
      ...t,
      courseName: t.course_instances
        ? courseShortName(
            (t.course_instances as unknown as { course_type: string }).course_type,
            (t.course_instances as unknown as { custom_title: string | null }).custom_title
          )
        : null,
    }))

  const fmtRange = (c: InstRow) => {
    const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!c.starts_at) return 'dates TBD'
    return c.ends_at && c.ends_at !== c.starts_at ? `${f(c.starts_at)} – ${f(c.ends_at)}` : f(c.starts_at)
  }
  const fmtDue = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Portal</h1>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
              isAdmin
                ? 'bg-pr-red/15 border-pr-red/40 text-pr-red'
                : 'bg-teal-900/40 border-teal-700 text-teal-300'
            }`}
          >
            {isAdmin ? 'Admin' : 'Instructor'}
          </span>
          {displayName && (
            <span className="text-sm text-zinc-500">Signed in as {displayName}</span>
          )}
        </div>
        {myCourses.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Your upcoming courses</h2>
            <div className="space-y-2">
              {myCourses.map((c) => (
                <Link
                  key={c.inst.id}
                  href={`/portal/${c.inst.id}`}
                  className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-pr-red transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {courseShortName(c.inst.course_type, c.inst.custom_title)}
                      {c.inst.client_name && <span className="text-zinc-400 font-normal"> · {c.inst.client_name}</span>}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {fmtRange(c.inst)}
                      {c.inst.location ? ` · ${c.inst.location}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      c.role === 'lead'
                        ? 'border-teal-700 bg-teal-900/30 text-teal-300'
                        : 'border-blue-800 bg-blue-900/20 text-blue-300'
                    }`}
                  >
                    {c.role}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {calendarCourses.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Your calendar</h2>
            <CourseCalendar
              month={/^\d{4}-\d{2}$/.test(cal ?? '') ? cal! : today.slice(0, 7)}
              basePath="/admin"
              courses={calendarCourses}
            />
          </section>
        )}

        {myTasks.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Your open tasks</h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {myTasks.map((t) => (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                  <MyTaskCheckbox instanceId={t.instance_id} taskId={t.id} />
                  <Link href={`/portal/${t.instance_id}`} className="min-w-0 flex-1 group">
                    <p className="text-sm group-hover:text-pr-red-light transition-colors truncate">{t.title}</p>
                    {t.courseName && <p className="text-xs text-zinc-500 truncate">{t.courseName}</p>}
                  </Link>
                  {t.due_date && (
                    <span className={`text-xs shrink-0 ${t.due_date < today ? 'text-red-400' : 'text-zinc-500'}`}>
                      {t.due_date < today ? 'overdue · ' : ''}{fmtDue(t.due_date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/instructors"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="84" height="28" viewBox="0 0 72 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="36" cy="7" r="4"/><path d="M44 21v-2a4 4 0 0 0-4-4H32a4 4 0 0 0-4 4v2"/>
              <circle cx="60" cy="7" r="4"/><path d="M68 21v-2a4 4 0 0 0-4-4H56a4 4 0 0 0-4 4v2"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">Instructor Profiles</h2>
            <p className="text-zinc-400 text-sm">Certifications, expertise, and portal access</p>
          </Link>
          <Link
            href="/admin/courses"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">Courses</h2>
            <p className="text-zinc-400 text-sm">Schedule and manage course instances</p>
          </Link>
          <Link
            href="/instructor"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">My Profile</h2>
            <p className="text-zinc-400 text-sm">Manage your bio, photo, and certifications</p>
          </Link>
          <Link
            href="/instructor/expenses"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">Expense Reports</h2>
            <p className="text-zinc-400 text-sm">File reimbursement requests with receipts</p>
          </Link>
          {profile?.role === 'admin' && (
            <Link
              href="/admin/expenses"
              className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <h2 className="font-semibold text-lg mb-1">Expenses Admin</h2>
              <p className="text-zinc-400 text-sm">All reports, rates, and per-course spending</p>
            </Link>
          )}
          {profile?.role === 'admin' && (
            <Link
              href="/admin/contact"
              className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <h2 className="font-semibold text-lg mb-1">Contact Submissions</h2>
              <p className="text-zinc-400 text-sm">Messages from the public contact form</p>
            </Link>
          )}
          {profile?.role === 'admin' && (
            <Link
              href="/admin/gallery"
              className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
              <h2 className="font-semibold text-lg mb-1">Gallery</h2>
              <p className="text-zinc-400 text-sm">Upload and manage public gallery photos</p>
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
