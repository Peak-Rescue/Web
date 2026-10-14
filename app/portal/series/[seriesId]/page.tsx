import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName, isSession, sessionTimeLabel } from '@/lib/courses'
import { todayHere } from '@/lib/course-clock'
import { isForMeeting, rosterIdFor } from '@/lib/meetings'
import TeachingSheet, { type SheetWeek } from './TeachingSheet'

// The teaching sign-up sheet for a repeating meeting — what the spreadsheet
// was. A row per week, everyone who has signed up to teach it and what they
// are teaching, and the viewer's own column to fill in. Everyone the meeting
// is for can read the whole sheet; signing up makes you that week's teacher
// at once, the first of you its primary.
export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(seriesId)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()

  const [{ data: profile }, { data: rows }, rosterId] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin
      .from('course_instances')
      .select('id, course_type, custom_title, status, internal, start_time, starts_at, ends_at, location, instance_instructors(instructor_id, in_charge, topic, instructors(name))')
      .eq('series_id', seriesId)
      .neq('status', 'cancelled')
      .order('starts_at'),
    rosterIdFor(admin, user.id),
  ])

  type Row = {
    id: string; course_type: string; custom_title: string | null; status: string; internal: boolean | null
    start_time: string | null; starts_at: string | null; ends_at: string | null; location: string | null
    instance_instructors: { instructor_id: string; in_charge: boolean | null; topic: string | null; instructors: { name: string } | null }[]
  }
  const weeks = ((rows ?? []) as unknown as Row[]).filter((r) => isSession(r))
  if (weeks.length === 0) notFound()

  // Open to whoever the meeting is for; one week answers for the series,
  // since "Apply to all upcoming weeks" keeps every week for the same people.
  const today = todayHere()
  const isAdmin = profile?.role === 'admin'
  const sample = weeks.find((w) => w.starts_at! >= today) ?? weeks[weeks.length - 1]
  const onCrew = Boolean(rosterId) && weeks.some((w) => w.instance_instructors.some((c) => c.instructor_id === rosterId))
  if (!isAdmin && !onCrew && !(await isForMeeting(admin, user.id, sample.id))) redirect('/admin')

  const sheet: SheetWeek[] = weeks.map((w) => ({
    id: w.id,
    date: w.starts_at!,
    time: sessionTimeLabel(w),
    past: w.starts_at! < today,
    teachers: [...w.instance_instructors]
      .sort((a, b) => Number(Boolean(b.in_charge)) - Number(Boolean(a.in_charge)))
      .map((c) => ({
        name: c.instructors?.name ?? 'Former instructor',
        topic: c.topic,
        mine: c.instructor_id === rosterId,
      })),
  }))

  const title = courseShortName(weeks[0].course_type, weeks[0].custom_title)

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300">← Portal</Link>
        <h1 className="text-2xl font-bold mt-2">{title} — teaching sign-up</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {[sample.location, sessionTimeLabel(sample) && `${sessionTimeLabel(sample)} Mountain`].filter(Boolean).join(' · ')}
        </p>
        <TeachingSheet seriesId={seriesId} weeks={sheet} canSignUp={Boolean(rosterId)} />
      </div>
    </main>
  )
}
