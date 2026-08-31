import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName } from '@/lib/courses'

// Where a student lands after accepting an invite or signing in.
//
// This was a "Coming soon" placeholder, which meant enrolling worked, the
// course page worked, and there was no route between them: students accepted
// an invite and hit a dead end. It lists their courses.

export const dynamic = 'force-dynamic'

function fmtRange(starts: string | null, ends: string | null): string {
  if (!starts) return 'Dates to be confirmed'
  const f = (d: string, withYear: boolean) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
    })
  if (!ends || ends === starts) return f(starts, true)
  // The year once, at the end, unless the course spans two of them.
  const sameYear = starts.slice(0, 4) === ends.slice(0, 4)
  return `${f(starts, !sameYear)} – ${f(ends, true)}`
}

function daysUntil(starts: string | null): string | null {
  if (!starts) return null
  const today = new Date().toISOString().slice(0, 10)
  if (starts <= today) return null
  const days = Math.round((Date.parse(starts) - Date.parse(today)) / 86_400_000)
  if (days === 1) return 'Tomorrow'
  if (days <= 30) return `In ${days} days`
  return null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, first_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin' || profile?.role === 'instructor') redirect('/admin')

  const { data: rows } = await admin
    .from('enrollments')
    .select('id, course_instances(id, course_type, custom_title, starts_at, ends_at, location, status)')
    .eq('user_id', user.id)

  type Inst = {
    id: string; course_type: string; custom_title: string | null
    starts_at: string | null; ends_at: string | null; location: string | null; status: string
  }

  const today = new Date().toISOString().slice(0, 10)
  const courses = (rows ?? [])
    .map((r) => r.course_instances as unknown as Inst)
    .filter(Boolean)
    .filter((c) => c.status !== 'cancelled')
    .sort((a, b) => (a.starts_at ?? '9999').localeCompare(b.starts_at ?? '9999'))

  // A course that finished is still worth reaching — the material, the photos
  // and anything the team posted stay on its page.
  const upcoming = courses.filter((c) => !c.ends_at || c.ends_at >= today)
  const past = courses.filter((c) => c.ends_at && c.ends_at < today).reverse()

  const greeting = profile?.first_name ? `Welcome, ${profile.first_name}` : 'Your courses'

  function CourseCard({ c, dim }: { c: Inst; dim?: boolean }) {
    const soon = daysUntil(c.starts_at)
    return (
      <Link
        href={`/portal/${c.id}`}
        // One card per course: left to prefetch, listing them server-renders
        // every course page behind it.
        prefetch={false}
        className={`block p-4 rounded-lg border transition-colors ${
          dim
            ? 'border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700'
            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
        }`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className={`font-semibold ${dim ? 'text-zinc-300' : 'text-white'}`}>
            {courseDisplayName(c.course_type, c.custom_title)}
          </h2>
          {soon && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-pr-red/55 bg-pr-red/15 text-pr-red-light">
              {soon}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-400 mt-1">
          {fmtRange(c.starts_at, c.ends_at)}
          {c.location && <span className="text-zinc-500"> · {c.location}</span>}
        </p>
      </Link>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-1">{greeting}</h1>
        <p className="text-sm text-zinc-500 mb-8">
          {courses.length > 0
            ? 'Open a course for the schedule, what to bring, and anything your instructors have posted.'
            : 'Nothing here yet.'}
        </p>

        {courses.length === 0 && (
          <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900">
            <p className="text-sm text-zinc-300 mb-1">You’re signed in, but not enrolled on a course yet.</p>
            <p className="text-sm text-zinc-500">
              Enrolling happens through an invite link from your instructor. If you followed one and still
              can’t see the course, email{' '}
              <a href="mailto:info@peak-rescue.com" className="text-zinc-300 underline decoration-zinc-600 hover:text-white">
                info@peak-rescue.com
              </a>{' '}
              and we’ll sort it out.
            </p>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="space-y-3">
            {upcoming.map((c) => <CourseCard key={c.id} c={c} />)}
          </div>
        )}

        {past.length > 0 && (
          <section className="mt-10 pt-8 border-t border-zinc-800">
            <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Your past courses</h2>
            <div className="space-y-2">
              {past.map((c) => <CourseCard key={c.id} c={c} dim />)}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
