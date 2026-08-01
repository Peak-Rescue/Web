// Automated reminder emails.
//
// Two reminders live here:
//   1. Medical-cert gaps — an instructor staffed on a course whose medical
//      cert (CPR/WFR/EMT/other EMS) will be expired by the course's last day
//      is told to update it in the portal. Fires at assignment time
//      (sendAssignmentCertAlert) and from the cron sweep (runCertSweep).
//      Discipline certs are deliberately out of scope: medical certs apply to
//      every course we run, so no course-type mapping is needed.
//   2. ADP hours — instructors who worked during the pay period ending on an
//      "hours due" date (read from the Peak Rescue admin Google calendar) get
//      a reminder to upload their hours (runHoursReminders).
//
// Every send is claimed in notification_log first, so retried cron runs and
// overlapping entry points can't double-email anyone. All entry points are
// best-effort and never throw — a reminder must never break a portal write.

import { type createAdminClient } from '@/lib/supabase/admin'
import { CERT_GROUPS, CERT_META, type CertType } from '@/lib/certs'
import { courseShortName } from '@/lib/courses'
import { listUpcomingEvents } from '@/lib/google-calendar'

type Admin = ReturnType<typeof createAdminClient>

const MEDICAL_CERTS = CERT_GROUPS.find((g) => g.id === 'medical')!.certs

const FROM = 'Peak Rescue Portal <noreply@peak-rescue.com>'

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

function friendlyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: FROM, to: [to], subject, text })
  if (error) console.error(`Reminder email to ${to} failed:`, error)
  return !error
}

// Claims (kind, dedupeKey) in notification_log. True = ours to send; false =
// already sent (or the claim itself failed — skipping beats double-sending).
async function claim(admin: Admin, kind: string, dedupeKey: string): Promise<boolean> {
  const { data, error } = await admin
    .from('notification_log')
    .upsert({ kind, dedupe_key: dedupeKey }, { onConflict: 'kind,dedupe_key', ignoreDuplicates: true })
    .select('id')
  if (error) {
    console.error('notification_log claim failed:', error.message)
    return false
  }
  return (data ?? []).length > 0
}

// ─── Medical-cert gaps ──────────────────────────────────────────────────────

type CertRow = { instructor_id: string; cert_type: string; expires_at: string | null }

// Per profile, each medical cert's furthest-out expiry. `null` = a no-expiry
// row exists (treated as current); absent = cert not on file (out of scope —
// only *expired* certs trigger emails, per ops).
function bestMedicalExpiry(certs: CertRow[]): Map<string, Map<CertType, string | null>> {
  const byProfile = new Map<string, Map<CertType, string | null>>()
  for (const c of certs) {
    const per = byProfile.get(c.instructor_id) ?? new Map<CertType, string | null>()
    byProfile.set(c.instructor_id, per)
    const prev = per.get(c.cert_type as CertType)
    if (prev === null) continue
    if (c.expires_at === null || prev === undefined || c.expires_at > prev) {
      per.set(c.cert_type as CertType, c.expires_at)
    }
  }
  return byProfile
}

type CourseRef = {
  id: string
  course_type: string
  custom_title: string | null
  client_name: string | null
  starts_at: string | null
  ends_at: string | null
}

function courseLine(c: CourseRef): string {
  const name = courseShortName(c.course_type, c.custom_title)
  const dates = c.starts_at
    ? `${c.starts_at}${c.ends_at && c.ends_at !== c.starts_at ? ` – ${c.ends_at}` : ''}`
    : 'dates TBD'
  return `- ${name}${c.client_name ? ` · ${c.client_name}` : ''} (${dates})`
}

function certGapEmail(
  name: string,
  gaps: Map<CertType, string>,
  courses: CourseRef[]
): { subject: string; text: string } {
  const today = todayISO()
  const certLines = [...gaps.entries()].map(([type, exp]) => {
    const when = exp < today ? `expired ${friendlyDate(exp)}` : `expires ${friendlyDate(exp)}`
    return `- ${CERT_META[type].label} — ${when}`
  })
  return {
    subject: 'Action needed: update your medical cert in the portal',
    text: [
      `${name}, the following medical cert${gaps.size > 1 ? 's' : ''} on file will be expired by the time you're scheduled to work:`,
      '',
      ...certLines,
      '',
      `Course${courses.length > 1 ? 's' : ''} affected:`,
      ...courses.map(courseLine),
      '',
      `Please upload your renewed cert in the portal: ${siteUrl()}/instructor`,
    ].join('\n'),
  }
}

// Medical certs that will be expired by `byDate` for one profile's cert map.
function gapsFor(per: Map<CertType, string | null> | undefined, byDate: string): Map<CertType, string> {
  const gaps = new Map<CertType, string>()
  if (!per) return gaps
  for (const type of MEDICAL_CERTS) {
    const exp = per.get(type)
    if (exp != null && exp < byDate) gaps.set(type, exp)
  }
  return gaps
}

// One immediate alert on a fresh assignment. Claims this month's sweep key
// afterwards so the cron sweep doesn't repeat itself days later.
export async function sendAssignmentCertAlert(
  admin: Admin,
  instanceId: string,
  instructorId: string
): Promise<void> {
  try {
    const [{ data: instructor }, { data: course }] = await Promise.all([
      admin.from('instructors').select('name, email, profile_id').eq('id', instructorId).maybeSingle(),
      admin
        .from('course_instances')
        .select('id, course_type, custom_title, client_name, starts_at, ends_at, status')
        .eq('id', instanceId)
        .maybeSingle(),
    ])
    if (!instructor?.email || !instructor.profile_id || !course || course.status === 'cancelled') return

    const { data: certs } = await admin
      .from('instructor_certs')
      .select('instructor_id, cert_type, expires_at')
      .eq('instructor_id', instructor.profile_id)
      .in('cert_type', MEDICAL_CERTS)
    const per = bestMedicalExpiry((certs ?? []) as CertRow[]).get(instructor.profile_id)
    const byDate = course.ends_at ?? course.starts_at ?? todayISO()
    const gaps = gapsFor(per, byDate)
    if (gaps.size === 0) return

    const { subject, text } = certGapEmail(instructor.name, gaps, [course as CourseRef])
    if (await sendEmail(instructor.email, subject, text)) {
      await claim(admin, 'cert_gap', `${todayISO().slice(0, 7)}:${instructorId}`)
    }
  } catch (e) {
    console.error('Assignment cert alert failed:', e)
  }
}

// Sweeps every staffed, non-cancelled future course. Month-keyed dedupe means
// each instructor hears about a given gap at most once per calendar month.
export async function runCertSweep(admin: Admin): Promise<{ checked: number; sent: number }> {
  const today = todayISO()

  const { data: instanceRows } = await admin
    .from('course_instances')
    .select('id, course_type, custom_title, client_name, starts_at, ends_at')
    .in('status', ['tentative', 'confirmed'])
    .not('starts_at', 'is', null)
  const instances = ((instanceRows ?? []) as CourseRef[]).filter(
    (c) => (c.ends_at ?? c.starts_at!) >= today
  )
  if (instances.length === 0) return { checked: 0, sent: 0 }
  const instanceById = new Map(instances.map((c) => [c.id, c]))

  const { data: assignmentRows } = await admin
    .from('instance_instructors')
    .select('instance_id, instructor_id, instructors(name, email, profile_id)')
    .in('instance_id', instances.map((c) => c.id))
  const assignments = ((assignmentRows ?? []) as unknown as {
    instance_id: string
    instructor_id: string
    instructors: { name: string; email: string | null; profile_id: string | null } | null
  }[]).filter((a) => a.instructors?.email && a.instructors.profile_id && instanceById.has(a.instance_id))

  const profileIds = [...new Set(assignments.map((a) => a.instructors!.profile_id!))]
  if (profileIds.length === 0) return { checked: 0, sent: 0 }
  const { data: certs } = await admin
    .from('instructor_certs')
    .select('instructor_id, cert_type, expires_at')
    .in('instructor_id', profileIds)
    .in('cert_type', MEDICAL_CERTS)
  const expiryByProfile = bestMedicalExpiry((certs ?? []) as CertRow[])

  // One email per instructor covering all their affected courses.
  const byInstructor = new Map<string, typeof assignments>()
  for (const a of assignments) {
    byInstructor.set(a.instructor_id, [...(byInstructor.get(a.instructor_id) ?? []), a])
  }

  let sent = 0
  for (const [instructorId, theirs] of byInstructor) {
    const { name, email, profile_id } = theirs[0].instructors!
    const per = expiryByProfile.get(profile_id!)
    const allGaps = new Map<CertType, string>()
    const affected: CourseRef[] = []
    for (const a of theirs) {
      const course = instanceById.get(a.instance_id)!
      const gaps = gapsFor(per, course.ends_at ?? course.starts_at!)
      if (gaps.size === 0) continue
      affected.push(course)
      for (const [type, exp] of gaps) allGaps.set(type, exp)
    }
    if (affected.length === 0) continue
    if (!(await claim(admin, 'cert_gap', `${today.slice(0, 7)}:${instructorId}`))) continue

    const { subject, text } = certGapEmail(name, allGaps, affected)
    if (await sendEmail(email!, subject, text)) sent++
  }
  return { checked: byInstructor.size, sent }
}

// ─── ADP hours reminders ────────────────────────────────────────────────────

// Hours-due dates come from events titled like "Hours due" on the Peak Rescue
// admin calendar. The reminder goes out the day before (Thursday, for a
// Friday due date) to everyone staffed on a course overlapping the 14-day pay
// period ending on that date. Due-today is included only as a catch-up in
// case the previous day's cron run never fired; per-due-date dedupe keys
// guarantee each person is reminded exactly once either way.
export async function runHoursReminders(
  admin: Admin
): Promise<{ sent: number; dueDates: string[] } | { skipped: string }> {
  const calendarId = process.env.GCAL_GENERAL_CALENDAR_ID
  if (!calendarId) return { skipped: 'GCAL_GENERAL_CALENDAR_ID not set' }
  const events = await listUpcomingEvents(calendarId)
  if (events === null) return { skipped: 'admin calendar not readable' }

  const today = todayISO()
  const horizon = addDaysISO(today, 1)
  const dueDates = [
    ...new Set(
      events
        .filter((e) => /hours.*due/i.test(e.summary) && e.start >= today && e.start <= horizon)
        .map((e) => e.start)
    ),
  ]
  if (dueDates.length === 0) return { sent: 0, dueDates }

  const { data: instanceRows } = await admin
    .from('course_instances')
    .select('id, course_type, custom_title, client_name, starts_at, ends_at, status')
    .neq('status', 'cancelled')
    .not('starts_at', 'is', null)
  const allInstances = (instanceRows ?? []) as (CourseRef & { status: string })[]

  let sent = 0
  for (const dueDate of dueDates) {
    const periodStart = addDaysISO(dueDate, -13)
    const worked = allInstances.filter(
      (c) => c.starts_at! <= dueDate && (c.ends_at ?? c.starts_at!) >= periodStart
    )
    if (worked.length === 0) continue
    const instanceById = new Map(worked.map((c) => [c.id, c]))

    const { data: assignmentRows } = await admin
      .from('instance_instructors')
      .select('instance_id, instructor_id, instructors(name, email)')
      .in('instance_id', worked.map((c) => c.id))
    const assignments = ((assignmentRows ?? []) as unknown as {
      instance_id: string
      instructor_id: string
      instructors: { name: string; email: string | null } | null
    }[]).filter((a) => a.instructors?.email)

    const byInstructor = new Map<string, typeof assignments>()
    for (const a of assignments) {
      byInstructor.set(a.instructor_id, [...(byInstructor.get(a.instructor_id) ?? []), a])
    }

    const due = friendlyDate(dueDate)
    for (const [instructorId, theirs] of byInstructor) {
      if (!(await claim(admin, 'hours_due', `${dueDate}:${instructorId}`))) continue
      const { name, email } = theirs[0].instructors!
      const ok = await sendEmail(
        email!,
        `Reminder: hours due in ADP by ${due}`,
        [
          `${name}, payroll hours are due in ADP by ${due}.`,
          '',
          'Your courses this pay period:',
          ...theirs.map((a) => courseLine(instanceById.get(a.instance_id)!)),
          '',
          `Please make sure your hours are uploaded to ADP by end of day ${due}.`,
        ].join('\n')
      )
      if (ok) sent++
    }
  }
  return { sent, dueDates }
}
