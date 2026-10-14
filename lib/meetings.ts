// Internal meetings — the weekly staff class and anything like it.
//
// A meeting is stored as a course (internal, one day, with a start time; see
// isSession), so most of the portal handles it without knowing. What it does
// need to know lives here: who a meeting is for, who is coming, and who is
// teaching what.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSession } from '@/lib/courses'

const MEETING_COLS = 'id, status, internal, start_time, starts_at, ends_at, all_staff, series_id'

type MeetingRow = {
  id: string
  status: string
  internal: boolean | null
  start_time: string | null
  starts_at: string | null
  ends_at: string | null
  all_staff: boolean | null
  series_id: string | null
}

/** The viewer's own roster row, if they have one. Answering and teaching are
    both done as a person on the roster, so this is who "you" is here. */
export async function rosterIdFor(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('instructors')
    .select('id')
    .eq('profile_id', userId)
    .eq('active', true)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Whether a meeting is for this person, short of being on its crew: it is
 *  open to all staff and they are staff, or they are on its invite list.
 *
 *  This is what opens the meeting's page to them. Staff decided everyone a
 *  meeting is for should read what an admin reads there — who is teaching,
 *  the notes, the files, who is coming — so being for it is the whole test.
 *  It never opens anything that is not a meeting: a course with a client is
 *  answered no whatever its flags say. */
export async function isForMeeting(
  admin: SupabaseClient,
  userId: string,
  instanceId: string
): Promise<boolean> {
  const [{ data: course }, { data: profile }, rosterId] = await Promise.all([
    admin.from('course_instances').select(MEETING_COLS).eq('id', instanceId).maybeSingle(),
    admin.from('profiles').select('role').eq('id', userId).single(),
    rosterIdFor(admin, userId),
  ])
  const m = course as MeetingRow | null
  if (!m || m.status === 'cancelled' || !isSession(m)) return false
  if (m.all_staff) return ['admin', 'instructor'].includes(profile?.role ?? '')
  if (!rosterId) return false
  const { data: invite } = await admin
    .from('meeting_invites')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('instructor_id', rosterId)
    .maybeSingle()
  return Boolean(invite)
}

/** Everyone a meeting is for, as roster rows: all active instructors when it
 *  is open to all staff, otherwise its invite list — and its crew either way,
 *  since whoever is teaching is certainly coming. */
export async function meetingAudience(
  admin: SupabaseClient,
  meeting: { id: string; all_staff: boolean | null }
): Promise<{ id: string; name: string; email: string | null }[]> {
  type Person = { id: string; name: string; email: string | null }
  const [{ data: base }, { data: crew }] = await Promise.all([
    meeting.all_staff
      ? admin.from('instructors').select('id, name, email').eq('active', true)
      : admin.from('meeting_invites').select('instructors(id, name, email, active)').eq('instance_id', meeting.id),
    admin.from('instance_instructors').select('instructors(id, name, email, active)').eq('instance_id', meeting.id),
  ])
  const people = new Map<string, Person>()
  const add = (p: (Person & { active?: boolean | null }) | null | undefined) => {
    if (p && p.active !== false) people.set(p.id, { id: p.id, name: p.name, email: p.email })
  }
  if (meeting.all_staff) for (const p of (base ?? []) as Person[]) add(p)
  else for (const r of (base ?? []) as unknown as { instructors: Person & { active: boolean | null } }[]) add(r.instructors)
  for (const r of (crew ?? []) as unknown as { instructors: Person & { active: boolean | null } }[]) add(r.instructors)
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export type MeetingAttendance = {
  going: string[]
  notGoing: string[]
  /** How many of the people it is for have not said. */
  unanswered: number
  /** The viewer's own answer: true, false, or null for not yet. */
  mine: boolean | null
}

/** Who is coming, as names, and what the viewer said. */
export async function loadAttendance(
  admin: SupabaseClient,
  meeting: { id: string; all_staff: boolean | null },
  viewerRosterId: string | null
): Promise<MeetingAttendance> {
  const [audience, { data: rows }] = await Promise.all([
    meetingAudience(admin, meeting),
    admin.from('meeting_rsvps').select('instructor_id, going, instructors(name)').eq('instance_id', meeting.id),
  ])
  const answers = (rows ?? []) as unknown as { instructor_id: string; going: boolean; instructors: { name: string } | null }[]
  const answered = new Set(answers.map((a) => a.instructor_id))
  const names = (going: boolean) =>
    answers
      .filter((a) => a.going === going)
      .map((a) => a.instructors?.name ?? 'Former instructor')
      .sort((a, b) => a.localeCompare(b))
  return {
    going: names(true),
    notGoing: names(false),
    unanswered: audience.filter((p) => !answered.has(p.id)).length,
    mine: answers.find((a) => a.instructor_id === viewerRosterId)?.going ?? null,
  }
}
