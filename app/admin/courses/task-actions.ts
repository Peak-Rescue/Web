'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'
import { normalizeDocLink } from '@/lib/doc-links'
import { sendMail } from '@/lib/mailer'
import { requireAdminUser } from '@/lib/course-access'

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

// Authority over a course's tasks belongs to its primary, which is not the same
// question as who is on lead wage — a course can carry three people on the lead
// rate, and handing all three the power to close everyone's tasks was only ever
// right because there used to be one of them.
async function isPrimaryOf(admin: ReturnType<typeof createAdminClient>, instanceId: string | null, profileId: string) {
  // A general task has no course and so no primary: it is admins' alone.
  if (!instanceId) return false
  const { data } = await admin
    .from('instance_instructors')
    .select('id, instructors!inner(profile_id)')
    .filter('instance_id', instanceId ? 'eq' : 'is', instanceId)
    .eq('in_charge', true)
    .eq('instructors.profile_id', profileId)
    .maybeSingle()
  return Boolean(data)
}

async function requireManager(instanceId: string | null) {
  const { user, admin, isAdmin } = await getCaller()
  if (!isAdmin && !(await isPrimaryOf(admin, instanceId, user.id))) {
    throw new Error(instanceId
      ? 'Only admins and primary instructors can manage this course\'s tasks'
      : 'Only admins can manage general tasks')
  }
  return { user, admin }
}

// instanceId null is a general task — one that belongs to no course. Every
// query below pins the task to its place with
// `.filter('instance_id', instanceId ? 'eq' : 'is', instanceId)`, because
// `eq null` matches nothing and the general case has to say `is null`.
function revalidateTaskViews(instanceId: string | null) {
  if (instanceId) {
    revalidatePath(`/admin/courses/${instanceId}`)
    revalidatePath(`/portal/${instanceId}`)
  } else {
    revalidatePath('/admin/tasks')
  }
  revalidatePath('/admin')
}

// Best-effort email to the assignee; never fails the action.
async function notifyAssignee(
  admin: ReturnType<typeof createAdminClient>,
  taskTitle: string,
  instanceId: string | null,
  assigneeId: string,
  actorId: string
) {
  if (assigneeId === actorId || !process.env.RESEND_API_KEY) return
  try {
    const [{ data: assignee }, { data: actor }, { data: inst }] = await Promise.all([
      admin.from('profiles').select('email, first_name').eq('id', assigneeId).single(),
      admin.from('profiles').select('first_name, last_name').eq('id', actorId).single(),
      instanceId
        ? admin.from('course_instances').select('course_type, custom_title, client_name, starts_at').eq('id', instanceId).single()
        : Promise.resolve({ data: null }),
    ])
    if (!assignee?.email || (instanceId && !inst)) return
    const courseName = inst ? courseShortName(inst.course_type, inst.custom_title) : null
    const actorName = [actor?.first_name, actor?.last_name].filter(Boolean).join(' ').trim()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
    await sendMail({
      from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
      to: [assignee.email],
      subject: courseName ? `Task assigned — ${courseName}: ${taskTitle}` : `Task assigned: ${taskTitle}`,
      text: [
        // Named rather than passive: the first question a task raises is who
        // wants it, and this mail is where most of them are first read. Falls
        // back to the old wording rather than to "someone", which is worse
        // than not saying.
        actorName
          ? `${assignee.first_name ?? 'Hi'}, ${actorName} assigned you a task in the portal.`
          : `${assignee.first_name ?? 'Hi'}, you've been assigned a task in the portal.`,
        '',
        ...(inst
          ? [`Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}${inst.starts_at ? ` · starts ${inst.starts_at}` : ''}`]
          : []),
        `Task: ${taskTitle}`,
        '',
        // A general task lives on the portal home, in the assignee's own list.
        inst ? `View the course: ${siteUrl}/portal/${instanceId}` : `View your tasks: ${siteUrl}/admin`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('Task assignment email failed:', e)
  }
}

export type TaskInput = {
  title: string
  /** Everyone it is on. Shared: any one of them ticking it closes it for all. */
  assignees: string[]
  notes: string | null
}

// The people on a task live in course_task_assignees. assigned_to is the old
// single-assignee column, kept only until the previous build is gone; writes
// here null it so the mirror trigger in 233 stays quiet and it can't go stale.
const uniq = (ids: string[]) => [...new Set(ids.filter(Boolean))]

export async function addTask(instanceId: string | null, input: TaskInput) {
  const { user, admin } = await requireManager(instanceId)
  const title = input.title.trim()
  if (!title) throw new Error('Task title is required')
  const assignees = uniq(input.assignees)

  // The id comes back because attachments chosen while writing the task can
  // only be filed once the row they hang off exists.
  const { data: created, error } = await admin
    .from('course_tasks')
    .insert({
      instance_id: instanceId,
      title,
      notes: input.notes?.trim() || null,
      created_by: user.id,
      sort_order: 1000, // custom tasks after the template checklist
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (assignees.length > 0) {
    const { error: aErr } = await admin
      .from('course_task_assignees')
      .insert(assignees.map((p) => ({ task_id: created.id, profile_id: p, assigned_by: user.id })))
    if (aErr) throw new Error(aErr.message)
  }

  for (const p of assignees) after(() => notifyAssignee(admin, title, instanceId, p, user.id))
  revalidateTaskViews(instanceId)
  return created.id as string
}

// Bulk add from the suggestions picker. Template sort_order keeps the
// checklist in its canonical order regardless of when tasks were added.
export async function addTasks(
  instanceId: string | null,
  items: { title: string; assignees: string[]; sort_order?: number }[]
) {
  const { user, admin } = await requireManager(instanceId)
  const rows = items
    .map((i) => ({ ...i, title: i.title.trim(), assignees: uniq(i.assignees) }))
    .filter((i) => i.title)
  if (rows.length === 0) throw new Error('No tasks selected')

  const { data: created, error } = await admin
    .from('course_tasks')
    .insert(
      rows.map((i) => ({
        instance_id: instanceId,
        title: i.title,
        created_by: user.id,
        sort_order: i.sort_order ?? 1000,
      }))
    )
    .select('id')
  if (error) throw new Error(error.message)

  // Inserted rows come back in the order they were sent.
  const links = (created ?? []).flatMap((c, n) =>
    rows[n].assignees.map((p) => ({ task_id: c.id as string, profile_id: p, assigned_by: user.id }))
  )
  if (links.length > 0) {
    const { error: aErr } = await admin.from('course_task_assignees').insert(links)
    if (aErr) throw new Error(aErr.message)
  }

  for (const i of rows) {
    for (const p of i.assignees) after(() => notifyAssignee(admin, i.title, instanceId, p, user.id))
  }
  revalidateTaskViews(instanceId)
}

// Replaces who a task is on. Only the people newly added hear about it, and
// the ones who stay keep their original "assigned by".
export async function setTaskAssignees(instanceId: string | null, taskId: string, assignees: string[]) {
  const { user, admin } = await requireManager(instanceId)
  const next = uniq(assignees)

  const { data: before } = await admin
    .from('course_tasks')
    .select('title, course_task_assignees(profile_id)')
    .eq('id', taskId)
    .filter('instance_id', instanceId ? 'eq' : 'is', instanceId)
    .single()
  if (!before) throw new Error('Task not found')

  const had = new Set(
    ((before.course_task_assignees ?? []) as { profile_id: string }[]).map((a) => a.profile_id)
  )
  const added = next.filter((p) => !had.has(p))
  const removed = [...had].filter((p) => !next.includes(p))

  if (removed.length > 0) {
    const { error } = await admin
      .from('course_task_assignees')
      .delete()
      .eq('task_id', taskId)
      .in('profile_id', removed)
    if (error) throw new Error(error.message)
  }
  if (added.length > 0) {
    const { error } = await admin
      .from('course_task_assignees')
      .insert(added.map((p) => ({ task_id: taskId, profile_id: p, assigned_by: user.id })))
    if (error) throw new Error(error.message)
  }
  await admin.from('course_tasks').update({ assigned_to: null, assigned_by: null }).eq('id', taskId)

  for (const p of added) after(() => notifyAssignee(admin, before.title, instanceId, p, user.id))
  revalidateTaskViews(instanceId)
}

// Shared: whoever ticks it closes it for everyone on it, and is named for it.
export async function setTaskStatus(instanceId: string | null, taskId: string, done: boolean) {
  const { user, admin } = await requireTaskParticipant(instanceId, taskId)
  const { error } = await admin
    .from('course_tasks')
    .update({
      status: done ? 'done' : 'open',
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? user.id : null,
    })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// Notes are working state ("called hotel, waiting on callback") — editable by
// managers and by anyone the task is on.
export async function updateTaskNotes(instanceId: string | null, taskId: string, notes: string) {
  const { admin } = await requireTaskParticipant(instanceId, taskId)
  const { error } = await admin
    .from('course_tasks')
    .update({ notes: notes.trim() || null })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// ─── Task documents (signed contracts, permits, confirmations…) ─────────────
// Managers and anyone the task is on can attach files. Uploads go direct to the
// private task-documents bucket via server-minted signed URLs.

const DOC_BUCKET = 'task-documents'
const MAX_DOC_BYTES = 20 * 1024 * 1024

// Admins, the course's primary, and anyone the task is on.
async function requireTaskParticipant(instanceId: string | null, taskId: string) {
  const { user, admin, isAdmin } = await getCaller()
  const { data: task } = await admin
    .from('course_tasks')
    .select('id, course_task_assignees(profile_id)')
    .eq('id', taskId)
    .filter('instance_id', instanceId ? 'eq' : 'is', instanceId)
    .single()
  if (!task) throw new Error('Task not found')
  const onIt = ((task.course_task_assignees ?? []) as { profile_id: string }[]).some((a) => a.profile_id === user.id)
  const allowed = isAdmin || onIt || (await isPrimaryOf(admin, instanceId, user.id))
  if (!allowed) throw new Error('Not authorized')
  return { user, admin }
}

export async function createTaskDocUploadTargets(
  instanceId: string | null,
  taskId: string,
  files: { name: string; size: number }[]
): Promise<{ path: string; token: string }[]> {
  const { admin } = await requireTaskParticipant(instanceId, taskId)
  const { randomUUID } = await import('crypto')

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_DOC_BYTES) throw new Error(`"${file.name}" is over the 20 MB limit`)
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `tasks/${instanceId ?? 'general'}/${taskId}/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(DOC_BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

export async function finalizeTaskDocs(
  instanceId: string | null,
  taskId: string,
  uploads: { path: string; filename: string }[]
) {
  const { user, admin } = await requireTaskParticipant(instanceId, taskId)
  const prefix = `tasks/${instanceId ?? 'general'}/${taskId}/`
  const rows = uploads
    .filter((u) => u.path.startsWith(prefix))
    .map((u) => ({ task_id: taskId, path: u.path, filename: u.filename.slice(0, 200), uploaded_by: user.id }))
  if (rows.length === 0) return
  const { error } = await admin.from('course_task_documents').insert(rows)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// A task attachment can also be an external link (Google Drive, Dropbox…) —
// same table and chips, url instead of a storage path.
export async function addTaskDocLink(instanceId: string | null, taskId: string, url: string, title: string) {
  const { user, admin } = await requireTaskParticipant(instanceId, taskId)
  const link = normalizeDocLink(url, title)
  const { error } = await admin.from('course_task_documents').insert({
    task_id: taskId,
    url: link.url,
    filename: link.filename,
    uploaded_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

export async function renameTaskDoc(instanceId: string | null, taskId: string, docId: string, filename: string) {
  const { admin } = await requireTaskParticipant(instanceId, taskId)
  const name = filename.trim().slice(0, 200)
  if (!name) throw new Error('File name cannot be empty')
  const { error } = await admin
    .from('course_task_documents')
    .update({ filename: name })
    .eq('id', docId)
    .eq('task_id', taskId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

export async function deleteTaskDoc(instanceId: string | null, taskId: string, docId: string) {
  const { admin } = await requireTaskParticipant(instanceId, taskId)
  const { data: doc } = await admin
    .from('course_task_documents')
    .select('path')
    .eq('id', docId)
    .eq('task_id', taskId)
    .single()
  if (!doc) return
  if (doc.path) await admin.storage.from(DOC_BUCKET).remove([doc.path])
  const { error } = await admin.from('course_task_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

export async function deleteTask(instanceId: string | null, taskId: string) {
  const { admin } = await requireManager(instanceId)
  const { error } = await admin.from('course_tasks').delete().eq('id', taskId).filter('instance_id', instanceId ? 'eq' : 'is', instanceId)
  if (error) throw new Error(error.message)
  revalidateTaskViews(instanceId)
}

// Files a task typed on one course into the suggestion library, so the next
// course can pick it instead of someone typing it again. Admin-only: the
// library is offered on every course, so adding to it is a catalog change,
// not a course one. The title is read from the task row rather than taken
// from the browser, and it lands as a situational suggestion
// (default_line false) — a one-off is not yet proof that every course needs it.
export async function fileTaskAsSuggestion(taskId: string) {
  const { admin } = await requireAdminUser()
  const { data: task, error: tErr } = await admin
    .from('course_tasks')
    .select('title, instance_id')
    .eq('id', taskId)
    .single()
  if (tErr || !task) throw new Error(tErr?.message ?? 'Task not found')
  const title = (task.title as string).trim()
  if (!title) throw new Error('Task has no title')

  const { data: existing, error: eErr } = await admin
    .from('course_task_templates')
    .select('title, sort_order')
    .eq('active', true)
  if (eErr) throw new Error(eErr.message)
  // A second click, or another admin filing the same task, is a no-op rather
  // than a duplicate line in everyone's picker.
  if ((existing ?? []).some((t) => (t.title as string).trim().toLowerCase() === title.toLowerCase())) {
    revalidateTaskViews(task.instance_id as string | null)
    return
  }

  // After the last line, inactive ones included, so a retired template's slot
  // is never reused and the canonical order stays stable.
  const { data: last } = await admin
    .from('course_task_templates')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await admin.from('course_task_templates').insert({
    title,
    sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
    default_line: false,
    active: true,
  })
  if (error) throw new Error(error.message)
  revalidateTaskViews(task.instance_id as string | null)
}
