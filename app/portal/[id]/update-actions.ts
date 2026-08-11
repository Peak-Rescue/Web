'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { courseDisplayName } from '@/lib/courses'

// Updates posted to a course, with an email telling people to come and read
// them.
//
// The email carries no message text on purpose. The first version sent the
// whole thing, which froze it — a meeting point corrected an hour later left
// the wrong one sitting in a dozen inboxes. Pointing at the portal instead
// means there is one copy, and fixing it fixes what people see.

const FROM = 'Peak Rescue <noreply@peak-rescue.com>'
const DOC_BUCKET = 'task-documents'
const MAX_BODY = 4000
const MAX_DOC_BYTES = 20 * 1024 * 1024

export type UpdateLink = { label: string; url: string }
export type UpdateAttachment = { path: string; filename: string }

// Admins, and instructors assigned to this course. A meeting point moves the
// morning of day two and the person who needs to say so is the one standing
// there, not whoever is at a desk.
async function requireCourseStaff(instanceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles').select('role, first_name, last_name').eq('id', user.id).single()

  if (profile?.role !== 'admin') {
    const { data: assigned } = await admin
      .from('instance_instructors')
      .select('id, instructors!inner(profile_id)')
      .eq('instance_id', instanceId)
      .eq('instructors.profile_id', user.id)
      .maybeSingle()
    if (!assigned) throw new Error('Not authorized')
  }

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
  return { user, admin, authorName: name || 'Your instructor' }
}

function cleanLinks(links: UpdateLink[] | undefined): UpdateLink[] {
  return (links ?? [])
    .filter((l) => l.url?.trim())
    .slice(0, 20)
    .map((l) => {
      const { url, filename } = normalizeDocLink(l.url, l.label ?? '')
      return { label: filename, url }
    })
}

// ─── Attachments ────────────────────────────────────────────────────────────

// Same signed-upload flow as course and task documents: the browser puts the
// bytes straight into the private bucket, and only the path comes back here.
export async function createUpdateUploadTargets(
  instanceId: string,
  files: { name: string; size: number }[]
): Promise<{ path: string; token: string }[]> {
  const { admin } = await requireCourseStaff(instanceId)
  const { randomUUID } = await import('crypto')

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_DOC_BYTES) throw new Error(`"${file.name}" is over the 20 MB limit`)
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `courses/${instanceId}/updates/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(DOC_BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

// ─── Notifying ──────────────────────────────────────────────────────────────

type NotifyOutcome = { recipients: number; sent: number; problem: string | null }

async function notify(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  authorName: string,
  isReminder: boolean
): Promise<NotifyOutcome> {
  const [{ data: inst }, { data: enrollments }] = await Promise.all([
    admin.from('course_instances').select('course_type, custom_title').eq('id', instanceId).single(),
    admin.from('enrollments').select('profiles(email)').eq('instance_id', instanceId),
  ])

  const recipients = [...new Set(
    (enrollments ?? [])
      .map((e) => (e.profiles as unknown as { email: string | null } | null)?.email)
      .filter((e): e is string => Boolean(e))
  )]

  if (recipients.length === 0) {
    return { recipients: 0, sent: 0, problem: 'Nobody is enrolled yet, so this is on the course page only.' }
  }
  if (!process.env.RESEND_API_KEY) {
    return { recipients: recipients.length, sent: 0, problem: 'Email isn’t configured, so this is on the course page only.' }
  }

  const courseName = inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'your course'
  const link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/portal/${instanceId}`

  // Deliberately says nothing about the update itself. Anything quoted here
  // is a second copy that an edit can't reach — which is the whole reason the
  // message lives on the portal.
  const subject = isReminder
    ? `${courseName} — updated information`
    : `${courseName} — new update from ${authorName}`
  const text = [
    isReminder
      ? `${authorName} has updated the information for your ${courseName} course.`
      : `${authorName} posted an update for your ${courseName} course.`,
    '',
    `Read it on your course page: ${link}`,
    '',
    'The course page always has the current version, including any links or files attached.',
    '',
    '—',
    'Peak Rescue',
  ].join('\n')

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  // One send per address rather than one with everyone in `to` — a course
  // roster is not a mailing list, and students shouldn't see each other's
  // addresses.
  const results = await Promise.all(
    recipients.map(async (to) => {
      const { error } = await resend.emails.send({
        from: FROM, to: [to], replyTo: 'info@peak-rescue.com', subject, text,
      })
      if (error) console.error(`Course update email to ${to} failed:`, error)
      return !error
    })
  )
  const sent = results.filter(Boolean).length

  return {
    recipients: recipients.length,
    sent,
    problem:
      sent === 0 ? 'The email couldn’t be sent — the update is on the course page.'
      : sent < recipients.length ? `${recipients.length - sent} of ${recipients.length} emails didn’t go through.`
      : null,
  }
}

// ─── Posting, editing, notifying again ──────────────────────────────────────

export type PostResult = { recipients: number; sent: number; emailProblem: string | null }

export async function postCourseUpdate(
  instanceId: string,
  input: { body: string; links?: UpdateLink[]; attachments?: UpdateAttachment[] }
): Promise<PostResult> {
  const { user, admin, authorName } = await requireCourseStaff(instanceId)

  const text = input.body.trim().slice(0, MAX_BODY)
  const links = cleanLinks(input.links)
  const attachments = (input.attachments ?? []).slice(0, 20)
  if (!text && links.length === 0 && attachments.length === 0) {
    throw new Error('Write something, or attach a file or link')
  }

  // The post is recorded before the email goes out. Losing the message because
  // the mail server had a bad minute would be the worse failure.
  const { data: row, error } = await admin
    .from('course_updates')
    .insert({
      instance_id: instanceId,
      body: text,
      links,
      attachments,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const outcome = await notify(admin, instanceId, authorName, false)

  await admin
    .from('course_updates')
    .update({
      emailed_at: new Date().toISOString(),
      sent_count: outcome.sent,
      recipient_count: outcome.recipients,
      notify_count: 1,
    })
    .eq('id', row.id)

  revalidatePath(`/portal/${instanceId}`)
  return { recipients: outcome.recipients, sent: outcome.sent, emailProblem: outcome.problem }
}

// Editing does not email. The notice already sent points at this page, so a
// correction is live the moment it's saved — which is the point of sending a
// pointer rather than the text.
export async function editCourseUpdate(
  instanceId: string,
  updateId: string,
  input: { body: string; links?: UpdateLink[]; attachments?: UpdateAttachment[] }
) {
  const { admin } = await requireCourseStaff(instanceId)

  const text = input.body.trim().slice(0, MAX_BODY)
  const links = cleanLinks(input.links)
  const attachments = (input.attachments ?? []).slice(0, 20)
  if (!text && links.length === 0 && attachments.length === 0) {
    throw new Error('Write something, or attach a file or link')
  }

  const { error } = await admin
    .from('course_updates')
    .update({ body: text, links, attachments, updated_at: new Date().toISOString() })
    .eq('id', updateId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/${instanceId}`)
}

// For a correction big enough that people need telling twice. Separate from
// editing so it's always a decision, never a side effect of fixing a typo.
export async function renotifyCourseUpdate(
  instanceId: string,
  updateId: string
): Promise<PostResult> {
  const { admin, authorName } = await requireCourseStaff(instanceId)

  const { data: existing } = await admin
    .from('course_updates')
    .select('notify_count')
    .eq('id', updateId)
    .eq('instance_id', instanceId)
    .single()
  if (!existing) throw new Error('That update no longer exists')

  const outcome = await notify(admin, instanceId, authorName, true)

  await admin
    .from('course_updates')
    .update({
      emailed_at: new Date().toISOString(),
      sent_count: outcome.sent,
      recipient_count: outcome.recipients,
      notify_count: (existing.notify_count ?? 0) + 1,
    })
    .eq('id', updateId)

  revalidatePath(`/portal/${instanceId}`)
  return { recipients: outcome.recipients, sent: outcome.sent, emailProblem: outcome.problem }
}

// Removing an update takes it off the course page. The email that already went
// out is gone — the UI says so before asking.
export async function deleteCourseUpdate(instanceId: string, updateId: string) {
  const { admin } = await requireCourseStaff(instanceId)

  const { data: row } = await admin
    .from('course_updates')
    .select('attachments')
    .eq('id', updateId)
    .eq('instance_id', instanceId)
    .single()

  const paths = ((row?.attachments ?? []) as UpdateAttachment[]).map((a) => a.path).filter(Boolean)
  if (paths.length) await admin.storage.from(DOC_BUCKET).remove(paths)

  const { error } = await admin
    .from('course_updates')
    .delete()
    .eq('id', updateId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/${instanceId}`)
}
