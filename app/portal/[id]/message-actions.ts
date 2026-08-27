'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName } from '@/lib/courses'

// Group email to the people on a course.
//
// The other half of the pair with course_updates. An update lives on the
// portal and the email points at it, so it can be fixed. A message is the
// email — the words land in the inbox, which is what you want when someone
// has to read it tonight and won't be logging in to find out.
//
// It can't be unsent, so the UI asks twice and this file keeps the record.

const FROM = 'Peak Rescue <noreply@peak-rescue.com>'
const MAX_SUBJECT = 200
const MAX_BODY = 10_000

export type MessageAudience = 'students' | 'instructors' | 'everyone'

async function requireCourseStaff(instanceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles').select('role, first_name, last_name, email').eq('id', user.id).single()

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
  return { user, admin, authorName: name || 'Peak Rescue', authorEmail: profile?.email ?? null }
}

async function resolveRecipients(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  audience: MessageAudience
): Promise<string[]> {
  const wantStudents = audience === 'students' || audience === 'everyone'
  const wantCrew = audience === 'instructors' || audience === 'everyone'

  const [enrolled, crew] = await Promise.all([
    wantStudents
      ? admin.from('enrollments').select('profiles(email)').eq('instance_id', instanceId)
      : Promise.resolve({ data: [] }),
    wantCrew
      ? admin.from('instance_instructors')
          .select('instructors(email, profiles:profile_id(email))')
          .eq('instance_id', instanceId)
      : Promise.resolve({ data: [] }),
  ])

  const emails = [
    ...((enrolled.data ?? []) as unknown as { profiles: { email: string | null } | null }[])
      .map((e) => e.profiles?.email),
    // An instructor's own record carries an email even before they have a
    // login, so a guest on the crew still gets the message.
    ...((crew.data ?? []) as unknown as {
      instructors: { email: string | null; profiles: { email: string | null } | null } | null
    }[]).flatMap((r) => [r.instructors?.profiles?.email, r.instructors?.email]),
  ]

  return [...new Set(emails.filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase()))]
}

export type SendResult = { recipients: number; sent: number; problem: string | null }

export async function sendCourseMessage(
  instanceId: string,
  input: { subject: string; body: string; audience: MessageAudience; copyMe?: boolean }
): Promise<SendResult> {
  const { user, admin, authorName, authorEmail } = await requireCourseStaff(instanceId)

  const subject = input.subject.trim().slice(0, MAX_SUBJECT)
  const body = input.body.trim().slice(0, MAX_BODY)
  if (!subject) throw new Error('Give it a subject')
  if (!body) throw new Error('Write the message first')

  const recipients = await resolveRecipients(admin, instanceId, input.audience)
  if (recipients.length === 0) throw new Error('There’s nobody in that group yet')
  if (!process.env.RESEND_API_KEY) throw new Error('Email isn’t configured on this environment')

  const { data: inst } = await admin
    .from('course_instances').select('course_type, custom_title').eq('id', instanceId).single()
  const courseName = inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'your course'
  const link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/portal/${instanceId}`

  const text = [
    body,
    '',
    '—',
    `${authorName}, Peak Rescue`,
    `Your course page: ${link}`,
  ].join('\n')

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  // One send per address. A course roster is not a mailing list, and a reply
  // should reach the person who wrote it rather than everyone at once.
  const send = (to: string) => resend.emails.send({
    from: FROM,
    to: [to],
    replyTo: authorEmail ?? 'info@peak-rescue.com',
    subject: `${courseName} — ${subject}`,
    text,
  })

  // The sender's own copy: the same words the course got, as the receipt that
  // it went. Only when they aren't already a recipient, and never counted in
  // the delivered figure — that number is a promise about the course.
  const mine = authorEmail?.trim().toLowerCase() ?? null
  const wantsCopy = input.copyMe !== false && mine !== null && !recipients.includes(mine)
  const copySent: Promise<boolean> = wantsCopy
    ? send(mine!).then(({ error }) => { if (error) console.error('Author copy failed:', error); return !error })
    : Promise.resolve(true)

  const results = await Promise.all(
    recipients.map(async (to) => {
      const { error } = await send(to)
      if (error) console.error(`Course message to ${to} failed:`, error)
      return { to, ok: !error }
    })
  )
  const copyOk = await copySent
  const delivered = results.filter((r) => r.ok)

  await admin.from('course_messages').insert({
    instance_id: instanceId,
    subject,
    body,
    audience: input.audience,
    created_by: user.id,
    recipient_count: recipients.length,
    sent_count: delivered.length,
    recipients: delivered.map((r) => r.to),
  })

  revalidatePath(`/portal/${instanceId}`)
  return {
    recipients: recipients.length,
    sent: delivered.length,
    problem: [
      delivered.length === 0 ? 'Nothing went out — nobody received this.'
      : delivered.length < recipients.length
        ? `${recipients.length - delivered.length} of ${recipients.length} didn’t go through.`
        : null,
      // Its whole job is to be the proof it sent, so it can't fail in silence.
      copyOk ? null : 'Your own copy didn’t send — the course’s did.',
    ].filter(Boolean).join(' ') || null,
  }
}

// The record can be tidied, but the mail is gone either way — the UI says so.
export async function deleteCourseMessage(instanceId: string, messageId: string) {
  const { admin } = await requireCourseStaff(instanceId)
  const { error } = await admin
    .from('course_messages')
    .delete()
    .eq('id', messageId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/${instanceId}`)
}
