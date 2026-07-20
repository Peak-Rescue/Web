// Server-side helper: seed an instance with the standard task checklist,
// skipping titles it already has. Called on instance creation and from the
// manual "Add standard checklist" action.

import { type createAdminClient } from '@/lib/supabase/admin'

export async function insertTemplateTasks(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  createdBy: string | null
) {
  const [{ data: templates }, { data: existing }] = await Promise.all([
    admin.from('course_task_templates').select('title, sort_order').eq('active', true).order('sort_order'),
    admin.from('course_tasks').select('title').eq('instance_id', instanceId),
  ])
  const have = new Set((existing ?? []).map((t) => t.title))
  const rows = (templates ?? [])
    .filter((t) => !have.has(t.title))
    .map((t) => ({ instance_id: instanceId, title: t.title, sort_order: t.sort_order, created_by: createdBy }))
  if (rows.length === 0) return
  const { error } = await admin.from('course_tasks').insert(rows)
  if (error) throw new Error(error.message)
}

export type LoadedTask = {
  id: string
  title: string
  notes: string | null
  assigned_to: string | null
  assigned_by: string | null
  due_date: string | null
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
    .select('id, title, notes, assigned_to, assigned_by, due_date, status, course_task_documents(id, path, filename)')
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
    due_date: r.due_date,
    status: r.status as 'open' | 'done',
    documents: ((r.course_task_documents ?? []) as DocRow[]).map((d) => ({
      id: d.id,
      filename: d.filename ?? 'document',
      url: urlByPath.get(d.path) ?? '#',
    })),
  }))
}
