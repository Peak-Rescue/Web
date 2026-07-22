'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'
import { insertTemplateTasks } from '@/lib/course-tasks'

// Admins manage tasks everywhere; a lead instructor manages tasks on their
// own course. Assignees may toggle their own task's status.
async function getCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  return { user, admin, isAdmin: profile?.role === 'admin' }
}

async function isLeadOf(admin: ReturnType<typeof createAdminClient>, instanceId: string, profileId: string) {
  const { data } = await admin
    .from('instance_instructors')
    .select('id, instructors!inner(profile_id)')
    .eq('instance_id', instanceId)
    .eq('role', 'lead')
    .eq('instructors.profile_id', profileId)
    .maybeSingle()
  return Boolean(data)
}

async function requireManager(instanceId: string) {
  const { user, admin, isAdmin } = await getCaller()
  if (!isAdmin && !(await isLeadOf(admin, instanceId, user.id))) {
    throw new Error('Only admins or the lead instructor can manage tasks')
  }
  return { user, admin }
}

function revalidateTaskViews(instanceId: string) {
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
  revalidatePath('/admin')
}

// Best-effort email to the assignee; never fails the action.
async function notifyAssignee(
  admin: ReturnType<typeof createAdminClient>,
  taskTitle: string,
  instanceId: string,
  assigneeId: string,
  actorId: string
) {
  if (assigneeId === actorId || !process.env.RESEND_API_KEY) return
  try {
    const [{ data: assignee }, { data: inst }] = await Promise.all([
      admin.from('profiles').select('email, first_name').eq('id', assigneeId).single(),
      admin.from('course_instances').select('course_type, custom_title, client_name, starts_at').eq('id', instanceId).single(),
    ])
    if (!assignee?.email || !inst) return
    const courseName = courseShortName(inst.course_type, inst.custom_title)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.peakrescuemountainguides.com'
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
      to: [assignee.email],
      subject: `Task assigned — ${courseName}: ${taskTitle}`,
      text: [
        `${assignee.first_name ?? 'Hi'}, you've been assigned a task in the portal.`,
        '',
        `Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}${inst.starts_at ? ` · starts ${inst.starts_at}` : ''}`,
        `Task: ${taskTitle}`,
        '',
        `View the course: ${siteUrl}/portal/${instanceId}`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('Task assignment email failed:', e)
  }
}

export type TaskInput = {
  title: string
  assigned_to: string | null
  notes: string | null
}

export async function addTask(instanceId: string, input: TaskInput) {
  const { user, admin } = await requireManager(instanceId)
  const title = input.title.trim()
  if (!title) throw new Error('Task title is required')

  const { error } = await admin.from('course_tasks').insert({
    instance_id: instanceId,
    title,
    notes: input.notes?.trim() || null,
    assigned_to: input.assigned_to || null,
    assigned_by: input.assigned_to ? user.id : null,
    created_by: user.id,
    sort_order: 1000, // custom tasks after the template checklist
  })
  if (error) throw new Error(error.message)

  const assignee = input.assigned_to
  if (assignee) after(() => notifyAssignee(admin, title, instanceId, assignee, user.id))
  revalidateTaskViews(instanceId)
}

export async function updateTask(
  instanceId: string,
  taskId: string,
  patch: { assigned_to: string | null }
) {
  const { user, admin } = await requireManager(instanceId)

  const { data: before } = await admin
    .from('course_tasks')
    .select('title, assigned_to')
    .eq('id', taskId)
    .eq('instance_id', instanceId)
    .single()
  if (!before) throw new Error('Task not found')

  const assigneeChanged = (patch.assigned_to || null) !== before.assigned_to
  const { error } = await admin
    .from('course_tasks')
    .update({
      assigned_to: patch.assigned_to || null,
      ...(assigneeChanged ? { assigned_by: patch.assigned_to ? user.id : null } : {}),
    })
    .eq('id', taskId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)

  const newAssignee = patch.assigned_to
  if (newAssignee && newAssignee !== before.assigned_to) {
    after(() => notifyAssignee(admin, before.title, instanceId, newAssignee, user.id))
  }
  revalidateTaskViews(instanceId)
}

export async function setTaskStatus(instanceId: string, taskId: string, done: boolean) {
  const { user, admin, isAdmin } = await getCaller()

  const { data: task } = await admin
    .from('course_tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .eq('instance_id', instanceId)
    .single()
  if (!task) throw new Error('Task not found')

  const allowed = isAdmin || task.assigned_to === user.id || (await isLeadOf(admin, instanceId, user.id))
  if (!allowed) throw new Error('Not authorized')

  const { error } = await admin
    .from('course_tasks')
    .update({ status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// Notes are working state ("called hotel, waiting on callback") — editable by
// managers and by the task's assignee.
export async function updateTaskNotes(instanceId: string, taskId: string, notes: string) {
  const { user, admin, isAdmin } = await getCaller()

  const { data: task } = await admin
    .from('course_tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .eq('instance_id', instanceId)
    .single()
  if (!task) throw new Error('Task not found')

  const allowed = isAdmin || task.assigned_to === user.id || (await isLeadOf(admin, instanceId, user.id))
  if (!allowed) throw new Error('Not authorized')

  const { error } = await admin
    .from('course_tasks')
    .update({ notes: notes.trim() || null })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// ─── Task documents (signed contracts, permits, confirmations…) ─────────────
// Managers and the task's assignee can attach files. Uploads go direct to the
// private task-documents bucket via server-minted signed URLs.

const DOC_BUCKET = 'task-documents'
const MAX_DOC_BYTES = 20 * 1024 * 1024

async function requireTaskParticipant(instanceId: string, taskId: string) {
  const { user, admin, isAdmin } = await getCaller()
  const { data: task } = await admin
    .from('course_tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .eq('instance_id', instanceId)
    .single()
  if (!task) throw new Error('Task not found')
  const allowed = isAdmin || task.assigned_to === user.id || (await isLeadOf(admin, instanceId, user.id))
  if (!allowed) throw new Error('Not authorized')
  return { user, admin }
}

export async function createTaskDocUploadTargets(
  instanceId: string,
  taskId: string,
  files: { name: string; size: number }[]
): Promise<{ path: string; token: string }[]> {
  const { admin } = await requireTaskParticipant(instanceId, taskId)
  const { randomUUID } = await import('crypto')

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_DOC_BYTES) throw new Error(`"${file.name}" is over the 20 MB limit`)
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `tasks/${instanceId}/${taskId}/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(DOC_BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

export async function finalizeTaskDocs(
  instanceId: string,
  taskId: string,
  uploads: { path: string; filename: string }[]
) {
  const { user, admin } = await requireTaskParticipant(instanceId, taskId)
  const prefix = `tasks/${instanceId}/${taskId}/`
  const rows = uploads
    .filter((u) => u.path.startsWith(prefix))
    .map((u) => ({ task_id: taskId, path: u.path, filename: u.filename.slice(0, 200), uploaded_by: user.id }))
  if (rows.length === 0) return
  const { error } = await admin.from('course_task_documents').insert(rows)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

export async function deleteTaskDoc(instanceId: string, taskId: string, docId: string) {
  const { admin } = await requireTaskParticipant(instanceId, taskId)
  const { data: doc } = await admin
    .from('course_task_documents')
    .select('path')
    .eq('id', docId)
    .eq('task_id', taskId)
    .single()
  if (!doc) return
  await admin.storage.from(DOC_BUCKET).remove([doc.path])
  const { error } = await admin.from('course_task_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

export async function deleteTask(instanceId: string, taskId: string) {
  const { admin } = await requireManager(instanceId)
  const { error } = await admin.from('course_tasks').delete().eq('id', taskId).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// Adds the standard checklist to an instance, skipping titles it already has.
// Used automatically on instance creation and manually for older instances.
export async function applyTaskTemplate(instanceId: string) {
  const { user, admin } = await requireManager(instanceId)
  await insertTemplateTasks(admin, instanceId, user.id)
  revalidateTaskViews(instanceId)
}
