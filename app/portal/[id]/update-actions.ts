'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCourseStaff } from '@/lib/course-access'
import { normalizeDocLink } from '@/lib/doc-links'
import { courseDisplayName } from '@/lib/courses'
import { meetingDayLabel } from '@/lib/meeting-details'
import { sendMail } from '@/lib/mailer'

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
//
// Except when they do. A copy in your own inbox is the receipt that the thing
// went out, and it is what tells the other admins CC'd on nothing that the job
// is done. So `copyMe` puts the author back in, and defaults on at the caller:
// an unwanted copy is a delete, a missing one is a doubt.

/**
 * A record that something was sent to the course, for the dot on the door it
 * is behind.
 *
 * Written where the mail goes out and nowhere else: a push is a deliberate act
 * with a recipient list, and an edit is not. Fixing a typo in a gear list at
 * eleven at night lights nothing up and accuses nobody of not having read it.
 *
 * Failing to write it must never fail the send — the mail has already gone,
 * and a missing dot is a smaller wrong than an action that reports an error
 * after doing its job.
 */
async function recordPush(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  section: 'schedule' | 'updates' | 'prep',
  audience: UpdateAudience,
  pushedBy: string | null,
) {
  const { error } = await admin
    .from('course_pushes')
    .insert({ instance_id: instanceId, section, audience, pushed_by: pushedBy })
  if (error) console.error('course_pushes insert failed', error.message)
}

async function notify(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  authorName: string,
  authorEmail: string | null,
  audience: UpdateAudience,
  isReminder: boolean,
  subjectNote: string | null,
  copyMe: boolean,
  /** Replaces the opening line for a notice that isn't about a post — the
      meeting details, which live in their own block and were never quoted
      here anyway. Still says only that something is set or has moved, never
      what it says, so nothing freezes in an inbox. */
  lead?: string | null,
  opts?: {
    /** Named recipients, when the sender picked them rather than taking the
        whole audience. Still filtered through the audience above, so a name
        that is not on this course cannot be mailed by asking for it. */
    only?: string[] | null
    /** Appended to the course link — "?open=prep" — so the mail lands on the
        door it is about rather than wherever the reader was last. */
    linkQuery?: string
    /** What they are being sent to look at, for the line that carries the
        link. Without it the mail says "the course page", which is true of
        every mail this function has ever sent. */
    noun?: string
    /** Addresses that are not in this audience and are meant not to be —
        someone asked by name who is not on the course. Unioned in after the
        filter rather than passed through it, because the audience is the very
        thing they are outside of, so the caller has to have checked them
        itself: this function will mail whatever it is handed here. */
    extra?: string[] | null
  }
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
    .filter((e) => !opts?.only || opts.only.some((o) => o.trim().toLowerCase() === e.toLowerCase()))

  // Named people from outside the audience, added once and only once: an
  // address can be both picked and rostered, and a duplicate here is a second
  // identical email.
  for (const e of opts?.extra ?? []) {
    const one = e.trim()
    if (!one || one.toLowerCase() === mine) continue
    if (recipients.some((r) => r.toLowerCase() === one.toLowerCase())) continue
    recipients.push(one)
  }

  // Added back after the filter rather than left in it: the author is usually
  // an admin who is neither enrolled nor rostered, so they are not in the list
  // to begin with, and dropping the filter alone would not reach them.
  const authorCopy = copyMe && authorEmail?.trim() ? [authorEmail.trim()] : []

  if (recipients.length === 0 && authorCopy.length === 0) {
    const who = audience === 'instructors' ? 'nobody else instructing' : audience === 'students' ? 'nobody enrolled' : 'nobody else on the course'
    return { recipients: 0, sent: 0, problem: `There is ${who} to email yet, so this is on the course page only.` }
  }
  if (!process.env.RESEND_API_KEY) {
    return { recipients: recipients.length, sent: 0, problem: 'Email isn’t configured, so this is on the course page only.' }
  }

  const courseName = inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'your course'
  const link =
    `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/portal/${instanceId}` +
    (opts?.linkQuery ?? '')

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
    opts?.noun
      ? `${opts.noun}: ${link}`
      : `${lead ? 'The details are on the course page' : 'Read it on the course page'}: ${link}`,
    '',
    opts?.noun
      ? 'That page always has the current version — nothing is copied into this email, so it cannot go stale.'
      : 'The course page always has the current version, including any links or files attached.',
    '',
    '—',
    'Peak Rescue',
  ].join('\n')


  // One send per address rather than one with everyone in `to` — a course
  // roster is not a mailing list, and students shouldn't see each other's
  // addresses.
  // The author's copy goes out with the rest but is not counted in `sent`.
  // That number is a promise about how many other people this reached, made
  // before something that can't be taken back — a receipt to yourself is not
  // one of them, and folding it in would quietly make the promise wrong.
  const send = (to: string) =>
    sendMail({ from: FROM, to: [to], replyTo: 'info@peak-rescue.com', subject, text })
  const copySent: Promise<boolean> = authorCopy.length > 0
    ? send(authorCopy[0]).then(({ error }) => {
        if (error) console.error('Author copy failed:', error)
        return !error
      })
    : Promise.resolve(true)

  const results = await Promise.all(
    recipients.map(async (to) => {
      const { error } = await send(to)
      if (error) console.error(`Course update email to ${to} failed:`, error)
      return !error
    })
  )
  // A copy that quietly fails is worse than none: its whole job is to be the
  // proof you pressed the button, so its absence would read as "it didn't
  // send" when in fact everyone else got it. Say so rather than log it.
  const copyOk = await copySent
  const sent = results.filter(Boolean).length

  const copyProblem = copyOk ? null : 'Your own copy didn’t send — everyone else’s did.'
  const sendProblem =
    sent === 0 && recipients.length > 0 ? 'The email couldn’t be sent — the update is on the course page.'
    : sent < recipients.length ? `${recipients.length - sent} of ${recipients.length} emails didn’t go through.`
    : null

  return {
    recipients: recipients.length,
    sent,
    problem: [sendProblem, copyProblem].filter(Boolean).join(' ') || null,
  }
}

// ─── Posting, editing, notifying again ──────────────────────────────────────

export type PostResult = { recipients: number; sent: number; emailProblem: string | null }

export async function postCourseUpdate(
  instanceId: string,
  input: {
    body: string; links?: UpdateLink[]; attachments?: UpdateAttachment[]; audience?: UpdateAudience
    /** A copy to the author's own inbox — the receipt that it went out, and
        what tells a CC'd colleague the job is done. On unless turned off. */
    copyMe?: boolean
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

  const outcome = await notify(admin, instanceId, authorName, user.email ?? null, audience, false, (input.subjectNote ?? '').trim().slice(0, 120) || null, input.copyMe !== false)

  await admin
    .from('course_updates')
    .update({
      emailed_at: new Date().toISOString(),
      sent_count: outcome.sent,
      recipient_count: outcome.recipients,
      notify_count: 1,
    })
    .eq('id', row.id)

  await recordPush(admin, instanceId, 'updates', audience, user.id)

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
    // Only what the caller actually sent. Every field here is optional in the
    // signature, and writing them regardless meant an edit that omitted the
    // audience reset it to everyone — turning a crew-only note into one the
    // students can read, silently, on a save that was about the wording.
    .update({
      body: text,
      ...(input.links !== undefined ? { links } : {}),
      ...(input.attachments !== undefined ? { attachments } : {}),
      ...(input.audience !== undefined ? { audience: cleanAudience(input.audience) } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', updateId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/${instanceId}`)
}

// For a correction big enough that people need telling twice. Separate from
// editing so it's always a decision, never a side effect of fixing a typo.
export async function renotifyCourseUpdate(
  instanceId: string,
  updateId: string,
  copyMe = true
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
  const outcome = await notify(admin, instanceId, authorName, user.email ?? null, cleanAudience(existing.audience), true, null, copyMe !== false)

  await admin
    .from('course_updates')
    .update({
      emailed_at: new Date().toISOString(),
      sent_count: outcome.sent,
      recipient_count: outcome.recipients,
      notify_count: (existing.notify_count ?? 0) + 1,
    })
    .eq('id', updateId)

  await recordPush(admin, instanceId, 'updates', cleanAudience(existing.audience), user.id)

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
  input: { audience?: UpdateAudience; meetingDate: string; copyMe?: boolean }
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
    input.copyMe !== false,
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

  // Behind Schedule, because that is where a morning is read now that the days
  // carry their own.
  await recordPush(admin, instanceId, 'schedule', audience, user.id)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
  return { recipients: outcome.recipients, sent: outcome.sent, emailProblem: outcome.problem }
}

// ─── A second pair of eyes ───────────────────────────────────────────────
//
// A gear list goes out to students and, through an order, to a client, and the
// person who assembled it is usually the only one who has read it. Asking the
// crew to look meant writing an update saying "please look at the gear list" —
// which lands in a feed, points at nothing in particular, and leaves nowhere
// to answer, so there was no way to tell afterwards whether anybody had.
//
// Same shape as the meeting-point announcement, and for the same reason: no
// post goes with it. The list is the thing to read and it is one door away,
// and a course that revises its kit twice in a week should not end the week
// with a stack of notices saying so. The dot lands on Prep, where the list is.

export async function requestGearReview(
  instanceId: string,
  listId: string,
  input?: {
    copyMe?: boolean
    /** Who to ask, by email. Empty or absent means the whole crew — which is
        what it did before there was a choice, and still the right default for
        a list the whole crew will pack from. */
    to?: string[]
  }
): Promise<PostResult> {
  const { user, admin, authorName } = await requireCourseStaff(instanceId)

  const { data: list } = await admin
    .from('gear_lists')
    .select('name')
    .eq('id', listId)
    .eq('instance_id', instanceId)
    .maybeSingle()
  if (!list) throw new Error('That gear list is not on this course')

  // Who was picked, and whether we know them.
  //
  // The picker offers this course's crew and every other active instructor,
  // because the person you want packing eyes on a canyon list is often
  // whoever has packed one before rather than whoever this course happened to
  // staff. Widening it does not widen it to anybody: a name still has to be
  // on the instructor roster before it becomes a recipient, so a typed or
  // tampered address cannot be mailed by asking for it.
  const wanted = (input?.to ?? []).map((e) => e.trim()).filter(Boolean)
  let named: string[] = []
  if (wanted.length) {
    const { data: roster } = await admin.from('instructors').select('email').eq('active', true)
    const ours = new Set(
      ((roster ?? []) as { email: string | null }[])
        .map((r) => r.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e))
    )
    named = wanted.filter((e) => ours.has(e.toLowerCase()))
  }

  const outcome = await notify(
    admin,
    instanceId,
    authorName,
    user.email ?? null,
    // The crew, and only the crew. A student has no say in what the course
    // carries and would read it as something they had to do.
    'instructors',
    false,
    `${list.name} — a look before it goes out`,
    input?.copyMe !== false,
    `${authorName} has asked for a second pair of eyes on the ${list.name} gear list before it goes out.`,
    {
      only: wanted.length ? wanted : null,
      // The half of the picking the audience above cannot express.
      extra: named,
      // Straight to the door the list is behind, rather than to whichever one
      // the reader happened to leave the course on.
      linkQuery: '?open=prep',
      noun: `Open the ${list.name} gear list`,
    }
  )

  // Written after the mail, so a list can't show as asked when nobody was.
  await admin
    .from('gear_lists')
    .update({ review_requested_at: new Date().toISOString(), review_requested_by: user.id })
    .eq('id', listId)

  await recordPush(admin, instanceId, 'prep', 'instructors', user.id)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
  return { recipients: outcome.recipients, sent: outcome.sent, emailProblem: outcome.problem }
}

/**
 * Signing one off, or taking the sign-off back.
 *
 * Any instructor on the course, not only an admin: the point is a reader who
 * did not write it. The note is what makes this worth more than a tick —
 * "fine, but we are short two rope bags" is the answer people actually have.
 */
export async function reviewGearList(
  instanceId: string,
  listId: string,
  input: { note?: string; clear?: boolean; flag?: boolean }
): Promise<{ told: string | null; problem: string | null }> {
  const { user, admin, authorName } = await requireCourseStaff(instanceId)

  const now = new Date().toISOString()
  const note = input.note?.trim().slice(0, 500) || null

  const { data: list, error } = await admin
    .from('gear_lists')
    .update(
      input.clear
        ? {
            reviewed_at: null, reviewed_by: null, review_note: null,
            review_flagged_at: null, review_flagged_by: null,
          }
        : input.flag
          // A flag leaves the ask open on purpose: the list is not ready, and
          // saying so is not the same as saying nothing.
          ? {
              reviewed_at: null, reviewed_by: null, review_note: note,
              review_flagged_at: now, review_flagged_by: user.id,
            }
          : {
              reviewed_at: now, reviewed_by: user.id, review_note: note,
              review_flagged_at: null, review_flagged_by: null,
            }
    )
    .eq('id', listId)
    .eq('instance_id', instanceId)
    .select('name, review_requested_by')
    .maybeSingle()
  if (error) throw new Error(error.message)

  // Undoing your own tick is not news.
  if (input.clear || !list) {
    revalidatePath(`/portal/${instanceId}`)
    revalidatePath(`/admin/courses/${instanceId}`)
    return { told: null, problem: null }
  }

  const answer = await tellTheAsker(admin, instanceId, list, user.id, authorName, {
    flagged: Boolean(input.flag),
    note,
  })

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
  return answer
}

/**
 * The answer goes back to whoever asked for it.
 *
 * An ask is one person waiting on another, and until now the waiting ended
 * only by going back to look. Both answers travel — a flag most of all, since
 * it is the one that needs somebody to do something.
 *
 * The note is quoted in the mail, which is the one place this app copies
 * content into an inbox rather than linking to it. A note is not the list: it
 * is a sentence someone wrote *about* the list, it is what the reader was
 * asked for, and an email saying "there is a note on the course page" would
 * be the same round trip the ask already made somebody take.
 */
async function tellTheAsker(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  list: { name: string; review_requested_by: string | null },
  readerId: string,
  readerName: string,
  answer: { flagged: boolean; note: string | null }
): Promise<{ told: string | null; problem: string | null }> {
  // Nobody asked, so nobody is waiting. A list can be signed off unprompted —
  // someone read it and said so — and that is a fact for the page, not a mail.
  if (!list.review_requested_by) return { told: null, problem: null }
  // Answering your own ask happens when the asker gives up waiting and reads
  // it themselves. They do not need telling what they just did.
  if (list.review_requested_by === readerId) return { told: null, problem: null }

  const [{ data: asker }, { data: inst }] = await Promise.all([
    admin.from('profiles').select('email, first_name').eq('id', list.review_requested_by).maybeSingle(),
    admin.from('course_instances').select('course_type, custom_title').eq('id', instanceId).single(),
  ])
  const to = asker?.email?.trim()
  if (!to) return { told: null, problem: 'Whoever asked has no email on file, so this is on the page only.' }
  if (!process.env.RESEND_API_KEY) {
    return { told: null, problem: 'Email isn’t configured, so this is on the page only.' }
  }

  const courseName = inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'your course'
  const link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/portal/${instanceId}?open=prep`

  const subject = answer.flagged
    ? `${courseName} — ${readerName} flagged the ${list.name}`
    : `${courseName} — ${readerName} checked the ${list.name}`

  const text = [
    answer.flagged
      ? `${readerName} has read the ${list.name} gear list and flagged it. It is not signed off.`
      : `${readerName} has read the ${list.name} gear list and signed it off.`,
    '',
    ...(answer.note ? [`They wrote:`, '', `  “${answer.note}”`, ''] : []),
    `Open the ${list.name} gear list: ${link}`,
    '',
    '—',
    'Peak Rescue',
  ].join('\n')

  const { error } = await sendMail({ from: FROM, to: [to], replyTo: 'info@peak-rescue.com', subject, text })
  if (error) {
    console.error('Gear review answer email failed:', error)
    return { told: null, problem: 'Saved, but the email to whoever asked didn’t send.' }
  }
  return { told: asker?.first_name?.trim() || to, problem: null }
}

/**
 * That somebody opened a list, which is not the same as answering about it.
 *
 * Recorded when the gear fold is opened rather than when the page renders:
 * the list sits behind a fold, and a page view is not a read of what is
 * inside it. Counting the second visit as well, because "opened it twice and
 * said nothing" is a different silence from "has not been back".
 */
export async function sawGearList(instanceId: string, listIds: string[]): Promise<void> {
  if (listIds.length === 0) return
  const { user, admin } = await requireCourseStaff(instanceId)

  // Only lists actually on this course, so an id from elsewhere cannot write
  // a row here by being named.
  const { data: mine } = await admin
    .from('gear_lists').select('id').eq('instance_id', instanceId).in('id', listIds)
  const ids = ((mine ?? []) as { id: string }[]).map((r) => r.id)
  if (ids.length === 0) return

  const { data: seen } = await admin
    .from('gear_list_views').select('list_id, times, first_seen_at')
    .eq('user_id', user.id).in('list_id', ids)
  const before = new Map(((seen ?? []) as { list_id: string; times: number; first_seen_at: string }[])
    .map((r) => [r.list_id, r]))

  const now = new Date().toISOString()
  await admin.from('gear_list_views').upsert(
    ids.map((id) => ({
      user_id: user.id,
      list_id: id,
      // Kept, not moved: the first read is the one that answers "did they
      // ever look", which is the question the asker has.
      first_seen_at: before.get(id)?.first_seen_at ?? now,
      last_seen_at: now,
      times: (before.get(id)?.times ?? 0) + 1,
    })),
    { onConflict: 'user_id,list_id' }
  )
}

export type Askable = {
  name: string
  email: string
  role: string
  isMe: boolean
  /** On the crew for this course, as against merely on the books. The picker
      ticks the first group and folds the second away. */
  onCourse: boolean
}

/**
 * Everyone a sender can ask to check a list: this course's crew first, then
 * every other active instructor.
 *
 * Read here rather than passed down from the page: the picker opens on a
 * press, long after the page was built, and a staffing change in between
 * should show up in it.
 *
 * The name is now narrower than what it returns, and kept anyway — the crew
 * is still what the picker is for, and the rest is the exception it makes.
 */
export async function courseCrew(instanceId: string): Promise<Askable[]> {
  const { user, admin } = await requireCourseStaff(instanceId)
  const [{ data: assigned }, { data: roster }] = await Promise.all([
    admin
      .from('instance_instructors')
      .select('role, instructors(id, name, email)')
      .eq('instance_id', instanceId),
    // Everybody else on the books, in one round trip with the crew: the
    // picker shows both, and two presses to see the second half would be a
    // press to find out there is nobody there.
    admin.from('instructors').select('id, name, email, instructor_role').eq('active', true).order('name'),
  ])

  const mine = user.email?.trim().toLowerCase() ?? null
  const mineIs = (email: string) => email.trim().toLowerCase() === mine

  const rows = ((assigned ?? []) as unknown as
    { role: string; instructors: { id: string; name: string; email: string | null } | null }[])
    .filter((r) => r.instructors?.email)

  const crew = rows
    .map((r) => ({
      name: r.instructors!.name,
      email: r.instructors!.email!,
      role: r.role,
      isMe: mineIs(r.instructors!.email!),
      onCourse: true,
    }))
    .sort((a, b) => (a.role === 'lead' ? 0 : 1) - (b.role === 'lead' ? 0 : 1) || a.name.localeCompare(b.name))

  const staffed = new Set(rows.map((r) => r.instructors!.id))
  const others = ((roster ?? []) as { id: string; name: string; email: string | null; instructor_role: string }[])
    .filter((i) => i.email && !staffed.has(i.id))
    .map((i) => ({
      name: i.name,
      email: i.email!,
      role: i.instructor_role,
      isMe: mineIs(i.email!),
      onCourse: false,
    }))

  return [...crew, ...others]
}
