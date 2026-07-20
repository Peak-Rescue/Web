'use server'

import { revalidatePath } from 'next/cache'
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
  due_date: string | null
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
    due_date: input.due_date || null,
    created_by: user.id,
    sort_order: 1000, // custom tasks after the template checklist
  })
  if (error) throw new Error(error.message)

  if (input.assigned_to) await notifyAssignee(admin, title, instanceId, input.assigned_to, user.id)
  revalidateTaskViews(instanceId)
}

export async function updateTask(
  instanceId: string,
  taskId: string,
  patch: { assigned_to: string | null; due_date: string | null }
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
      due_date: patch.due_date || null,
      ...(assigneeChanged ? { assigned_by: patch.assigned_to ? user.id : null } : {}),
    })
    .eq('id', taskId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)

  if (patch.assigned_to && patch.assigned_to !== before.assigned_to) {
    await notifyAssignee(admin, before.title, instanceId, patch.assigned_to, user.id)
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
