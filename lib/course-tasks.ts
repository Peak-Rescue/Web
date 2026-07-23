import { type createAdminClient } from '@/lib/supabase/admin'

export type LoadedTask = {
  id: string
  title: string
  notes: string | null
  assigned_to: string | null
  assigned_by: string | null
  status: 'open' | 'done'
  documents: { id: string; filename: string; url: string }[]
}

// Tasks for one instance with their attached documents resolved to signed
// URLs (private bucket) — one batched signing call for the whole list.
export async function loadTasksWithDocs(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string
): Promise<LoadedTask[]> {
  const { data } = await admin
    .from('course_tasks')
    .select('id, title, notes, assigned_to, assigned_by, status, course_task_documents(id, path, filename)')
    .eq('instance_id', instanceId)
    .order('sort_order')
    .order('created_at')

  type DocRow = { id: string; path: string; filename: string | null }
  const rows = data ?? []
  const allPaths = rows.flatMap((r) => ((r.course_task_documents ?? []) as DocRow[]).map((d) => d.path))
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
      url: urlByPath.get(d.path) ?? '#',
    })),
  }))
}

export type MyOpenTask = {
  id: string
  instance_id: string
  title: string
  notes: string | null
  courseName: string | null
  courseStatus: string | null
  clientName: string | null
  location: string | null
  startsAt: string | null
  endsAt: string | null
  documents: { id: string; filename: string; url: string }[]
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
    .select('id, instance_id, title, notes, created_at, course_instances(course_type, custom_title, status, client_name, location, starts_at, ends_at), course_task_documents(id, path, filename)')
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
  type DocRow = { id: string; path: string; filename: string | null }
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
  const allPaths = rows.flatMap((r) => ((r.course_task_documents ?? []) as DocRow[]).map((d) => d.path))
  const { data: signed } = allPaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(allPaths, 3600)
    : { data: [] }
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  const { courseShortName } = await import('@/lib/courses')
  return rows.map((r) => {
    const inst = r.course_instances as unknown as InstRow | null
    return {
      id: r.id,
      instance_id: r.instance_id,
      title: r.title,
      notes: r.notes,
      courseName: inst ? courseShortName(inst.course_type, inst.custom_title) : null,
      courseStatus: inst?.status ?? null,
      clientName: inst?.client_name ?? null,
      location: inst?.location ?? null,
      startsAt: inst?.starts_at ?? null,
      endsAt: inst?.ends_at ?? null,
      documents: ((r.course_task_documents ?? []) as DocRow[]).map((d) => ({
        id: d.id,
        filename: d.filename ?? 'document',
        url: urlByPath.get(d.path) ?? '#',
      })),
    }
  })
}
