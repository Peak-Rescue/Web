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
