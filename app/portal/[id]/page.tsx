import React from 'react'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName, computeBlocks } from '@/lib/courses'
import CourseTasksPanel, { type CourseTask, type TaskPerson } from '@/components/CourseTasksPanel'
import { loadTasksWithDocs } from '@/lib/course-tasks'

const STATUS_LABEL: Record<string, string> = {
  tentative: 'Tentative',
  quoted:     'Quoted',
  confirmed:  'Confirmed',
  completed:  'Completed',
  cancelled:  'Cancelled',
}

const ITEM_ICON: Record<string, React.ReactElement> = {
  video: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400 mt-0.5">
      <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.361a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
    </svg>
  ),
  doc: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400 mt-0.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  link: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400 mt-0.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
}

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ as?: string }>
}) {
  const { id } = await params
  const { as } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Access inputs in one parallel round.
  const [{ data: profile }, { data: instructorAssignment }, { data: enrollment }] = await Promise.all([
    admin.from('profiles').select('role, first_name').eq('id', user.id).single(),
    admin
      .from('instance_instructors')
      .select('id, role, instructors!inner(profile_id)')
      .eq('instance_id', id)
      .eq('instructors.profile_id', user.id)
      .maybeSingle(),
    admin.from('enrollments').select('id').eq('instance_id', id).eq('user_id', user.id).maybeSingle(),
  ])

  const isAdmin = profile?.role === 'admin'
  const isInstructor = !!instructorAssignment
  const hasAccess = isAdmin || isInstructor || !!enrollment
  if (!hasAccess) redirect('/dashboard')

  // Admins can preview the page as a student or a (non-lead) instructor via
  // ?as=… — purely a display role; the access check above uses the real one.
  const viewAs = isAdmin && (as === 'student' || as === 'instructor') ? as : null
  const showAsAdmin = viewAs ? false : isAdmin
  const showAsInstructor = viewAs ? viewAs === 'instructor' : isInstructor
  const canManageTasks = viewAs ? false : isAdmin || instructorAssignment?.role === 'lead'

  // Everything else in a second parallel round (roles known, filters set).
  const showTasks = showAsAdmin || showAsInstructor
  const audienceFilter = showTasks ? null : ['student', 'both']

  let modulesQuery = admin
    .from('course_modules')
    .select('id, title, audience, order, course_items(id, title, type, url, description, order)')
    .eq('instance_id', id)
    .order('order')
  if (audienceFilter) {
    modulesQuery = modulesQuery.in('audience', audienceFilter)
  }

  const [{ data: inst }, { data: offDays }, { data: modules }, { data: instructors }, taskRows, { data: peopleRows }] =
    await Promise.all([
      admin.from('course_instances')
        .select('course_type, custom_title, status, location, client_name, notes, ref_number, starts_at, ends_at')
        .eq('id', id)
        .single(),
      admin.from('instance_off_days')
        .select('off_date, end_date')
        .eq('instance_id', id)
        .order('off_date'),
      modulesQuery,
      admin.from('instance_instructors').select('role, instructors(name)').eq('instance_id', id),
      showTasks ? loadTasksWithDocs(admin, id) : Promise.resolve([]),
      showTasks
        ? admin.from('profiles').select('id, first_name, last_name').in('role', ['admin', 'instructor']).order('first_name')
        : Promise.resolve({ data: [] }),
    ])

  if (!inst) notFound()

  const blocks = inst.starts_at && inst.ends_at
    ? computeBlocks(inst.starts_at, inst.ends_at, offDays ?? [])
    : []

  // Managers see the full checklist (they assign from it); everyone else
  // sees only tasks that have actually been assigned to someone.
  const tasks: CourseTask[] = canManageTasks ? taskRows : taskRows.filter((t) => t.assigned_to)
  const taskPeople: TaskPerson[] = (peopleRows ?? [])
    .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ') }))
    .filter((p) => p.name)

  const fmtLong = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {isAdmin && (
          <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
            <Link href={`/admin/courses/${id}`} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">← Edit course</Link>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-600 mr-1">Viewing as</span>
              {([
                ['', 'Admin', 'Everything, unfiltered'],
                ['instructor', 'Instructor', 'What an assigned (non-lead) instructor sees'],
                ['student', 'Student', 'What an enrolled student sees'],
              ] as const).map(([key, label, hint]) => (
                <Link
                  key={label}
                  href={key ? `/portal/${id}?as=${key}` : `/portal/${id}`}
                  title={hint}
                  className={`px-2 py-1 rounded font-medium transition-colors ${
                    (viewAs ?? '') === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2 text-sm text-zinc-500">
            <span className="font-mono text-xs">PR-{String(inst.ref_number).padStart(4, '0')}</span>
            <span>·</span>
            <span>{STATUS_LABEL[inst.status] ?? inst.status}</span>
            {inst.client_name && <><span>·</span><span>{inst.client_name}</span></>}
          </div>
          <h1 className="text-3xl font-bold mb-3">{courseDisplayName(inst.course_type, inst.custom_title)}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400">
            {blocks.map((b, i) => (
              <span key={i}>
                {fmtLong(b.starts_at)}{b.starts_at !== b.ends_at ? ` – ${fmtLong(b.ends_at)}` : ''}
              </span>
            ))}
            {inst.location && <span>{inst.location}</span>}
          </div>
        </div>

        {/* Instructor roster */}
        {(instructors ?? []).length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {(instructors ?? []).map((a, i) => {
              const instr = a.instructors as unknown as { name: string } | null
              const name = instr?.name ?? 'Instructor'
              return (
                <span key={i} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                  a.role === 'lead'
                    ? 'border-teal-700 bg-teal-900/30 text-teal-300'
                    : 'border-blue-800 bg-blue-900/20 text-blue-300'
                }`}>
                  {name} · {a.role}
                </span>
              )
            })}
          </div>
        )}

        {/* Notes (instructors + admin only) */}
        {(showAsAdmin || showAsInstructor) && inst.notes && (
          <div className="mb-8 p-4 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap">
            {inst.notes}
          </div>
        )}

        {/* Course tasks (team only) */}
        {showTasks && (tasks.length > 0 || canManageTasks) && (
          <section className="mb-10">
            <h2 className="font-semibold text-lg mb-3">Course Tasks</h2>
            <CourseTasksPanel
              instanceId={id}
              tasks={tasks}
              people={taskPeople}
              canManage={canManageTasks}
              currentUserId={user.id}
            />
          </section>
        )}

        {/* Content modules */}
        {(modules ?? []).length === 0 ? (
          <p className="text-zinc-500 text-sm">No content has been added yet.</p>
        ) : (
          <div className="space-y-8">
            {(modules ?? []).map(mod => {
              const items = (mod.course_items ?? []).slice().sort((a, b) => a.order - b.order)
              return (
                <section key={mod.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="font-semibold text-lg">{mod.title}</h2>
                    {(showAsAdmin || showAsInstructor) && mod.audience !== 'both' && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                        mod.audience === 'instructor'
                          ? 'border-teal-800 text-teal-400'
                          : 'border-blue-800 text-blue-400'
                      }`}>
                        {mod.audience}s only
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {items.map(item => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
                      >
                        {ITEM_ICON[item.type]}
                        <div className="min-w-0">
                          <div className="text-sm font-medium group-hover:text-pr-red-light transition-colors">{item.title}</div>
                          {item.description && <div className="text-xs text-zinc-500 mt-0.5">{item.description}</div>}
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-zinc-600 group-hover:text-zinc-400 mt-0.5 transition-colors">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
                        </svg>
                      </a>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
