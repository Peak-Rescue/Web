import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import MyTasksList from '@/components/MyTasksList'
import { loadMyOpenTasks } from '@/lib/course-tasks'
import CourseCalendar, { type CalendarCourse } from '@/components/CourseCalendar'
import StaffingInterestList from '@/components/StaffingInterestList'
import { courseShortName, courseEventTitle, crewFirstNames } from '@/lib/courses'
import { courseCapabilityCategories } from '@/lib/capabilities'

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ cal?: string; scope?: string; as?: string; cat?: string }> }) {
  const { cal, scope, as, cat } = await searchParams
  const showAllCourses = scope === 'all'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  type InstRow = {
    id: string
    ref_number: number
    course_type: string
    course_category?: string | null
    custom_title: string | null
    client_name: string | null
    location: string | null
    starts_at: string | null
    ends_at: string | null
    status: string
    custom_categories?: string[] | null
    instance_instructors?: { role: string; instructors: { name: string } | null }[] | null
  }
  // Profile gate + personalized data in one parallel round.
  const [{ data: profile }, { data: assignmentRows }, myTasks, allInstancesRes, { data: inviteRows }, { data: capRow }] = await Promise.all([
    admin.from('profiles').select('role, first_name, last_name, email').eq('id', user.id).single(),
    admin
      .from('instance_instructors')
      .select('role, course_instances!inner(id, ref_number, course_type, course_category, custom_title, client_name, location, starts_at, ends_at, status, instance_instructors(role, instructors(name))), instructors!inner(profile_id)')
      .eq('instructors.profile_id', user.id),
    loadMyOpenTasks(admin, user.id),
    showAllCourses
      ? admin
          .from('course_instances')
          .select('id, ref_number, course_type, course_category, custom_title, custom_categories, client_name, location, starts_at, ends_at, status, instance_instructors(role, instructors(name))')
          .neq('status', 'cancelled')
      : Promise.resolve({ data: null }),
    admin
      .from('course_interest_invites')
      .select('token, interested, note, course_instances!inner(id, ref_number, course_type, custom_title, client_name, location, starts_at, ends_at, status), instructors!inner(profile_id)')
      .eq('instructors.profile_id', user.id)
      .not('sent_at', 'is', null),
    showAllCourses
      ? admin.from('instructors').select('instructor_capabilities(category)').eq('profile_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const isAdmin = profile?.role === 'admin'
  // Admins can preview this page as an instructor via ?as=instructor — purely
  // a display role; the access gate above uses the real one.
  const viewAs = isAdmin && as === 'instructor' ? ('instructor' as const) : null
  const showAsAdmin = viewAs ? false : isAdmin
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    || profile?.email
    || user.email

  // Course-portal links keep the preview role, so the whole click-through
  // stays in instructor view.
  const portalHref = (id: string) => (viewAs ? `/portal/${id}?as=${viewAs}` : `/portal/${id}`)

  const myCourses = (assignmentRows ?? [])
    .map((a) => ({ role: a.role as string, inst: a.course_instances as unknown as InstRow }))
    .filter((c) => c.inst && c.inst.status !== 'cancelled' && (!c.inst.ends_at || c.inst.ends_at >= today))
    .sort((a, b) => (a.inst.starts_at ?? '9999').localeCompare(b.inst.starts_at ?? '9999'))

  const assignedIds = new Set(
    (assignmentRows ?? []).map((a) => (a.course_instances as unknown as InstRow).id)
  )

  // Live staffing-interest invites (answered or not) for upcoming courses the
  // viewer isn't already assigned to — answers stay changeable until then.
  const liveInvites = (inviteRows ?? [])
    .map((r) => ({
      token: r.token as string,
      interested: r.interested as boolean | null,
      note: r.note as string | null,
      inst: r.course_instances as unknown as InstRow,
    }))
    .filter(
      (r) =>
        r.inst &&
        r.inst.status !== 'cancelled' &&
        (!r.inst.ends_at || r.inst.ends_at >= today) &&
        !assignedIds.has(r.inst.id)
    )
    .sort(
      (a, b) =>
        Number(a.interested !== null) - Number(b.interested !== null) ||
        (a.inst.starts_at ?? '9999').localeCompare(b.inst.starts_at ?? '9999')
    )

  // Calendar: assigned courses by default, every course when scope=all (past
  // months included so back-navigation isn't empty), cancelled excluded.
  // Instructors' "All courses" is scoped to their teaching expertise: courses
  // whose type falls under a category they hold (lead or assist), plus
  // anything they're assigned to. Admins see everything.
  // Chips only link where the viewer can actually open the course portal.
  const myCategories = new Set(
    ((capRow?.instructor_capabilities ?? []) as { category: string }[]).map((c) => c.category)
  )
  const calendarSource: InstRow[] = showAllCourses
    ? ((allInstancesRes.data ?? []) as unknown as InstRow[]).filter(
        (i) =>
          showAsAdmin ||
          assignedIds.has(i.id) ||
          courseCapabilityCategories(i.course_type, i.custom_categories).some((c) => myCategories.has(c))
      )
    : (assignmentRows ?? []).map((a) => a.course_instances as unknown as InstRow)
  // Chip labels mirror the Google Calendar event titles: name — client —
  // location — crew first names (lead first).
  const chipCrew = (i: InstRow) =>
    crewFirstNames(
      (i.instance_instructors ?? [])
        .filter((r) => r.instructors)
        .map((r) => ({ role: r.role, name: r.instructors!.name }))
    )
  const calendarCourses: CalendarCourse[] = calendarSource
    .filter((i) => i && i.status !== 'cancelled' && i.starts_at && i.ends_at)
    .map((i) => ({
      id: i.id,
      label: courseEventTitle(i, chipCrew(i)),
      status: i.status,
      starts_at: i.starts_at!,
      ends_at: i.ends_at! >= i.starts_at! ? i.ends_at! : i.starts_at!,
      href: showAsAdmin || assignedIds.has(i.id) ? portalHref(i.id) : undefined,
      category: i.course_category ?? null,
      name: courseShortName(i.course_type, i.custom_title),
      client: i.client_name,
      location: i.location,
      crew: chipCrew(i),
    }))

  const calMonth = /^\d{4}-\d{2}$/.test(cal ?? '') ? cal! : today.slice(0, 7)

  const homeHref = ({ all = showAllCourses, view = viewAs, month = cal }: { all?: boolean; view?: string | null; month?: string } = {}) => {
    const q = new URLSearchParams()
    if (month) q.set('cal', month)
    if (all) q.set('scope', 'all')
    if (view) q.set('as', view)
    if (cat) q.set('cat', cat)
    const s = q.toString()
    return s ? `/admin?${s}` : '/admin'
  }


  // Portal destinations, grouped: personal tools render as cards, admin
  // consoles as dense rows under one Administration header.
  type PortalLink = {
    title: string
    desc: string
    href: string
    icon: React.ReactNode
    section: 'personal' | 'admin'
    preserveView?: boolean // append ?as=… so the instructor preview carries through
  }
  const svgProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  const portalLinks: PortalLink[] = [
    {
      title: 'My Profile',
      desc: 'Manage your bio, photo, and certifications',
      href: '/instructor',
      section: 'personal',
      icon: (
        <svg {...svgProps}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      ),
    },
    {
      title: 'My Expense Reports',
      desc: 'File and track your reimbursement requests',
      href: '/instructor/expenses',
      section: 'personal',
      icon: (
        <svg {...svgProps}>
          <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>
        </svg>
      ),
    },
    {
      title: 'All Instructor Profiles',
      desc: 'Certifications, expertise, and portal access',
      href: '/admin/instructors',
      section: 'personal',
      icon: (
        <svg {...svgProps} viewBox="0 0 72 24">
          <circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="36" cy="7" r="4"/><path d="M44 21v-2a4 4 0 0 0-4-4H32a4 4 0 0 0-4 4v2"/>
          <circle cx="60" cy="7" r="4"/><path d="M68 21v-2a4 4 0 0 0-4-4H56a4 4 0 0 0-4 4v2"/>
        </svg>
      ),
    },
    {
      title: 'Employee Documents',
      desc: 'Handbook, policies, and employment paperwork',
      href: '/admin/employee-info',
      section: 'personal',
      preserveView: true,
      icon: (
        <svg {...svgProps}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      ),
    },
    {
      title: 'Courses',
      desc: 'Schedule and manage course instances',
      href: '/admin/courses',
      section: 'admin',
      icon: (
        <svg {...svgProps}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
        </svg>
      ),
    },
    {
      title: 'Expense Admin',
      desc: "Everyone's reports, rates, and per-course spending",
      href: '/admin/expenses',
      section: 'admin',
      icon: (
        <svg {...svgProps}>
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
    {
      title: 'Contact Submissions',
      desc: 'Messages from the public contact form',
      href: '/admin/contact',
      section: 'admin',
      icon: (
        <svg {...svgProps}>
          <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
      ),
    },
    {
      title: 'Gallery',
      desc: 'Upload and manage public gallery photos',
      href: '/admin/gallery',
      section: 'admin',
      icon: (
        <svg {...svgProps}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      ),
    },
    {
      title: 'Reference',
      desc: 'Manuals, tech notes, standards and venue beta',
      href: '/instructor/reference',
      section: 'personal',
      icon: (
        <svg {...svgProps}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
      ),
    },
    {
      title: 'Gear Catalog',
      desc: 'The kit our lists are built from, and the models that satisfy each type',
      href: '/admin/gear',
      section: 'admin',
      icon: (
        <svg {...svgProps}>
          <path d="M20.5 7.3l-8-4.6a1 1 0 0 0-1 0l-8 4.6a1 1 0 0 0-.5.87v9.26a1 1 0 0 0 .5.87l8 4.6a1 1 0 0 0 1 0l8-4.6a1 1 0 0 0 .5-.87V8.17a1 1 0 0 0-.5-.87z"/><path d="M3.3 7.7L12 12.8l8.7-5.1M12 22V12.8"/>
        </svg>
      ),
    },
    {
      title: 'Content Library',
      desc: 'Course material, references, maps and venue packs',
      href: '/admin/library',
      section: 'admin',
      icon: (
        <svg {...svgProps}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      ),
    },
  ]
  const linkHref = (l: PortalLink) => (l.preserveView && viewAs ? `${l.href}?as=${viewAs}` : l.href)

  const fmtRange = (c: InstRow) => {
    const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!c.starts_at) return 'dates TBD'
    return c.ends_at && c.ends_at !== c.starts_at ? `${f(c.starts_at)} – ${f(c.ends_at)}` : f(c.starts_at)
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Portal</h1>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
              showAsAdmin
                ? 'bg-pr-red/15 border-pr-red/40 text-pr-red'
                : 'bg-teal-900/40 border-teal-700 text-teal-300'
            }`}
          >
            {showAsAdmin ? 'Admin' : 'Instructor'}
          </span>
          {displayName && (
            <span className="text-sm text-zinc-500">Signed in as {displayName}</span>
          )}
          {isAdmin && (
            <div className="ml-auto flex items-center gap-1 text-xs">
              <span className="text-zinc-600 mr-1">Viewing as</span>
              {([
                [null, 'Admin', 'Everything, unfiltered'],
                ['instructor', 'Instructor', 'What an instructor sees'],
              ] as const).map(([key, label, hint]) => (
                <Link
                  key={label}
                  href={homeHref({ view: key })}
                  title={hint}
                  className={`px-2 py-1 rounded font-medium transition-colors ${
                    viewAs === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {myCourses.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Your upcoming courses</h2>
            <div className="space-y-2">
              {myCourses.map((c) => (
                <div
                  key={c.inst.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-pr-red transition-colors"
                >
                  <Link href={portalHref(c.inst.id)} className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {courseShortName(c.inst.course_type, c.inst.custom_title)}
                      {c.inst.client_name && <span className="text-zinc-400 font-normal"> · {c.inst.client_name}</span>}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {fmtRange(c.inst)}
                      {c.inst.location ? ` · ${c.inst.location}` : ''}
                    </p>
                  </Link>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      c.role === 'lead'
                        ? 'border-teal-700 bg-teal-900/30 text-teal-300'
                        : 'border-blue-800 bg-blue-900/20 text-blue-300'
                    }`}
                  >
                    {c.role}
                  </span>
                  {showAsAdmin && (
                    <Link
                      href={`/admin/courses/${c.inst.id}`}
                      title="Edit course"
                      aria-label="Edit course"
                      className="shrink-0 p-1.5 -my-1 -mr-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {liveInvites.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Courses looking for staff</h2>
            <StaffingInterestList
              items={liveInvites.map((r) => ({
                token: r.token,
                title: courseShortName(r.inst.course_type, r.inst.custom_title),
                client: r.inst.client_name,
                meta: `${fmtRange(r.inst)}${r.inst.location ? ` · ${r.inst.location}` : ''}`,
                interested: r.interested,
                note: r.note,
              }))}
            />
          </section>
        )}

        {myTasks.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Your open tasks</h2>
            <MyTasksList tasks={myTasks} />
          </section>
        )}

        <details open={Boolean(cal) || showAllCourses} className="mb-10 group">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-medium text-zinc-500 uppercase tracking-wide select-none">
            <span className="text-zinc-600 text-xs transition-transform group-open:rotate-90">▶</span>
            {/* Not "Your calendar" — the toggle underneath switches between
                your courses and everyone's, so the heading would contradict
                itself half the time. The toggle says whose it is. */}
            Calendar
          </summary>
          <div className="mt-3">
            <div className="flex gap-1 mb-3 text-xs">
              {/* Toggles carry the shown month so the destination page renders
                  the details open — otherwise switching back to "My courses"
                  drops every param and the panel collapses. */}
              <Link
                href={homeHref({ all: false, month: calMonth })}
                scroll={false}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  !showAllCourses
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                My courses
              </Link>
              <Link
                href={homeHref({ all: true, month: calMonth })}
                scroll={false}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  showAllCourses
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                All courses
              </Link>
            </div>
            <CourseCalendar
              month={calMonth}
              basePath="/admin"
              courses={calendarCourses}
              category={cat}
              params={{
                ...(showAllCourses ? { scope: 'all' } : {}),
                ...(viewAs ? { as: viewAs } : {}),
              }}
            />
          </div>
        </details>


        <section className="mb-10">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Your tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {portalLinks.filter((l) => l.section === 'personal').map((l) => (
              <Link
                key={l.href}
                href={linkHref(l)}
                className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
              >
                <div className="mb-3 text-pr-red [&>svg]:h-7 [&>svg]:w-auto">{l.icon}</div>
                <h3 className="font-semibold text-lg mb-1">{l.title}</h3>
                <p className="text-zinc-400 text-sm">{l.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {showAsAdmin && (
          <section>
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              Administration
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-pr-red/15 border border-pr-red/40 text-pr-red">
                Admin
              </span>
            </h2>
            <div className="space-y-2">
              {portalLinks.filter((l) => l.section === 'admin').map((l) => (
                <Link
                  key={l.href}
                  href={linkHref(l)}
                  className="flex items-center gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-pr-red transition-colors"
                >
                  <div className="shrink-0 text-pr-red [&>svg]:h-[22px] [&>svg]:w-auto">{l.icon}</div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm">{l.title}</h3>
                    <p className="text-xs text-zinc-500 truncate">{l.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
