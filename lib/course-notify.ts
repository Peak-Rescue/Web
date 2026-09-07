import type { SupabaseClient } from '@supabase/supabase-js'
import { CAPABILITY_ORDER } from '@/lib/capabilities'

/** Who an update is for. The audience also decides who can see it on the page:
    emailing only the crew while the words sit where the students are reading
    would be worse than not sending at all. */
export type UpdateAudience = 'students' | 'instructors' | 'everyone'

/** How many inboxes each choice of audience reaches, you excepted. */
export type NotifyCounts = { students: number; instructors: number; everyone: number }

// Counted by address and never by head: an instructor who is also enrolled is
// one inbox, and your own doesn't count because the poster is never emailed
// their own post. `everyone` is its own union for exactly that reason — adding
// the two groups would double-count that person.
//
// One definition, because the number is a promise made before something that
// can't be taken back: the button says "emails 10 people" on two different
// screens and they had better agree with each other and with what goes out.
export function countAddresses(
  emails: (string | null | undefined)[],
  excludeEmail: string | null
): Set<string> {
  const mine = excludeEmail?.trim().toLowerCase() ?? null
  return new Set(
    emails
      .map((e) => e?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e) && e !== mine)
  )
}

export function notifyCountsFrom(
  studentEmails: (string | null | undefined)[],
  crewEmails: (string | null | undefined)[],
  excludeEmail: string | null
): NotifyCounts {
  const students = countAddresses(studentEmails, excludeEmail)
  const crew = countAddresses(crewEmails, excludeEmail)
  return {
    students: students.size,
    instructors: crew.size,
    everyone: new Set([...students, ...crew]).size,
  }
}

/** The same counts for a caller that hasn't already loaded the roster — the
    admin course editor, which knows the course but not its addresses. */
export async function courseNotifyCounts(
  admin: SupabaseClient,
  instanceId: string,
  excludeEmail: string | null
): Promise<NotifyCounts> {
  const [{ data: enrollments }, { data: crew }] = await Promise.all([
    admin.from('enrollments').select('profiles(email)').eq('instance_id', instanceId),
    admin.from('instance_instructors').select('instructors(email)').eq('instance_id', instanceId),
  ])
  return notifyCountsFrom(
    ((enrollments ?? []) as unknown as { profiles: { email: string | null } | null }[]).map((e) => e.profiles?.email),
    ((crew ?? []) as unknown as { instructors: { email: string | null } | null }[]).map((c) => c.instructors?.email),
    excludeEmail
  )
}

/** Whether a course is real enough to email the crew about a change to it.
    A tentative or quoted course is a proposal: its dates move as the client
    talks, and mailing every move trains people to ignore the ones that
    matter. Nothing goes out about a change until the course is confirmed —
    up to then the portal page is the record, and anyone staffed early can
    read it there.

    `completed` counts too: a course that already ran was confirmed once, and
    a correction to it after the fact is still news to the people who worked
    it. */
export function announcesChanges(status: string | null | undefined): boolean {
  return status === 'confirmed' || status === 'completed'
}

// ─── New-course alerts to admins ─────────────────────────────────────────────

/** Whether one admin's boxes cover one course.

    Held as what they have *un*ticked, so an empty mute list is a full inbox —
    which is what a new admin, and a newly added discipline, both need to be.
    Sector and discipline are separate gates and both have to pass: unticking
    Military means a military canyon course is not yours even though Canyon is
    still ticked.

    A course tagged with no discipline at all — an internal planning day, an
    untagged custom — has nothing for the discipline gate to weigh, so it goes
    to everyone who hasn't muted the lot. Hiding it behind a discipline nobody
    claimed would make it reachable by no setting at all. */
export function courseMatchesAlertPrefs(
  course: { disciplines: string[]; sector: 'military' | 'civilian' },
  muted: { disciplines: string[]; sectors: string[] }
): boolean {
  if (muted.sectors.includes(course.sector)) return false

  // Unticking every discipline is how an admin turns alerts off, so it has to
  // silence the untagged courses too — otherwise "all boxes clear" still
  // leaks the internal days, and there is no box left to stop them with.
  const allMuted = CAPABILITY_ORDER.every((c) => muted.disciplines.includes(c))
  if (allMuted) return false
  if (course.disciplines.length === 0) return true

  return course.disciplines.some((d) => !muted.disciplines.includes(d))
}

/** Email the admins who asked to hear about it that a course now exists.

    Deliberately unconditional on status: `announcesChanges` keeps tentative
    churn away from the crew, and this is the opposite audience. A course is
    news to an admin at the moment it is written down, and most of them start
    tentative.

    Best-effort like every other portal send — creating a course must not fail
    because Resend is down. The creator is never emailed their own course. */
export async function emailAdminsNewCourse(
  admin: SupabaseClient,
  instanceId: string,
  createdByUserId: string
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return

    const { courseShortName } = await import('@/lib/courses')
    const { courseCapabilityCategories, courseSector, CAPABILITY_META } = await import('@/lib/capabilities')
    const { sendMail } = await import('@/lib/mailer')

    const { data: course } = await admin
      .from('course_instances')
      .select('ref_number, course_type, course_category, custom_title, custom_categories, status, internal, client_name, location, starts_at, ends_at, max_students, instructor_slots, notes')
      .eq('id', instanceId)
      .single()
    if (!course) return

    const disciplines = courseCapabilityCategories(course.course_type, course.custom_categories)
    const sector = courseSector(course.course_category)

    // Admins only, and never the person who just clicked Create. The prefs
    // live on the instructor row because that is the record the profile page
    // edits; every admin has one.
    const { data: rows } = await admin
      .from('instructors')
      .select('email, profile_id, course_alert_muted_disciplines, course_alert_muted_sectors, profiles!inner(role, email)')
      .eq('profiles.role', 'admin')

    type Row = {
      email: string | null
      profile_id: string | null
      course_alert_muted_disciplines: string[] | null
      course_alert_muted_sectors: string[] | null
      profiles: { role: string; email: string | null } | null
    }

    const recipients = [
      ...new Set(
        ((rows ?? []) as unknown as Row[])
          .filter((r) => r.profile_id !== createdByUserId)
          .filter((r) =>
            courseMatchesAlertPrefs(
              { disciplines, sector },
              {
                disciplines: r.course_alert_muted_disciplines ?? [],
                sectors: r.course_alert_muted_sectors ?? [],
              }
            )
          )
          .map((r) => (r.email ?? r.profiles?.email)?.trim().toLowerCase())
          .filter((e): e is string => Boolean(e))
      ),
    ]
    if (recipients.length === 0) return

    const fmt = (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const when = course.starts_at
      ? course.ends_at && course.ends_at !== course.starts_at
        ? `${fmt(course.starts_at)} – ${fmt(course.ends_at)}`
        : fmt(course.starts_at)
      : 'dates TBD'

    const name = courseShortName(course.course_type, course.custom_title)
    const ref = course.ref_number ? `PR-${String(course.ref_number).padStart(4, '0')}` : null
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'

    // The status is in the subject because it is the thing that decides
    // whether this needs anyone's attention today.
    await sendMail({
      from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
      to: recipients,
      subject: `New ${course.status} course — ${name} (${when})`,
      text: [
        `A course has been added to the portal.`,
        '',
        `Course: ${name}${ref ? ` · ${ref}` : ''}`,
        `Status: ${course.status}${course.internal ? ' · internal' : ''}`,
        `Dates: ${when}`,
        course.client_name ? `Client: ${course.client_name}` : null,
        course.location ? `Location: ${course.location}` : null,
        `Sector: ${sector}`,
        disciplines.length > 0
          ? `Disciplines: ${disciplines.map((d) => CAPABILITY_META[d].label).join(', ')}`
          : null,
        course.max_students ? `Students: up to ${course.max_students}` : null,
        course.instructor_slots ? `Instructors needed: ${course.instructor_slots}` : null,
        course.notes ? `\nNotes: ${course.notes}` : null,
        '',
        `Open it: ${site}/admin/courses/${instanceId}`,
        '',
        `You are getting this because of your new-course alert settings. Change what you hear about at ${site}/instructor.`,
      ].filter((l): l is string => l !== null).join('\n'),
    })
  } catch (e) {
    console.error('New-course admin alert failed:', e)
  }
}
