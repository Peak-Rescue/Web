'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'
import { syncCourseCalendar } from '@/lib/google-calendar'
import { MAX_BATCH, sendMail, sendMailBatch } from '@/lib/mailer'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user
}

const fmtLong = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// Emails a tokenized interest link to the selected instructors. Re-sending to
// someone keeps their existing row (and link); only sent_at/sent_count move.
export async function sendInterestInvites(
  instanceId: string,
  instructorIds: string[]
): Promise<{ sent: number; skipped: string[] }> {
  await requireAdmin()
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured (RESEND_API_KEY missing)')
  if (instructorIds.length === 0) return { sent: 0, skipped: [] }

  const admin = createAdminClient()
  const [{ data: inst }, { data: instructors }] = await Promise.all([
    admin
      .from('course_instances')
      .select('id, course_type, custom_title, client_name, location, starts_at, ends_at, status')
      .eq('id', instanceId)
      .single(),
    admin.from('instructors').select('id, name, email').in('id', instructorIds),
  ])
  if (!inst) throw new Error('Course not found')
  if (inst.status === 'cancelled') throw new Error('This course is cancelled')

  const withEmail = (instructors ?? []).filter((i) => i.email)
  const skipped = (instructors ?? []).filter((i) => !i.email).map((i) => i.name)
  if (withEmail.length === 0) return { sent: 0, skipped }

  // Ensure a row (and stable token) exists per instructor, then read them back.
  const { error: upsertError } = await admin
    .from('course_interest_invites')
    .upsert(
      withEmail.map((i) => ({ instance_id: instanceId, instructor_id: i.id })),
      { onConflict: 'instance_id,instructor_id', ignoreDuplicates: true }
    )
  if (upsertError) throw new Error(upsertError.message)

  const { data: inviteRows, error: readError } = await admin
    .from('course_interest_invites')
    .select('id, instructor_id, token, sent_count')
    .eq('instance_id', instanceId)
    .in('instructor_id', withEmail.map((i) => i.id))
  if (readError || !inviteRows) throw new Error(readError?.message ?? 'Could not load invites')
  const inviteByInstructor = new Map(inviteRows.map((r) => [r.instructor_id, r]))

  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
  const dates = inst.starts_at
    ? `${fmtLong(inst.starts_at)}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${fmtLong(inst.ends_at)}` : ''}`
    : 'Dates TBD'
  const statusLine =
    inst.status === 'confirmed'
      ? 'This course is confirmed.'
      : `This course is currently ${inst.status} — dates and details may still shift.`


  // The letter, once per instructor. Same text, different name and token.
  const letterFor = (instructor: { name: string }, token: string) => ({
    from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
    subject: `Interested in working ${courseName}? (${dates})`,
    text: [
      `${instructor.name}, we're staffing an upcoming course and want to check your availability.`,
      '',
      `Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}`,
      `Dates: ${dates}`,
      inst.location ? `Location: ${inst.location}` : null,
      statusLine,
      '',
      `Let us know either way (you can add a note too):`,
      `${siteUrl}/staffing/${token}`,
      '',
      `Expressing interest isn't a commitment — final staffing is confirmed separately.`,
    ].filter((l): l is string => l !== null).join('\n'),
  })

  const addressed = withEmail
    .map((instructor) => ({ instructor, invite: inviteByInstructor.get(instructor.id) }))
    .filter((x): x is { instructor: (typeof withEmail)[number]; invite: NonNullable<typeof x.invite> } => Boolean(x.invite))

  const delivered: typeof addressed = []

  // The whole room in one request. This used to be a send per instructor,
  // awaited in turn, so calling for twenty was twenty round trips in series
  // while somebody watched a spinner — and Resend takes a hundred letters at
  // a time.
  //
  // A strict batch is all-or-nothing: one address it won't accept and nobody
  // gets theirs. That is the wrong trade for a call-out, and losing the
  // per-person report with it would be worse — knowing who didn't get one is
  // the point of `skipped`. So a batch that comes back refused falls to the
  // old way, which finds out one at a time who the problem was.
  for (let i = 0; i < addressed.length; i += MAX_BATCH) {
    const chunk = addressed.slice(i, i + MAX_BATCH)
    const { error } = await sendMailBatch(
      chunk.map(({ instructor, invite }) => ({
        ...letterFor(instructor, invite.token),
        to: [instructor.email!],
      }))
    )
    if (!error) { delivered.push(...chunk); continue }

    console.error('Interest invite batch failed, falling back to one at a time:', error.message)
    for (const one of chunk) {
      try {
        const { error: e } = await sendMail({
          ...letterFor(one.instructor, one.invite.token),
          to: [one.instructor.email!],
        })
        if (e) throw new Error(e.message)
        delivered.push(one)
      } catch (e) {
        console.error(`Interest invite email to ${one.instructor.name} failed:`, e)
        skipped.push(one.instructor.name)
      }
    }
  }

  // One update per distinct send count rather than one per instructor: the
  // only thing that differs row to row is the number being stepped, and most
  // of the time every row is on the same one.
  const now = new Date().toISOString()
  const byCount = new Map<number, string[]>()
  for (const { invite } of delivered) {
    const n = invite.sent_count as number
    byCount.set(n, [...(byCount.get(n) ?? []), invite.id])
  }
  for (const [count, ids] of byCount) {
    const { error } = await admin
      .from('course_interest_invites')
      .update({ sent_at: now, sent_count: count + 1 })
      .in('id', ids)
    if (error) console.error('Recording interest invite sends failed:', error.message)
  }

  const sent = delivered.length

  revalidatePath(`/admin/courses/${instanceId}`)
  return { sent, skipped }
}

// One-off guest instructor: staff someone who isn't in the instructor roster
// yet. Reuses the roster flow — create the instructor record, assign them to
// this course, and email a portal invite so they can create their login.
// If the email already belongs to an instructor, that record is used instead
// of creating a duplicate.
export async function addGuestInstructor(
  instanceId: string,
  input: { firstName: string; lastName: string; email: string; role: 'lead' | 'assist' }
): Promise<{ name: string; existed: boolean }> {
  await requireAdmin()
  const admin = createAdminClient()

  const email = input.email.trim().toLowerCase()
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!firstName || !lastName) throw new Error('First and last name are required')
  if (!email) throw new Error('Email is required — the invite is sent there')

  const { adminCreateInstructor, adminSendInvite } = await import('@/app/admin/instructors/[id]/actions')

  const { data: existing } = await admin
    .from('instructors')
    .select('id, name')
    .ilike('email', email)
    .maybeSingle()

  const instructorId = existing?.id ?? (await adminCreateInstructor(firstName, lastName, email)).id

  const { error } = await admin
    .from('instance_instructors')
    .upsert({ instance_id: instanceId, instructor_id: instructorId, role: input.role }, { onConflict: 'instance_id,instructor_id' })
  if (error) throw new Error(error.message)

  // Portal invite (or a sign-in link if they already have an account).
  await adminSendInvite(instructorId)

  // The crew is part of the Google event title, so assignments re-sync it.
  after(() => syncCourseCalendar(admin, instanceId))

  revalidatePath(`/admin/courses/${instanceId}`)
  return { name: existing?.name ?? `${firstName} ${lastName}`, existed: Boolean(existing) }
}

export async function deleteInterestInvite(instanceId: string, inviteId: string) {
  await requireAdmin()
  const { error } = await createAdminClient()
    .from('course_interest_invites')
    .delete()
    .eq('id', inviteId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}
