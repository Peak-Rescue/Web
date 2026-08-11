import React from 'react'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { moduleAudience } from '@/lib/library'
import { gearLabel, productName } from '@/lib/gear'
import { courseDisplayName, computeBlocks } from '@/lib/courses'
import CourseTasksPanel, { type CourseTask, type TaskPerson } from '@/components/CourseTasksPanel'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'
import PortalSectionNav from './PortalSectionNav'
import { Section, SubHead, InstructorCard, SECTION_LABEL, type SectionKey } from './sections'
import { PURPOSE_META, PURPOSE_ORDER, linkLabel, type CourseLink } from '@/lib/course-links'

// Status is a sales/ops state — "quoted", "confirmed" — and means nothing to a
// student, who by definition only sees courses they're enrolled on. The one
// exception is cancelled, which they do need to know.
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

  const [{ data: inst }, { data: offDays }, { data: modules }, { data: instructors }, taskRows, { data: peopleRows }, { data: templateRows }, { data: courseDocRows }, { data: taskDocRows }, { data: mapRows }, { data: linkRows }] =
    await Promise.all([
      admin.from('course_instances')
        .select('course_type, custom_title, status, location, client_name, notes, ref_number, starts_at, ends_at, meeting_point, meeting_time, intro')
        .eq('id', id)
        .single(),
      admin.from('instance_off_days')
        .select('off_date, end_date')
        .eq('instance_id', id)
        .order('off_date'),
      modulesQuery,
      admin.from('instance_instructors')
        .select('role, instructors(name, profile_id, slug, active, title, avatar, avatar_position, avatar_scale)')
        .eq('instance_id', id),
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
      // Maps: the team sees every one, students only those shared with them.
      // This reads with the service role, so the audience filter is applied
      // here rather than by RLS.
      (showTasks
        ? admin.from('course_maps').select('id, url, label, audience, library_items(title, url, edit_url)').eq('instance_id', id).order('sort_order')
        : admin.from('course_maps').select('id, url, label, audience, library_items(title, url)').eq('instance_id', id).eq('audience', 'shared').order('sort_order')),
      // Links added for this delivery — the photo album, the client's
      // paperwork. Same audience rule as maps.
      (showTasks
        ? admin.from('course_links').select('id, url, label, audience, purpose').eq('instance_id', id).order('purpose').order('sort_order')
        : admin.from('course_links').select('id, url, label, audience, purpose').eq('instance_id', id).eq('audience', 'shared').order('purpose').order('sort_order')),
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

  // Library maps take their title and link from the library item; the edit
  // twin (CalTopo edit URL) is only ever handed to the team.
  const maps = (mapRows ?? []).map((r) => {
    const item = r.library_items as unknown as { title: string; url: string | null; edit_url?: string | null } | null
    return {
      id: r.id,
      label: item?.title ?? r.label ?? 'Map',
      url: item?.url ?? r.url,
      editUrl: showTasks ? item?.edit_url ?? null : null,
      internal: r.audience !== 'shared',
    }
  }).filter((m) => m.url || m.editUrl)

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
    .select('id, name, audience, intro, gear_list_entries(id, gear_item_id, name, note, url, section, group_type, quantity, sort_order, gear_items(name, brand, url, category), gear_entry_options(sort_order, gear_items(name, brand)))')
    .eq('instance_id', id)
  type GearRow = {
    id: string; name: string; audience: string; intro: string | null
    gear_list_entries: {
      id: string; gear_item_id: string | null; name: string | null; note: string | null; url: string | null
      section: string | null; group_type: 'personal' | 'group'; quantity: string | null; sort_order: number
      gear_items: { name: string; brand: string | null; url: string | null; category: string | null } | null
      gear_entry_options: { sort_order: number; gear_items: { name: string; brand: string | null } | null }[]
    }[]
  }
  const gearAll = (gearRows ?? []) as unknown as GearRow[]

  // Which models sit under each type. A line that ticked nothing accepts any
  // of them, and saying so is the whole point of the catalog — before this the
  // student read a bare "Hand ascender" and had to guess what to buy.
  const { data: gearModelRows } = await admin
    .from('gear_items')
    .select('name, parent_id')
    .not('parent_id', 'is', null)
    .eq('active', true)
    .order('name')
  const gearModelsByType = new Map<string, string[]>()
  for (const m of (gearModelRows ?? []) as { name: string; parent_id: string }[]) {
    gearModelsByType.set(m.parent_id, [...(gearModelsByType.get(m.parent_id) ?? []), m.name])
  }
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

  // Which named sections this course actually has — drives both the jump bar
  // and the order things render in, so the two can never disagree.
  const hasAbout = Boolean(inst.intro || inst.meeting_point || inst.meeting_time)
  const hasSchedule = Boolean(sched && schedDays.length > 0)
  const hasCurriculum = orderedModules.length > 0
  const hasEquipment = Boolean(gearList && gearList.gear_list_entries.length > 0)
  const hasNotes = showTasks && Boolean(inst.notes)
  const hasDocuments = showTasks && courseDocs.length > 0
  const hasTasks = showTasks && (tasks.length > 0 || canManageTasks)

  const navSections = ([
    // The header block — dates, place, maps, who's teaching — is a tab like any
    // other, so the bar can always take you back to the overview.
    'details',
    // Team blocks lead for staff; students only ever get the four below them.
    hasNotes && 'notes',
    hasTasks && 'tasks',
    hasDocuments && 'documents',
    hasAbout && 'about',
    hasSchedule && 'schedule',
    hasCurriculum && 'curriculum',
    hasEquipment && 'equipment',
  ].filter(Boolean) as SectionKey[]).map((id) => ({ id, label: SECTION_LABEL[id] }))

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

        {/* Header — the overview the "Details" tab points back to */}
        <div id="details" className="scroll-mt-30 md:scroll-mt-36 mb-6">
          <div className="flex items-center gap-2 mb-2 text-sm text-zinc-500">
            <span className="font-mono text-xs">PR-{String(inst.ref_number).padStart(4, '0')}</span>
            {(showTasks || inst.status === 'cancelled') && (
              <>
                <span>·</span>
                <span className={inst.status === 'cancelled' ? 'text-red-400' : undefined}>
                  {STATUS_LABEL[inst.status] ?? inst.status}
                </span>
              </>
            )}
            {inst.client_name && <><span>·</span><span>{inst.client_name}</span></>}
          </div>
          <h1 className="text-3xl font-bold mb-4">{courseDisplayName(inst.course_type, inst.custom_title)}</h1>

          {/* The two facts every student checks first, labelled rather than
              run together in one grey line. */}
          <dl className="grid sm:grid-cols-2 gap-3">
            {blocks.length > 0 && (
              <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">When</dt>
                <dd className="text-sm text-zinc-200 mt-0.5 space-y-0.5">
                  {blocks.map((b, i) => (
                    <div key={i}>
                      {fmtLong(b.starts_at)}{b.starts_at !== b.ends_at ? ` – ${fmtLong(b.ends_at)}` : ''}
                    </div>
                  ))}
                </dd>
              </div>
            )}
            {inst.location && (
              <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Where</dt>
                <dd className="text-sm text-zinc-200 mt-0.5">{inst.location}</dd>
              </div>
            )}
          </dl>

          {/* Maps sit with the location — the answer to "where is this?" is
              the place name and the map together. */}
          {maps.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {maps.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-teal-800 bg-teal-950/40 text-teal-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noreferrer" className="hover:text-teal-100 transition-colors">{m.label}</a>
                  ) : (
                    <span>{m.label}</span>
                  )}
                  {m.editUrl && (
                    <a href={m.editUrl} target="_blank" rel="noreferrer" title="Edit map — internal" className="text-teal-500/80 hover:text-teal-200 transition-colors border-l border-teal-800 pl-1.5">
                      edit
                    </a>
                  )}
                  {showTasks && m.internal && <span className="text-teal-600/80">· team</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Links for this delivery. Grouped, because "the album" and "the
            waiver" are different errands and a single list of URLs makes you
            read all of them to find either. */}
        {(linkRows ?? []).length > 0 && (
          <div className="mb-8 space-y-3">
            {PURPOSE_ORDER.map((purpose) => {
              const rows = ((linkRows ?? []) as CourseLink[]).filter((l) => l.purpose === purpose)
              if (rows.length === 0) return null
              return (
                <div key={purpose}>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
                    {PURPOSE_META[purpose].label}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {rows.map((l) => (
                      <a
                        key={l.id}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                      >
                        {linkLabel(l)}
                        {showTasks && l.audience === 'internal' && (
                          <span className="text-zinc-600">· team</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Instructor roster — named as such, with the role written out. */}
        {(instructors ?? []).length > 0 && (
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
              {(instructors ?? []).length > 1 ? 'Your instructors' : 'Your instructor'}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {(instructors ?? []).map((a, i) => {
                const p = a.instructors as unknown as {
                  name: string; slug: string | null; active: boolean | null
                  avatar: string | null; avatar_position: string | null; avatar_scale: number | null
                } | null
                return (
                  <InstructorCard
                    key={i}
                    name={p?.name ?? 'Instructor'}
                    role={a.role}
                    // /team/[slug] only serves active instructors — anyone else
                    // would land on a 404, so they stay unlinked.
                    slug={p?.active ? p.slug : null}
                    avatar={p?.avatar}
                    avatarPosition={p?.avatar_position}
                    avatarScale={p?.avatar_scale}
                  />
                )
              })}
            </div>
          </div>
        )}

        <PortalSectionNav sections={navSections} />

        {/* Notes (instructors + admin only) */}
        {hasNotes && (
          <Section id="notes" blurb="Internal notes on this course" team>
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap">
              {inst.notes}
            </div>
          </Section>
        )}

        {/* Course documents (team only) — every attachment in one place, as
            the same pills the course editor uses, so a schedule attached to a
            (possibly completed) task is one click away from the overview */}
        {hasDocuments && (
          <Section id="documents" blurb="Every file and link attached to this course" team>
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
          </Section>
        )}

        {/* Course tasks (team only) */}
        {hasTasks && (
          <Section id="tasks" title="Course tasks" blurb="What still has to happen before this course runs" team>
            <CourseTasksPanel
              instanceId={id}
              tasks={tasks}
              people={taskPeople}
              suggestions={canManageTasks ? templateRows ?? [] : []}
              canManage={canManageTasks}
              currentUserId={user.id}
            />          </Section>
        )}

        {/* What a student needs before they arrive: the practicalities, then
            the plan, then the material, then the kit. */}
        {hasAbout && (
          <Section id="about" blurb="Where to meet, when to be there, and what this course covers">
            <div className="space-y-3">
              {inst.intro && (
                <p className="text-sm text-zinc-300 whitespace-pre-line">{inst.intro}</p>
              )}
              {(inst.meeting_point || inst.meeting_time) && (
                <dl className="grid sm:grid-cols-2 gap-3">
                  {inst.meeting_point && (
                    <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Meeting point</dt>
                      <dd className="text-sm text-zinc-200 mt-0.5">{inst.meeting_point}</dd>
                    </div>
                  )}
                  {inst.meeting_time && (
                    <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Meeting time</dt>
                      <dd className="text-sm text-zinc-200 mt-0.5">{inst.meeting_time}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </Section>
        )}

        {/* Running order */}
        {hasSchedule && (
          <Section id="schedule" blurb="Day by day, what we're doing and where">
            {sched.overview && <p className="text-sm text-zinc-400 mb-3 whitespace-pre-line">{sched.overview}</p>}
            {sched.objectives.length > 0 && (
              <div className="mb-4">
                <SubHead title="Objectives" />
                <ol className="space-y-1 text-sm text-zinc-300 list-decimal pl-5">
                  {sched.objectives.map((o, i) => <li key={i}>{o}</li>)}
                </ol>
              </div>
            )}
            <div className="space-y-3">
              {schedDays.map((d, di) => {
                const blocks = [...(d.schedule_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
                const topics = blocks.filter((b) => !b.parent_id)
                return (
                  <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-mono text-zinc-600 shrink-0">Day {di + 1}</span>
                      <h3 className="font-medium text-sm">{d.title}</h3>
                    </div>
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
          </Section>
        )}

        {/* Curriculum — the modules, each its own named group rather than a
            page-length run of link rows. */}
        {hasCurriculum && (
          <Section id="curriculum" blurb="Reading, videos and references for each topic">
            <div className="space-y-6">
              {orderedModules.map(mod => {
                const items = (mod.course_items ?? []).slice().sort((a, b) => a.order - b.order)
                return (
                  <div key={mod.id}>
                    <SubHead
                      title={mod.title}
                      badge={(showAsAdmin || showAsInstructor) && mod.audience !== 'both' ? (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                          mod.audience === 'instructor'
                            ? 'border-teal-800 text-teal-400'
                            : 'border-blue-800 text-blue-400'
                        }`}>
                          {mod.audience}s only
                        </span>
                      ) : undefined}
                    />
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
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Gear */}
        {hasEquipment && gearList && (
          <Section id="equipment" blurb={gearList.name}>
            {gearList.intro && <p className="text-sm text-zinc-400 mb-3 whitespace-pre-line">{gearList.intro}</p>}
            {(['personal', 'group'] as const).map((gt) => {
              const rows = gearList.gear_list_entries
                .filter((e) => e.group_type === gt)
                .sort((a, b) => a.sort_order - b.sort_order)
              if (rows.length === 0) return null
              // The list's own headings, which are editorial and say what this
              // course wants ("Bring this as well"). Most gear sits under none
              // of them and prints as a plain list — the catalog's taxonomy is
              // how staff find an item, and was never a heading for students.
              const byCat = new Map<string | null, typeof rows>()
              for (const r of rows) {
                const c = r.section ?? null
                byCat.set(c, [...(byCat.get(c) ?? []), r])
              }
              return (
                <div key={gt} className="mb-5">
                  <SubHead title={gt === 'personal' ? 'Each person brings' : 'Group kit'} />
                  {[...byCat.entries()].map(([cat, items]) => (
                    <div key={cat ?? '—'} className="mb-2">
                      {cat && <p className="text-[11px] text-zinc-600 mb-1">{cat}</p>}
                      <ul className="border border-zinc-800 rounded divide-y divide-zinc-800/70">
                        {items.map((e) => {
                          const name = e.name ?? (e.gear_items ? productName(e.gear_items) : null) ?? 'Item'
                          const url = e.url ?? e.gear_items?.url
                          // "Descent device — Petzl Rig or Grigri" when the
                          // line accepts more than one model.
                          const { detail } = gearLabel(
                            name,
                            [...(e.gear_entry_options ?? [])]
                              .sort((a, b) => a.sort_order - b.sort_order)
                              .map((o) => o.gear_items)
                              .filter(Boolean)
                              .map((g) => ({ name: productName(g!) }))
                          )
                          // Nothing ticked means any model of the type will do
                          // — so list them rather than leave the student with a
                          // category name and no idea what satisfies it.
                          const anyOf = detail
                            ? null
                            : (e.gear_item_id ? gearModelsByType.get(e.gear_item_id) : null) ?? null
                          return (
                            <li key={e.id} className="px-3 py-2 text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer" className="hover:text-pr-red-light transition-colors">{name}</a>
                                ) : name}
                                {detail && <span className="text-xs text-zinc-400">{detail}</span>}
                                {e.quantity && <span className="text-[11px] text-zinc-500">× {e.quantity}</span>}
                              </div>
                              {e.note && (
                                <p className="text-[11px] text-zinc-500 mt-0.5">{e.note}</p>
                              )}
                              {anyOf && anyOf.length > 0 && (
                                <p className="text-[11px] text-zinc-600 mt-0.5">
                                  {anyOf.length === 1 ? 'such as ' : 'any of: '}
                                  <span className="text-zinc-500">{anyOf.join(' · ')}</span>
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
          </Section>
        )}

        {/* Details is always there, so emptiness is about the sections below it. */}
        {navSections.length === 1 && (
          <p className="text-zinc-500 text-sm">Nothing has been added to this course yet — check back soon.</p>
        )}
      </div>
    </main>
  )
}
