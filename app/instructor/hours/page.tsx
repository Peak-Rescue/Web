import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listUpcomingEvents } from '@/lib/google-calendar'
import { courseShortName, dayShift } from '@/lib/courses'
import { draftRows, periodEndFromDue, periodFor, shiftPeriod, stateOf, type Period, type TimesheetCourse, type TimesheetRow } from '@/lib/timesheet'
import TimesheetEditor from './TimesheetEditor'
import { saveTimesheet, markTimesheetSent } from './actions'

// Hours-due dates recur every fortnight on the admin calendar, so one of them
// fixes every period boundary. This is the fallback for when the calendar
// isn't readable — a real due date, not an invented one, so the periods stay
// aligned with everybody else's even when Google is unreachable.
const ANCHOR_DUE = '2026-12-18'

// The period that due date closes — a Saturday, since the period is two of
// the Sunday-to-Saturday weeks overtime is counted in and the Friday due date
// sits inside the second of them.
async function anchorPeriodEnd(): Promise<string> {
  const calendarId = process.env.GCAL_GENERAL_CALENDAR_ID
  if (!calendarId) return periodEndFromDue(ANCHOR_DUE)
  const events = await listUpcomingEvents(calendarId)
  const due = (events ?? []).filter((e) => /hours.*due/i.test(e.summary)).map((e) => e.start).sort()
  return periodEndFromDue(due[0] ?? ANCHOR_DUE)
}

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; cal?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: instructor } = await admin
    .from('instructors')
    .select('id, name, hours_via_admin')
    .eq('profile_id', user.id)
    .maybeSingle()

  // Not a permission failure so much as a page about a situation this person
  // isn't in: their hours go into ADP under their own login.
  if (!instructor?.hours_via_admin) redirect('/instructor')

  const { period: asked, cal } = await searchParams
  const anchor = await anchorPeriodEnd()
  const period: Period = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? '')
    ? periodFor(asked!, anchor)
    : periodFor(new Date().toISOString().slice(0, 10), anchor)

  const [{ data: staffed }, { data: saved }, { data: approver }] = await Promise.all([
    admin.from('instance_instructors').select('instance_id').eq('instructor_id', instructor.id),
    admin
      .from('timesheets')
      .select('rows, sent_at')
      .eq('instructor_id', instructor.id)
      .eq('period_start', period.start)
      .maybeSingle(),
    admin.from('instructors').select('email').ilike('name', 'Micah%').maybeSingle(),
  ])

  const ids = (staffed ?? []).map((r) => r.instance_id)
  let courses: TimesheetCourse[] = []
  if (ids.length > 0) {
    // A course either side of the period can still put a travel day inside
    // it, so the window reaches a day past each boundary.
    const [{ data: instances }, { data: offDays }, { data: rates }] = await Promise.all([
      admin
        .from('course_instances')
        .select('id, course_type, course_category, custom_title, client_name, internal, location, status, starts_at, ends_at')
        .in('id', ids)
        .neq('status', 'cancelled')
        // A course either side of the period can still put a travel day
        // inside it, so the window reaches a day past each boundary.
        .lte('starts_at', dayShift(period.end, 1))
        .gte('ends_at', dayShift(period.start, -1)),
      admin.from('instance_off_days').select('instance_id, off_date, end_date').in('instance_id', ids),
      admin
        .from('course_pay_rates')
        .select('instance_id, starts_at, ends_at, hours_per_day')
        .in('instance_id', ids)
        .eq('instructor_id', instructor.id),
    ])
    const own = new Map((rates ?? []).map((r) => [r.instance_id, r]))
    courses = (instances ?? []).map((c) => ({
      ...c,
      off_days: (offDays ?? []).filter((o) => o.instance_id === c.id),
      own_starts_at: own.get(c.id)?.starts_at ?? null,
      own_ends_at: own.get(c.id)?.ends_at ?? null,
      hours_per_day: own.get(c.id)?.hours_per_day ?? null,
    }))
  }

  const generated = draftRows(period, courses)
  const rows = (saved?.rows as TimesheetRow[] | undefined)?.length ? (saved!.rows as TimesheetRow[]) : generated

  // Chips for the grid, in the portal calendar's own shape and colours.
  const calendarCourses = courses
    .filter((c) => c.starts_at)
    .map((c) => ({
      id: c.id,
      label: courseShortName(c.course_type, c.custom_title).trim(),
      starts_at: c.starts_at!,
      ends_at: c.ends_at ?? c.starts_at!,
      status: c.status,
      category: (c as { course_category?: string | null }).course_category ?? null,
      internal: (c as { internal?: boolean | null }).internal ?? undefined,
      client: (c as { client_name?: string | null }).client_name ?? null,
      location: c.location,
      href: `/portal/${c.id}`,
      state: stateOf(c.location),
    }))

  // The month the grid opens on: the one the period starts in, unless the
  // month arrows have said otherwise.
  const month = /^\d{4}-\d{2}$/.test(cal ?? '') ? cal! : period.start.slice(0, 7)

  // The days this course puts on the NEXT timesheet — a travel home the far
  // side of a due date reads as a missing day otherwise.
  const spill = draftRows(shiftPeriod(period, 1), courses).filter(
    (r) => r.date <= dayShift(period.end, 2)
  )

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/instructor" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Profile
        </Link>
        <h1 className="text-2xl font-bold mb-1">Hours</h1>
        <p className="text-zinc-400 mb-8 text-sm">{instructor.name}</p>

        <TimesheetEditor
          period={period}
          month={month}
          rows={rows}
          generated={generated}
          courses={calendarCourses}
          spill={spill}
          savedAt={saved?.sent_at ?? null}
          hasSaved={Boolean(saved?.rows)}
          senderName={instructor.name}
          approverEmail={approver?.email ?? null}
          onSave={saveTimesheet}
          onMarkSent={markTimesheetSent}
        />
      </div>
    </main>
  )
}
