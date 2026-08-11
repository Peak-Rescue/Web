'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName } from '@/lib/courses'

// Updates posted to a course and emailed to the students on it.
//
// Editing the course info in place tells nobody. This does — which is exactly
// why it's a separate action with a confirmation in front of it: every post is
// mail landing in a dozen inboxes.

const FROM = 'Peak Rescue <noreply@peak-rescue.com>'
const MAX_BODY = 4000

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

export type PostResult = {
  posted: true
  recipients: number
  sent: number
  emailProblem: string | null
}

export async function postCourseUpdate(instanceId: string, body: string): Promise<PostResult> {
  const { user, admin, authorName } = await requireCourseStaff(instanceId)

  const text = body.trim().slice(0, MAX_BODY)
  if (!text) throw new Error('Write something first')

  const [{ data: inst }, { data: enrollments }] = await Promise.all([
    admin.from('course_instances')
      .select('course_type, custom_title, starts_at')
      .eq('id', instanceId).single(),
    admin.from('enrollments')
      .select('profiles(email, first_name)')
      .eq('instance_id', instanceId),
  ])

  const recipients = [...new Set(
    (enrollments ?? [])
      .map((e) => (e.profiles as unknown as { email: string | null } | null)?.email)
      .filter((e): e is string => Boolean(e))
  )]

  // The post is recorded before the email goes out. If sending falls over, the
  // update still exists on the course page — losing the message because the
  // mail server had a bad minute would be the worse failure.
  const { data: row, error } = await admin
    .from('course_updates')
    .insert({
      instance_id: instanceId,
      body: text,
      created_by: user.id,
      recipient_count: recipients.length,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const courseName = inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'your course'
  const link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/portal/${instanceId}`

  let sent = 0
  let emailProblem: string | null = null

  if (recipients.length === 0) {
    emailProblem = 'Nobody is enrolled yet, so this went to the course page only.'
  } else if (!process.env.RESEND_API_KEY) {
    emailProblem = 'Email isn’t configured, so this went to the course page only.'
  } else {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    // One send per address rather than one with everyone in `to` — a course
    // roster is not a mailing list, and students shouldn't see each other's
    // addresses.
    const results = await Promise.all(
      recipients.map(async (to) => {
        const { error: sendError } = await resend.emails.send({
          from: FROM,
          to: [to],
          replyTo: 'info@peak-rescue.com',
          subject: `${courseName} — update from ${authorName}`,
          text: `${text}\n\n—\n${authorName}, Peak Rescue\n\nYour course page: ${link}`,
        })
        if (sendError) console.error(`Course update email to ${to} failed:`, sendError)
        return !sendError
      })
    )
    sent = results.filter(Boolean).length
    if (sent === 0) emailProblem = 'The email couldn’t be sent — the update is on the course page.'
    else if (sent < recipients.length) {
      emailProblem = `${recipients.length - sent} of ${recipients.length} emails didn’t go through.`
    }
  }

  await admin
    .from('course_updates')
    .update({ emailed_at: new Date().toISOString(), sent_count: sent })
    .eq('id', row.id)

  revalidatePath(`/portal/${instanceId}`)
  return { posted: true, recipients: recipients.length, sent, emailProblem }
}

// Removing an update takes it off the course page. The email that already
// went out is gone — the UI says so before asking.
export async function deleteCourseUpdate(instanceId: string, updateId: string) {
  const { admin } = await requireCourseStaff(instanceId)
  const { error } = await admin
    .from('course_updates')
    .delete()
    .eq('id', updateId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/${instanceId}`)
}
