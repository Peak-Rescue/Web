import { createAdminClient } from '@/lib/supabase/admin'
import { buildScheduleIcs, type FeedCourse } from '@/lib/schedule-feed'

// The shared schedule feed. No session: the token in the URL is the whole
// gate, the same bargain as /quote and /waiver, and the reason the feed says
// so little. Rotating the token on the instructor page revokes it.
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Roughly six months back. A calendar app wants a little history — "was he
// away that week in March" is a real question — and no more than that.
const HISTORY_DAYS = 180

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params
  // The link is handed out ending in .ics so mail clients and calendar apps
  // recognise it on sight; the token is the rest.
  const token = raw.replace(/\.ics$/i, '')
  // A malformed token must 404 rather than reach the uuid column, which would
  // raise instead of returning nothing.
  if (!UUID.test(token)) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: instructor } = await admin
    .from('instructors')
    .select('id, name')
    .eq('schedule_token', token)
    .maybeSingle()
  if (!instructor) return new Response('Not found', { status: 404 })

  const { data: staffed } = await admin
    .from('instance_instructors')
    .select('instance_id')
    .eq('instructor_id', instructor.id)
  const ids = (staffed ?? []).map((r) => r.instance_id)

  let courses: FeedCourse[] = []
  if (ids.length > 0) {
    const cutoff = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
    const [{ data: instances }, { data: offDays }, { data: rates }] = await Promise.all([
      admin
        .from('course_instances')
        .select('id, course_type, custom_title, location, status, starts_at, ends_at')
        .in('id', ids)
        .neq('status', 'cancelled')
        .gte('starts_at', cutoff),
      admin.from('instance_off_days').select('instance_id, off_date, end_date').in('instance_id', ids),
      // Their own field days live on the pay row because that is what the
      // overtime arithmetic runs on — see migration 203. It is the only place
      // the portal records that this person worked a different week from the
      // course, so it is what the feed has to read.
      admin
        .from('course_pay_rates')
        .select('instance_id, starts_at, ends_at')
        .in('instance_id', ids)
        .eq('instructor_id', instructor.id),
    ])

    const ownDays = new Map((rates ?? []).map((r) => [r.instance_id, r]))
    courses = (instances ?? []).map((c) => ({
      ...c,
      off_days: (offDays ?? []).filter((o) => o.instance_id === c.id),
      own_starts_at: ownDays.get(c.id)?.starts_at ?? null,
      own_ends_at: ownDays.get(c.id)?.ends_at ?? null,
    }))
  }

  const ics = buildScheduleIcs(courses, {
    calendarName: `${instructor.name} — Peak Rescue`,
    now: new Date(),
  })

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="peak-rescue-schedule.ics"',
      // Never let a CDN hold a course that has since moved: the subscriber's
      // own calendar app already refreshes on its own slow schedule, and two
      // caches in series is how a week-old answer survives a fix.
      'Cache-Control': 'no-store',
    },
  })
}
