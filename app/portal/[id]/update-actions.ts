'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCourseStaff } from '@/lib/course-access'
import { normalizeDocLink } from '@/lib/doc-links'
import { courseDisplayName } from '@/lib/courses'
import { meetingDayLabel } from '@/lib/meeting-details'

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

// Same three values as a course message, and the same meaning — with one
// addition: on an update the audience also decides who can see it on the page.
// Emailing only the crew while the words sit on a page the students are
// reading would be worse than not sending it at all.
export type UpdateAudience = 'students' | 'instructors' | 'everyone'

export type UpdateLink = { label: string; url: string }
export type UpdateAttachment = { path: string; filename: string }

// Both boxes unticked is not a state the UI offers, but a stale client could
// send it — and an update addressed to nobody is a page nobody reads.
function cleanAudience(value: unknown): UpdateAudience {
  return value === 'students' || value === 'instructors' ? value : 'everyone'
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

// The crew is a real audience, not an afterthought: a gear change posted the
// night before is exactly as much news to the instructor driving up in the
// morning as to the people meeting them, and the co-instructor who never opens
// the portal was the one person the first version left in the dark.
//
// The author is dropped from whichever groups are chosen — nobody needs an
// email telling them to go and read what they just wrote.
async function notify(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  authorName: string,
  authorEmail: string | null,
  audience: UpdateAudience,
  isReminder: boolean,
  subjectNote: string | null,
  /** Replaces the opening line for a notice that isn't about a post — the
      meeting details, which live in their own block and were never quoted
      here anyway. Still says only that something is set or has moved, never
      what it says, so nothing freezes in an inbox. */
  lead?: string | null
): Promise<NotifyOutcome> {
  const wantStudents = audience === 'students' || audience === 'everyone'
  const wantCrew = audience === 'instructors' || audience === 'everyone'

  const [{ data: inst }, { data: enrollments }, { data: crew }] = await Promise.all([
    admin.from('course_instances').select('course_type, custom_title').eq('id', instanceId).single(),
    wantStudents
      ? admin.from('enrollments').select('profiles(email)').eq('instance_id', instanceId)
      : Promise.resolve({ data: [] }),
    wantCrew
      ? admin.from('instance_instructors').select('instructors(email)').eq('instance_id', instanceId)
      : Promise.resolve({ data: [] }),
  ])

  const mine = authorEmail?.trim().toLowerCase() ?? null
  const recipients = [...new Set(
    [
      ...((enrollments ?? []) as unknown as { profiles: { email: string | null } | null }[])
        .map((e) => e.profiles?.email),
      ...((crew ?? []) as unknown as { instructors: { email: string | null } | null }[])
        .map((c) => c.instructors?.email),
    ]
      .map((e) => e?.trim())
      .filter((e): e is string => Boolean(e))
  )].filter((e) => e.toLowerCase() !== mine)

  if (recipients.length === 0) {
    const who = audience === 'instructors' ? 'nobody else instructing' : audience === 'students' ? 'nobody enrolled' : 'nobody else on the course'
    return { recipients: 0, sent: 0, problem: `There is ${who} to email yet, so this is on the course page only.` }
  }
  if (!process.env.RESEND_API_KEY) {
    return { recipients: recipients.length, sent: 0, problem: 'Email isn’t configured, so this is on the course page only.' }
  }

  const courseName = inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'your course'
  const link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/portal/${instanceId}`

  // Deliberately says nothing about the update itself. Anything quoted here
  // is a second copy that an edit can't reach — which is the whole reason the
  // message lives on the portal.
  // A generic "new update" is a mail some people won't open at 2100 the night
  // before. Where the caller knows what kind of news this is, it says so —
  // still only that something changed, never what it changed to, so nothing
  // freezes in an inbox.
  const subject = subjectNote
    ? `${courseName} — ${subjectNote}`
    : isReminder
      ? `${courseName} — updated information`
      : `${courseName} — new update from ${authorName}`
  const text = [
    lead ??
    (isReminder
      // Wording that fits an instructor as well as a student — the same
      // notice goes to both.
      ? `${authorName} has updated the information for the ${courseName} course.`
      : `${authorName} posted an update on the ${courseName} course.`),
    '',
    `${lead ? 'The details are on the course page' : 'Read it on the course page'}: ${link}`,
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
  input: {
    body: string; links?: UpdateLink[]; attachments?: UpdateAttachment[]; audience?: UpdateAudience
    /** Replaces "new update from X" in the email subject — the meeting details
        moving deserves a line that says so. Never carries a value. */
    subjectNote?: string
  }
): Promise<PostResult> {
  const { user, admin, authorName } = await requireCourseStaff(instanceId)

  const text = input.body.trim().slice(0, MAX_BODY)
  const links = cleanLinks(input.links)
  const attachments = (input.attachments ?? []).slice(0, 20)
  const audience = cleanAudience(input.audience)
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
      audience,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const outcome = await notify(admin, instanceId, authorName, user.email ?? null, audience, false, (input.subjectNote ?? '').trim().slice(0, 120) || null)

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
  input: { body: string; links?: UpdateLink[]; attachments?: UpdateAttachment[]; audience?: UpdateAudience }
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
    .update({ body: text, links, attachments, audience: cleanAudience(input.audience), updated_at: new Date().toISOString() })
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
  const { user, admin, authorName } = await requireCourseStaff(instanceId)

  const { data: existing } = await admin
    .from('course_updates')
    .select('notify_count, audience')
    .eq('id', updateId)
    .eq('instance_id', instanceId)
    .single()
  if (!existing) throw new Error('That update no longer exists')

  // The group it was addressed to, not whoever is on the course now — a second
  // notice goes to the same people as the first.
  const outcome = await notify(admin, instanceId, authorName, user.email ?? null, cleanAudience(existing.audience), true, null)

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

// The meeting point, announced.
//
// No post goes with it. The notice never quoted the plan — the block is meant
// to be the only copy — so a post could say nothing but "there is something to
// go and look at", which is exactly what the email says, and a course that
// sets tomorrow's plan every evening ended the week with a stack of them. The
// block itself is what the email points at, and it is the current answer by
// construction.
export async function announceMeetingDetails(
  instanceId: string,
  input: { audience?: UpdateAudience; meetingDate: string }
): Promise<PostResult> {
  const { user, admin, authorName } = await requireCourseStaff(instanceId)
  const audience = cleanAudience(input.audience)

  const { data: row } = await admin
    .from('course_instances')
    .select('starts_at, meeting_announced_dates')
    .eq('id', instanceId)
    .single()

  const day = input.meetingDate.trim() || (row?.starts_at as string | null) || null
  const announced: string[] = row?.meeting_announced_dates ?? []
  // Told about this day before, so anyone reading has an earlier version of
  // it. Not a comparison of the fields: a different day is a different plan,
  // not a correction of the last one.
  const moved = Boolean(day && announced.includes(day))

  const named = meetingDayLabel(day, null)
  const when = named ? ` for ${named}` : ''
  const short = meetingDayLabel(day, null, 'short')
  const what = short ? `meeting details for ${short}` : 'meeting details'

  const outcome = await notify(
    admin,
    instanceId,
    authorName,
    user.email ?? null,
    audience,
    false,
    moved ? `${what} changed` : what,
    moved
      ? `The meeting point or time${when} has changed — please check it before you set off.`
      : `Where and when to meet${when} is now set.`
  )

  // Written once it has actually gone out, which is what makes the next
  // announcement for this day a correction rather than the plan arriving.
  if (day && !announced.includes(day)) {
    await admin
      .from('course_instances')
      .update({ meeting_announced_dates: [...announced, day].sort() })
      .eq('id', instanceId)
  }

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
  return { recipients: outcome.recipients, sent: outcome.sent, emailProblem: outcome.problem }
}
