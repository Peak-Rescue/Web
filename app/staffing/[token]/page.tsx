import { notFound } from 'next/navigation'
import { crewPlanOf, openSeats, bestOpenSeatFor, roleLabel } from '@/lib/staffing-roles'
import { courseCapabilityCategories } from '@/lib/capabilities'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { courseDisplayName, courseShortName } from '@/lib/courses'
import ResponseForm from './ResponseForm'
import { courseZone, todayIn } from '@/lib/course-clock'
import { slotsToStaff } from '@/lib/course-readiness'

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
  // Signed in or not is only ever a question about the frame, never about the
  // answer: the token is the whole gate, because the point of this page is
  // that it opens from an email on a phone with no session. But when there is
  // a session it was reached from the portal, and a page that gives you no way
  // back is a page you leave by pressing back.
  const supabase = await createClient()
  const [{ data: invite }, { data: { user } }] = await Promise.all([
    admin
      .from('course_interest_invites')
      // Their capabilities ride along: what this page may offer them is capped
      // by what they are signed off to do, not by what the course has open.
      .select('id, instance_id, instructor_id, interested, note, instructors(name, instructor_capabilities(category, role))')
      .eq('token', token)
      .maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!invite) notFound()

  // The crew comes along because a course can fill up between the email going
  // out and the link being opened, and somebody weighing a week of their life
  // should not have to guess which of those two moments they are in.
  const [{ data: inst }, { data: crew }] = await Promise.all([
    admin
      .from('course_instances')
      .select('course_type, custom_title, client_name, location, region, starts_at, ends_at, status, instructor_slots, lead_slots, assist_slots, shadow_slots, course_category, custom_categories')
      .eq('id', invite.instance_id)
      .single(),
    admin
      .from('instance_instructors')
      .select('role, in_charge, instructor_id')
      .eq('instance_id', invite.instance_id),
  ])
  if (!inst) notFound()

  const instructor = invite.instructors as unknown as
    { name: string; instructor_capabilities: { category: string; role: string }[] | null } | null

  // What is open, worked out now. Deliberately absent from the invite email:
  // an emailed count is a photograph of a moment that has passed by the time
  // somebody opens it, and a letter saying a lead seat is free when it went
  // last week is worse than a letter that never mentioned seats.
  const plan = crewPlanOf(inst)
  const seats = openSeats(plan, crew ?? [])

  // Whether a lead seat is one they could actually take. A lead can work as an
  // assist or shadow — nobody is too qualified to help — but the reverse is not
  // true, so an assist is shown their own ceiling rather than the course's.
  const courseCategories: string[] = courseCapabilityCategories(
    (inst.course_type ?? '') as string,
    inst.custom_categories as string[] | null
  )
  const qualifiedToLead = (instructor?.instructor_capabilities ?? []).some(
    (c) => courseCategories.includes(c.category) && c.role === 'lead'
  )
  const offered = bestOpenSeatFor(seats, qualifiedToLead)
  const courseName = courseDisplayName(inst.course_type, inst.custom_title)
  const fmtLong = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const dates = inst.starts_at
    ? `${fmtLong(inst.starts_at)}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${fmtLong(inst.ends_at)}` : ''}`
    : 'Dates to be confirmed'
  const cancelled = inst.status === 'cancelled'
  const over = Boolean(inst.ends_at && inst.ends_at < todayIn(courseZone(inst.region)))
  // Same test the courses list uses for a green staffing mark: every slot has
  // a name, and one of them is leading.
  // Never to somebody who is on the crew themselves: they are the staffing,
  // and telling them to volunteer as a backup for their own course is nonsense.
  // Never on a course that is off or done either — those say so themselves,
  // and how full the crew was is not the news.
  const assigned = crew ?? []
  const staffed =
    !cancelled && !over &&
    !assigned.some((c) => c.instructor_id === invite.instructor_id) &&
    assigned.length >= slotsToStaff(inst.instructor_slots) &&
    assigned.some((c) => c.in_charge)

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {user && (
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
            ← Portal
          </Link>
        )}
        <div className="w-16 h-[3px] bg-pr-red mb-8" />
        {/* A full course changes what this page is, so it changes what the page
            calls itself. The eyebrow is the first line under the rule and the
            question is the second, and on a staffed course both of them were
            saying the wrong thing while the truth sat in grey below the fold.
            Filled, not outlined, and not the red label's colour: the one thing
            here that is a block of colour is the thing you cannot miss, and it
            reads at a glance on a phone held at arm's length.

            "Now", because the crew usually filled after the email went out,
            and without it the badge reads as a standing fact — which makes the
            invite they are holding look like a mistake. It does not name the
            course: the course's name is the next line down. */}
        {staffed ? (
          <p className="inline-block bg-amber-400 text-zinc-950 font-bold tracking-[0.15em] text-xs uppercase px-3 py-1.5 rounded mb-3">
            Now fully staffed
          </p>
        ) : (
          <p className="text-pr-red font-semibold tracking-[0.2em] text-sm uppercase mb-2">Staffing Interest</p>
        )}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{courseName}</h1>
        {instructor && (
          <p className="text-zinc-400 mb-8">
            Hi {instructor.name.split(' ')[0]} —{' '}
            {staffed
              ? 'the crew is full. Plans do shift, so let us know if you want to be a backup.'
              : offered
                ? `are you interested in working this course as ${roleLabel(offered).toLowerCase()}?`
                : 'are you interested in working this course?'}
          </p>
        )}
        {/* Which seat is actually theirs. Said plainly, because "3 open" above a
            person who can only fill one of them is a number that answers
            somebody else's question — and somebody who says yes to a lead week
            they were never going to be given has been misled by arithmetic.

            Only when the plan and their sign-offs disagree about the best seat:
            if the best open seat is already the best seat they could hold, the
            line above has said it and this would be the same fact twice. */}
        {!staffed && !cancelled && !over && offered && offered !== 'lead' && (seats.find((s) => s.role === 'lead')?.open ?? 0) > 0 && (
          <p className="-mt-6 mb-8 text-xs text-zinc-500">
            The lead seat needs a lead sign-off in this discipline, so we&apos;re asking you
            about the {roleLabel(offered).toLowerCase()} seat.
          </p>
        )}

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

          {/* The crew, seat by seat, counted against who is on it right now.
              This is the page's reason for existing rather than the email's: it
              is read at the moment it is true. A seat they could not be given is
              still shown — what the week looks like is part of deciding — but it
              is not offered, and the line below says which one is theirs. */}
          {seats.length > 0 && !cancelled && !over && (
            <div className="pt-2 border-t border-zinc-800 mt-2 space-y-1">
              {seats.map((s) => (
                <div key={s.role} className="flex items-baseline justify-between gap-4 text-xs">
                  <span className="text-zinc-400">{roleLabel(s.role)}</span>
                  <span className={s.open > 0 ? 'text-zinc-300 tabular-nums' : 'text-zinc-600 tabular-nums'}>
                    {s.open > 0 ? `${s.open} of ${s.seats} open` : `${s.seats} filled`}
                  </span>
                </div>
              ))}
            </div>
          )}
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
            {/* No "you responded: X" banner. The buttons below carry which
                one you picked, and your answer written out above them as well
                was the same fact in two shapes — the note repeated the field
                it was already sitting in, and the line about changing your
                response described a button that is right there. */}
            <ResponseForm token={token} currentInterested={invite.interested} currentNote={invite.note} staffed={staffed} />
            {/* Not on a staffed course: the greeting has already said plans
                shift and the button already says backup, so this is the third
                telling of it on the page that can least afford one. */}
            {!staffed && (
              <p className="mt-6 text-xs text-zinc-500">
                Expressing interest isn&apos;t a commitment — the ops team confirms final staffing separately.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
