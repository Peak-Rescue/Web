import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInstance } from './actions'
import { CourseTypeSelect } from './CourseTypeSelect'
import { courseShortName } from '@/lib/courses'

const STATUS_STYLES: Record<string, string> = {
  tentative: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  confirmed:  'bg-teal-900/40 text-teal-300 border-teal-700',
  completed:  'bg-zinc-700 text-zinc-300 border-zinc-600',
  cancelled:  'bg-red-900/40 text-red-300 border-red-700',
}

function formatDateRange(starts_at: string, ends_at: string) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return starts_at === ends_at ? fmt(starts_at) : `${fmt(starts_at)} – ${fmt(ends_at)}`
}

type Instance = {
  id: string
  ref_number: number
  slug: string | null
  course_type: string
  custom_title: string | null
  status: string
  location: string | null
  client_name: string | null
  starts_at: string | null
  ends_at: string | null
  max_students: number | null
  instance_instructors: { count: number }[]
  enrollments: { count: number }[]
}

function firstStartDate(inst: Instance): string | null {
  return inst.starts_at ?? null
}

function lastEndDate(inst: Instance): string | null {
  return inst.ends_at ?? null
}

function InstanceCard({ inst }: { inst: Instance }) {
  const instructorCount = inst.instance_instructors?.[0]?.count ?? 0
  const studentCount    = inst.enrollments?.[0]?.count ?? 0
  const displayName = courseShortName(inst.course_type, inst.custom_title)

  return (
    <Link
      href={`/admin/courses/${inst.id}`}
      className="flex items-start justify-between gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${STATUS_STYLES[inst.status] ?? ''}`}>
            {inst.status}
          </span>
          <span className="text-xs font-mono text-zinc-500">PR-{String(inst.ref_number).padStart(4, '0')}</span>
          <span className="font-medium truncate">{displayName}</span>
        </div>
        <div className="text-sm text-zinc-400 flex flex-wrap gap-x-4 gap-y-0.5">
          {inst.starts_at && inst.ends_at && <span>{formatDateRange(inst.starts_at, inst.ends_at)}</span>}
          {inst.location && <span>{inst.location}</span>}
          {inst.client_name && <span>{inst.client_name}</span>}
        </div>
      </div>
      <div className="text-xs text-zinc-500 whitespace-nowrap text-right shrink-0">
        {instructorCount > 0 && <div>{instructorCount} instructor{instructorCount !== 1 ? 's' : ''}</div>}
        {inst.max_students && <div>{studentCount}/{inst.max_students} students</div>}
      </div>
    </Link>
  )
}

export default async function CoursesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: raw } = await admin
    .from('course_instances')
    .select(`
      id, ref_number, slug, course_type, custom_title, status, location, client_name, starts_at, ends_at, max_students,
      instance_instructors(count),
      enrollments(count)
    `)

  const instances = (raw ?? []) as unknown as Instance[]

  const today = new Date().toISOString().slice(0, 10)

  // Upcoming: last end date is today or in the future (or no dates yet)
  // Past: last end date is before today
  const upcoming = instances
    .filter(i => {
      const end = lastEndDate(i)
      return !end || end >= today
    })
    .sort((a, b) => {
      const aDate = firstStartDate(a) ?? 'z'
      const bDate = firstStartDate(b) ?? 'z'
      return aDate.localeCompare(bDate)
    })

  const past = instances
    .filter(i => {
      const end = lastEndDate(i)
      return !!end && end < today
    })
    .sort((a, b) => {
      const aDate = firstStartDate(a) ?? ''
      const bDate = firstStartDate(b) ?? ''
      return bDate.localeCompare(aDate) // most recent first
    })

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="text-zinc-400 mt-1">Schedule and manage course instances</p>
        </div>

        {/* New instance form */}
        <details className="mb-10 group">
          <summary className="cursor-pointer list-none">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-pr-red hover:bg-pr-red-light text-white rounded font-medium text-sm transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Course Instance
            </div>
          </summary>

          <form action={createInstance} className="mt-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CourseTypeSelect />

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Status</label>
              <select name="status" defaultValue="tentative" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
                <option value="tentative">Tentative</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Location</label>
              <input name="location" placeholder="City, base, venue…" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start date</label>
              <input name="starts_at" type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">End date</label>
              <input name="ends_at" type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Client / organization</label>
              <input name="client_name" placeholder="e.g. 75th Ranger Regiment" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Point of contact</label>
              <input name="contact_name" placeholder="Full name" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Contact phone</label>
              <input name="contact_phone" type="tel" placeholder="+1 555 000 0000" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Contact email</label>
              <input name="contact_email" type="email" placeholder="poc@example.mil" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Max students</label>
              <input name="max_students" type="number" min="1" placeholder="e.g. 20" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Instructor slots</label>
              <input name="instructor_slots" type="number" min="1" placeholder="e.g. 3" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <textarea name="notes" rows={2} placeholder="Contract number, special requirements, logistics…" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-none" />
            </div>

            <div className="sm:col-span-2">
              <button type="submit" className="px-5 py-2 bg-pr-red hover:bg-pr-red-light text-white rounded font-medium text-sm transition-colors">
                Create &amp; edit content →
              </button>
            </div>
          </form>
        </details>

        {/* ── Upcoming ─────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
            Upcoming & Active
            <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">({upcoming.length})</span>
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-zinc-600 text-sm">No upcoming courses.</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map(inst => <InstanceCard key={inst.id} inst={inst} />)}
            </div>
          )}
        </section>

        {/* ── Past ─────────────────────────────────────────────────── */}
        {past.length > 0 && (
          <section>
            <details>
              <summary className="cursor-pointer list-none group/past">
                <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform [[open]_&]:rotate-90">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  Past
                  <span className="font-normal normal-case tracking-normal text-zinc-700">({past.length})</span>
                </h2>
              </summary>
              <div className="space-y-3 mt-3">
                {past.map(inst => <InstanceCard key={inst.id} inst={inst} />)}
              </div>
            </details>
          </section>
        )}
      </div>
    </main>
  )
}
