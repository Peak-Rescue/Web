import { type createAdminClient } from '@/lib/supabase/admin'

export type LoadedTask = {
  id: string
  title: string
  notes: string | null
  assigned_to: string | null
  assigned_by: string | null
  status: 'open' | 'done'
  documents: { id: string; filename: string; url: string; external: boolean }[]
}

// Tasks for one instance with their attached documents resolved to signed
// URLs (private bucket) — one batched signing call for the whole list.
// External-link attachments carry their own URL and skip signing.
export async function loadTasksWithDocs(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string
): Promise<LoadedTask[]> {
  const { data } = await admin
    .from('course_tasks')
    .select('id, title, notes, assigned_to, assigned_by, status, course_task_documents(id, path, filename, url)')
    .eq('instance_id', instanceId)
    .order('sort_order')
    .order('created_at')

  type DocRow = { id: string; path: string | null; filename: string | null; url: string | null }
  const rows = data ?? []
  const allPaths = rows.flatMap((r) =>
    ((r.course_task_documents ?? []) as DocRow[]).map((d) => d.path).filter((p): p is string => Boolean(p))
  )
  const { data: signed } = allPaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(allPaths, 3600)
    : { data: [] }
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    assigned_to: r.assigned_to,
    assigned_by: r.assigned_by,
    status: r.status as 'open' | 'done',
    documents: ((r.course_task_documents ?? []) as DocRow[]).map((d) => ({
      id: d.id,
      filename: d.filename ?? 'document',
      url: d.url ?? (d.path ? urlByPath.get(d.path) : undefined) ?? '#',
      external: Boolean(d.url),
    })),
  }))
}

export type MyOpenTask = {
  id: string
  instance_id: string
  title: string
  notes: string | null
  /** When it was ticked, on the ones that have been. */
  completedAt?: string | null
  courseName: string | null
  courseStatus: string | null
  clientName: string | null
  location: string | null
  startsAt: string | null
  endsAt: string | null
  documents: { id: string; filename: string; url: string; external: boolean }[]
}

// A user's open tasks across courses, with notes and signed document URLs —
// the same task data the course pages show, surfaced on the portal home.
// Sorted by course start date so the list groups cleanly by course.
export async function loadMyOpenTasks(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<MyOpenTask[]> {
  const { data } = await admin
    .from('course_tasks')
    .select('id, instance_id, title, notes, created_at, completed_at, course_instances(course_type, custom_title, status, client_name, location, starts_at, ends_at), course_task_documents(id, path, filename, url)')
    .eq('assigned_to', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(20)

  type InstRow = {
    course_type: string
    custom_title: string | null
    status: string
    client_name: string | null
    location: string | null
    starts_at: string | null
    ends_at: string | null
  }
  const rows = (data ?? [])
    .filter((r) => (r.course_instances as unknown as InstRow | null)?.status !== 'cancelled')
    .sort((a, b) => {
      const ia = a.course_instances as unknown as InstRow | null
      const ib = b.course_instances as unknown as InstRow | null
      return (
        (ia?.starts_at ?? '9999').localeCompare(ib?.starts_at ?? '9999') ||
        a.instance_id.localeCompare(b.instance_id) ||
        (a.created_at as string).localeCompare(b.created_at as string)
      )
    })
  return shapeMyTasks(admin, rows)
}

// Rows to tasks: course name flattened out of the join, and every attachment
// path signed in one call. Both loaders end here, so a done task carries
// exactly what an open one does — which is the point of keeping them.
async function shapeMyTasks(
  admin: ReturnType<typeof createAdminClient>,
  rows: Record<string, unknown>[]
): Promise<MyOpenTask[]> {
  type InstRow = {
    course_type: string
    custom_title: string | null
    status: string
    client_name: string | null
    location: string | null
    starts_at: string | null
    ends_at: string | null
  }
  type DocRow = { id: string; path: string | null; filename: string | null; url: string | null }
  const allPaths = rows.flatMap((r) =>
    ((r.course_task_documents ?? []) as DocRow[]).map((d) => d.path).filter((p): p is string => Boolean(p))
  )
  const { data: signed } = allPaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(allPaths, 3600)
    : { data: [] }
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  const { courseShortName } = await import('@/lib/courses')
  return rows.map((r) => {
    const inst = r.course_instances as unknown as InstRow | null
    return {
      id: r.id as string,
      instance_id: r.instance_id as string,
      title: r.title as string,
      notes: (r.notes as string | null) ?? null,
      completedAt: (r.completed_at as string | null) ?? null,
      courseName: inst ? courseShortName(inst.course_type, inst.custom_title) : null,
      courseStatus: inst?.status ?? null,
      clientName: inst?.client_name ?? null,
      location: inst?.location ?? null,
      startsAt: inst?.starts_at ?? null,
      endsAt: inst?.ends_at ?? null,
      documents: ((r.course_task_documents ?? []) as DocRow[]).map((d) => ({
        id: d.id,
        filename: d.filename ?? 'document',
        url: d.url ?? (d.path ? urlByPath.get(d.path) : undefined) ?? '#',
        external: Boolean(d.url),
      })),
    }
  })
}

// The ones already ticked, most recently first — the portal home's short
// memory. A checked-off task used to leave the page and go nowhere you could
// follow: to see what you had attached to it, or to undo a tick, you had to
// remember which course it belonged to and go digging.
//
// Bounded twice, on purpose. Only courses that haven't happened yet, because
// once a course has run there is nothing left to revisit — the task is history
// in the useless sense. And 15, because this is a fold on a page about what is
// coming, not an audit log.
const DONE_LIMIT = 15

export async function loadMyDoneTasks(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  /** Today where the courses are — the caller has it already. */
  today: string
): Promise<MyOpenTask[]> {
  const { data } = await admin
    .from('course_tasks')
    .select('id, instance_id, title, notes, created_at, completed_at, course_instances(course_type, custom_title, status, client_name, location, starts_at, ends_at), course_task_documents(id, path, filename, url)')
    .eq('assigned_to', userId)
    .eq('status', 'done')
    .order('completed_at', { ascending: false, nullsFirst: false })
    // Whether a course is still ahead can't be asked of the joined row here,
    // so the cut is made below — over enough rows that the 15 that survive it
    // are really the 15 most recent.
    .limit(DONE_LIMIT * 6)

  return shapeMyTasks(admin, (data ?? []).filter((r) => {
    const inst = r.course_instances as unknown as { status: string; ends_at: string | null } | null
    return inst && inst.status !== 'cancelled' && (!inst.ends_at || inst.ends_at >= today)
  }).slice(0, DONE_LIMIT))
}
