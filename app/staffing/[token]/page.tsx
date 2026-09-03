import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName, courseShortName } from '@/lib/courses'
import ResponseForm from './ResponseForm'
import { courseZone, todayIn } from '@/lib/course-clock'

// Public, tokenized staffing-interest page — instructors land here from the
// invite email to say whether they want to work the course.

export const metadata = { robots: { index: false, follow: false } }

const STATUS_STYLES: Record<string, string> = {
  tentative: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  quoted: 'bg-blue-900/40 text-blue-300 border-blue-700',
  confirmed: 'bg-teal-900/40 text-teal-300 border-teal-700',
  completed: 'bg-zinc-700 text-zinc-300 border-zinc-600',
  cancelled: 'bg-red-900/40 text-red-300 border-red-700',
}

export default async function StaffingInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound()

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('course_interest_invites')
    .select('id, instance_id, interested, note, responded_at, instructors(name)')
    .eq('token', token)
    .maybeSingle()
  if (!invite) notFound()

  const { data: inst } = await admin
    .from('course_instances')
    .select('course_type, custom_title, client_name, location, region, starts_at, ends_at, status')
    .eq('id', invite.instance_id)
    .single()
  if (!inst) notFound()

  const instructor = invite.instructors as unknown as { name: string } | null
  const courseName = courseDisplayName(inst.course_type, inst.custom_title)
  const fmtLong = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const dates = inst.starts_at
    ? `${fmtLong(inst.starts_at)}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${fmtLong(inst.ends_at)}` : ''}`
    : 'Dates to be confirmed'
  const cancelled = inst.status === 'cancelled'
  const over = Boolean(inst.ends_at && inst.ends_at < todayIn(courseZone(inst.region)))

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="w-16 h-[3px] bg-pr-red mb-8" />
        <p className="text-pr-red font-semibold tracking-[0.2em] text-sm uppercase mb-2">Staffing Interest</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{courseName}</h1>
        {instructor && <p className="text-zinc-400 mb-8">Hi {instructor.name.split(' ')[0]} — are you interested in working this course?</p>}

        <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl mb-8 space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${STATUS_STYLES[inst.status] ?? ''}`}>
              {inst.status}
            </span>
            <span className="font-medium">{courseShortName(inst.course_type, inst.custom_title)}</span>
            {inst.client_name && <span className="text-zinc-400">· {inst.client_name}</span>}
          </div>
          <p className="text-zinc-300">{dates}</p>
          {inst.location && <p className="text-zinc-400">{inst.location}</p>}
          {!cancelled && inst.status !== 'confirmed' && (
            <p className="text-xs text-yellow-300/80 pt-1">
              This course isn&apos;t confirmed yet — dates and details may still shift.
            </p>
          )}
        </div>

        {cancelled ? (
          <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200 text-sm">
            This course has been cancelled — no response needed.
          </div>
        ) : over ? (
          <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-400 text-sm">
            This course has already ended.
          </div>
        ) : (
          <>
            {invite.responded_at && (
              <div
                className={`mb-6 p-4 rounded-lg border text-sm ${
                  invite.interested
                    ? 'bg-teal-900/30 border-teal-800 text-teal-200'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                }`}
              >
                You responded: <span className="font-semibold">{invite.interested ? 'Interested' : "Can't make it"}</span>
                {invite.note && <span className="block mt-1 text-zinc-400">&ldquo;{invite.note}&rdquo;</span>}
                <span className="block mt-1 text-xs opacity-70">You can change your response below anytime.</span>
              </div>
            )}
            <ResponseForm token={token} currentInterested={invite.interested} currentNote={invite.note} />
            <p className="mt-6 text-xs text-zinc-500">
              Expressing interest isn&apos;t a commitment — the ops team confirms final staffing separately.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
