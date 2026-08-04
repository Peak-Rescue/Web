import React from 'react'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { moduleAudience } from '@/lib/library'
import { courseDisplayName, computeBlocks } from '@/lib/courses'
import CourseTasksPanel, { type CourseTask, type TaskPerson } from '@/components/CourseTasksPanel'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'

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
  // Instructor preview keeps your real course role, so a lead previewing
  // still gets the lead's manage controls (just not the admin-only rows).
  const canManageTasks = viewAs
    ? viewAs === 'instructor' && instructorAssignment?.role === 'lead'
    : isAdmin || instructorAssignment?.role === 'lead'

  // Everything else in a second parallel round (roles known, filters set).
  const showTasks = showAsAdmin || showAsInstructor
  const audienceFilter = showTasks ? null : ['student', 'both']

  let modulesQuery = admin
    .from('course_modules')
    .select('id, title, audience, order, course_items(id, title, type, url, description, order, audience, library_items(id, title, url, kind, audience, drive_file_id))')
    .eq('instance_id', id)
    .order('order')
  if (audienceFilter) {
    modulesQuery = modulesQuery.in('audience', audienceFilter)
  }

  const [{ data: inst }, { data: offDays }, { data: modules }, { data: instructors }, taskRows, { data: peopleRows }, { data: templateRows }, { data: courseDocRows }, { data: taskDocRows }] =
    await Promise.all([
      admin.from('course_instances')
        .select('course_type, custom_title, status, location, client_name, notes, ref_number, starts_at, ends_at, meeting_point, meeting_time, schedule, intro')
        .eq('id', id)
        .single(),
      admin.from('instance_off_days')
        .select('off_date, end_date')
        .eq('instance_id', id)
        .order('off_date'),
      modulesQuery,
      admin.from('instance_instructors').select('role, instructors(name, profile_id)').eq('instance_id', id),
      showTasks ? loadTasksWithDocs(admin, id) : Promise.resolve([]),
      showTasks
        ? admin.from('profiles').select('id, first_name, last_name, role').in('role', ['admin', 'instructor']).order('first_name')
        : Promise.resolve({ data: [] }),
      showTasks
        ? admin.from('course_task_templates').select('id, title, default_line, sort_order').eq('active', true).order('sort_order')
        : Promise.resolve({ data: [] }),
      showTasks
        ? admin.from('course_documents').select('id, path, filename, url, created_at').eq('instance_id', id)
        : Promise.resolve({ data: [] }),
      showTasks
        ? admin.from('course_task_documents').select('id, path, filename, url, created_at, course_tasks!inner(title, instance_id)').eq('course_tasks.instance_id', id)
        : Promise.resolve({ data: [] }),
    ])

  if (!inst) notFound()

  // Every attachment on the course — task documents (even from completed
  // tasks, where they'd otherwise be folded away) plus general course files —
  // gathered into one glanceable rail for the team. Uploads live in the
  // private task-documents bucket and need signing; links carry their URL.
  type PortalDocRow = { id: string; path: string | null; filename: string | null; url: string | null; created_at: string }
  const docRows: (PortalDocRow & { course_tasks?: unknown })[] = [...(courseDocRows ?? []), ...(taskDocRows ?? [])]
  const docPaths = docRows.map((r) => r.path).filter((p): p is string => Boolean(p))
  const { data: signedDocs } = docPaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(docPaths, 3600)
    : { data: [] }
  const docUrl = new Map((signedDocs ?? []).map((s) => [s.path, s.signedUrl]))
  const courseDocs = docRows
    .map((r) => ({
      id: r.id,
      filename: r.filename ?? 'document',
      url: r.url ?? (r.path ? docUrl.get(r.path) : undefined) ?? '#',
      external: Boolean(r.url),
      taskTitle: (r.course_tasks as { title: string } | null | undefined)?.title ?? null,
      created_at: r.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const blocks = inst.starts_at && inst.ends_at
    ? computeBlocks(inst.starts_at, inst.ends_at, offDays ?? [])
    : []

  // Only tasks assigned to someone show on the course page, for everyone.
  const tasks: CourseTask[] = taskRows.filter((t) => t.assigned_to)
  const staffedProfileIds = new Set(
    (instructors ?? [])
      .map((r) => (r.instructors as unknown as { profile_id: string | null } | null)?.profile_id)
      .filter(Boolean)
  )
  const taskPeople: TaskPerson[] = (peopleRows ?? [])
    .map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' '),
      onCourse: p.role === 'admin' || staffedProfileIds.has(p.id),
    }))
    .filter((p) => p.name)

  const fmtLong = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })

  // The gear list participants get. Instructors see theirs too; students only
  // ever see the student one.
  const { data: gearRows } = await admin
    .from('gear_lists')
    .select('id, name, audience, intro, gear_list_entries(id, name, info, recommended, url, category, group_type, quantity, sort_order, gear_items(name, info, recommended, url, category))')
    .eq('instance_id', id)
  type GearRow = {
    id: string; name: string; audience: string; intro: string | null
    gear_list_entries: {
      id: string; name: string | null; info: string | null; recommended: string | null; url: string | null
      category: string | null; group_type: 'personal' | 'group'; quantity: string | null; sort_order: number
      gear_items: { name: string; info: string | null; recommended: string | null; url: string | null; category: string | null } | null
    }[]
  }
  const gearAll = (gearRows ?? []) as unknown as GearRow[]
  const gearList = showTasks
    ? gearAll.find((g) => g.audience === 'instructor') ?? gearAll[0]
    : gearAll.find((g) => g.audience === 'student')

  // The running order, same for everyone on the course.
  const { data: schedRows } = await admin
    .from('course_schedules')
    .select('id, name, overview, objectives, schedule_days(id, title, location, notes, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
    .eq('instance_id', id)
    .limit(1)
  type SchedBlock = { id: string; parent_id: string | null; title: string; time_label: string | null; location: string | null; sort_order: number }
  type SchedDay = { id: string; title: string; location: string | null; notes: string | null; sort_order: number; schedule_blocks: SchedBlock[] }
  const sched = ((schedRows ?? []) as unknown as {
    id: string; name: string; overview: string | null; objectives: string[]; schedule_days: SchedDay[]
  }[])[0]
  const schedDays = [...(sched?.schedule_days ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  // Staff see instructor-only sections first — the same order they had in
  // Classroom. Students never receive those sections at all.
  const orderedModules = [...(modules ?? [])].sort((a, b) => {
    const ai = moduleAudience(a.audience) === 'internal' ? 0 : 1
    const bi = moduleAudience(b.audience) === 'internal' ? 0 : 1
    return ai - bi || (a.order as number) - (b.order as number)
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {isAdmin && (
          <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
            <Link
              href={`/admin/courses/${id}`}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
              Edit course
            </Link>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-600 mr-1">Viewing as</span>
              {([
                ['', 'Admin', 'Everything, unfiltered'],
                ['instructor', 'Instructor', 'What an assigned instructor sees (uses your real role on this course)'],
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

        {/* Course documents (team only) — every attachment in one place, as
            the same pills the course editor uses, so a schedule attached to a
            (possibly completed) task is one click away from the overview */}
        {showTasks && courseDocs.length > 0 && (
          <section className="mb-10">
            <h2 className="font-semibold text-lg mb-3">Documents</h2>
            <div className="flex flex-wrap gap-2">
              {courseDocs.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  title={d.taskTitle ? `From task: ${d.taskTitle}` : d.external ? 'Opens external link' : 'Course file'}
                  className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    d.external
                      ? 'bg-teal-500/10 border-teal-500/30 hover:border-teal-400 text-teal-300 hover:text-teal-100'
                      : 'bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'
                  }`}
                >
                  {d.external ? <LinkIcon /> : <span className="shrink-0"><PaperclipIcon /></span>}
                  <span className="truncate">{d.filename}</span>
                  {d.external && <span className="text-teal-400/70 shrink-0">↗</span>}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Course tasks (team only) */}
        {showTasks && (tasks.length > 0 || canManageTasks) && (
          <section className="mb-10">
            <h2 className="font-semibold text-lg mb-3">Course Tasks</h2>
            <CourseTasksPanel
              instanceId={id}
              tasks={tasks}
              people={taskPeople}
              suggestions={canManageTasks ? templateRows ?? [] : []}
              canManage={canManageTasks}
              currentUserId={user.id}
            />
          </section>
        )}

        {/* Running order */}
        {sched && schedDays.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Schedule</h2>
            {sched.overview && <p className="text-sm text-zinc-400 mb-3 whitespace-pre-line">{sched.overview}</p>}
            {sched.objectives.length > 0 && (
              <ol className="mb-4 space-y-1 text-sm text-zinc-300 list-decimal pl-5">
                {sched.objectives.map((o, i) => <li key={i}>{o}</li>)}
              </ol>
            )}
            <div className="space-y-3">
              {schedDays.map((d) => {
                const blocks = [...(d.schedule_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
                const topics = blocks.filter((b) => !b.parent_id)
                return (
                  <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <h3 className="font-medium text-sm">{d.title}</h3>
                    {(d.location || d.notes) && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {[d.location, d.notes].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {topics.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {topics.map((t) => {
                          const kids = blocks.filter((b) => b.parent_id === t.id)
                          return (
                            <li key={t.id} className="text-sm text-zinc-300">
                              {t.time_label && <span className="text-zinc-500 mr-2">{t.time_label}</span>}
                              {t.title}
                              {t.location && <span className="text-xs text-zinc-500 ml-2">{t.location}</span>}
                              {kids.length > 0 && (
                                <ul className="mt-1 ml-4 space-y-0.5">
                                  {kids.map((k) => (
                                    <li key={k.id} className="text-[13px] text-zinc-400">{k.title}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Content modules */}
        {gearList && gearList.gear_list_entries.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">{gearList.name}</h2>
            {gearList.intro && <p className="text-sm text-zinc-400 mb-3 whitespace-pre-line">{gearList.intro}</p>}
            {(['personal', 'group'] as const).map((gt) => {
              const rows = gearList.gear_list_entries
                .filter((e) => e.group_type === gt)
                .sort((a, b) => a.sort_order - b.sort_order)
              if (rows.length === 0) return null
              const byCat = new Map<string, typeof rows>()
              for (const r of rows) {
                const c = r.category ?? r.gear_items?.category ?? 'Other'
                byCat.set(c, [...(byCat.get(c) ?? []), r])
              }
              return (
                <div key={gt} className="mb-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                    {gt === 'personal' ? 'Each person brings' : 'Group kit'}
                  </h3>
                  {[...byCat.entries()].map(([cat, items]) => (
                    <div key={cat} className="mb-2">
                      <p className="text-[11px] text-zinc-600 mb-1">{cat}</p>
                      <ul className="border border-zinc-800 rounded divide-y divide-zinc-800/70">
                        {items.map((e) => {
                          const name = e.name ?? e.gear_items?.name ?? 'Item'
                          const info = e.info ?? e.gear_items?.info
                          const rec = e.recommended ?? e.gear_items?.recommended
                          const url = e.url ?? e.gear_items?.url
                          return (
                            <li key={e.id} className="px-3 py-2 text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer" className="hover:text-pr-red-light transition-colors">{name}</a>
                                ) : name}
                                {e.quantity && <span className="text-[11px] text-zinc-500">× {e.quantity}</span>}
                              </div>
                              {(info || rec) && (
                                <p className="text-[11px] text-zinc-600 mt-0.5">
                                  {info}{info && rec && ' — '}{rec && <span className="text-zinc-500">{rec}</span>}
                                </p>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )
            })}
          </section>
        )}

        {(inst.intro || inst.meeting_point || inst.meeting_time || inst.schedule) && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">About this course</h2>
            <div className="px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2 text-sm">
              {inst.intro && <p className="text-zinc-300 whitespace-pre-line">{inst.intro}</p>}
              {(inst.meeting_point || inst.meeting_time) && (
                <p>
                  {inst.meeting_point && <span className="text-white">{inst.meeting_point}</span>}
                  {inst.meeting_point && inst.meeting_time && <span className="text-zinc-600"> · </span>}
                  {inst.meeting_time && <span className="text-white">{inst.meeting_time}</span>}
                </p>
              )}
              {inst.schedule && (
                <p className="text-zinc-300 whitespace-pre-line">{inst.schedule}</p>
              )}
            </div>
          </section>
        )}

        {(modules ?? []).length === 0 ? (
          <p className="text-zinc-500 text-sm">No content has been added yet.</p>
        ) : (
          <div className="space-y-8">
            {orderedModules.map(mod => {
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
                    {items.map(item => {
                      // Library rows carry their own title/link, and an item can
                      // be held back to instructors inside a shared section.
                      const libRaw = item.library_items as unknown
                      const lib = (Array.isArray(libRaw) ? libRaw[0] : libRaw) as
                        { id: string; title: string; url: string | null; audience: string; drive_file_id?: string | null } | null
                      const effective = item.audience ?? lib?.audience ?? 'shared'
                      if (!showTasks && effective === 'internal') return null
                      const title = lib?.title ?? item.title
                      // Drive files go through the portal, which streams them
                      // with the service account — a direct Drive link would
                      // show participants Google's request-access page.
                      const isDrive = Boolean(lib?.drive_file_id) || /drive\.google\.com|docs\.google\.com/.test(lib?.url ?? '')
                      const url = lib && isDrive ? `/api/library/${lib.id}` : (lib?.url ?? item.url)
                      if (!url) return null
                      return (
                      <a
                        key={item.id}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
                      >
                        {ITEM_ICON[(item.type ?? 'link') as keyof typeof ITEM_ICON]}
                        <div className="min-w-0">
                          <div className="text-sm font-medium group-hover:text-pr-red-light transition-colors">{title}</div>
                          {item.description && <div className="text-xs text-zinc-500 mt-0.5">{item.description}</div>}
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-zinc-600 group-hover:text-zinc-400 mt-0.5 transition-colors">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
                        </svg>
                      </a>
                      )
                    })}
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
