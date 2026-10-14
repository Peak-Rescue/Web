'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSession } from '@/lib/courses'
import { todayHere } from '@/lib/course-clock'
import { isForMeeting, rosterIdFor } from '@/lib/meetings'
import { syncCourseCalendar } from '@/lib/google-calendar'

const MAX_TOPIC = 200

async function signedInRoster() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const rosterId = await rosterIdFor(admin, user.id)
  // Answering and teaching are both things a person on the roster does. An
  // account with no roster row has nobody to answer as.
  if (!rosterId) throw new Error('Only people on the instructor roster can answer this')
  return { user, admin, rosterId }
}

// Whether this person may answer for, or teach at, this meeting: it is for
// them, or they are already on it. Asked of the row, never of the caller.
async function mayTakePart(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rosterId: string,
  instanceId: string
): Promise<boolean> {
  if (await isForMeeting(admin, userId, instanceId)) return true
  const { data: crew } = await admin
    .from('instance_instructors')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('instructor_id', rosterId)
    .maybeSingle()
  return Boolean(crew)
}

/** Going, can't make it, or (null) take the answer back. */
export async function setMeetingRsvp(instanceId: string, going: boolean | null): Promise<void> {
  const { user, admin, rosterId } = await signedInRoster()
  if (!(await mayTakePart(admin, user.id, rosterId, instanceId))) throw new Error('Not authorized')

  const { error } =
    going === null
      ? await admin.from('meeting_rsvps').delete().eq('instance_id', instanceId).eq('instructor_id', rosterId)
      : await admin
          .from('meeting_rsvps')
          .upsert(
            { instance_id: instanceId, instructor_id: rosterId, going, updated_at: new Date().toISOString() },
            { onConflict: 'instance_id,instructor_id' }
          )
  if (error) throw new Error(error.message)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath('/admin')
}

/** The sign-up sheet's one save: the weeks this person is teaching in a
 *  series, each with what they will teach.
 *
 *  Sent as the whole of their own column, and made to match — added where they
 *  ticked a week, topic changed where they edited one, taken off where they
 *  unticked. Nobody else's row is touched. Signing up is final, like writing a
 *  name in the old spreadsheet: the first person on a week is its primary,
 *  which is what turns that week's reminder email on.
 */
export async function saveMyTeaching(
  seriesId: string,
  entries: { instanceId: string; topic: string }[]
): Promise<void> {
  const { user, admin, rosterId } = await signedInRoster()
  const today = todayHere()

  const { data: weeks, error: weeksError } = await admin
    .from('course_instances')
    .select('id, status, internal, start_time, starts_at, ends_at')
    .eq('series_id', seriesId)
    .neq('status', 'cancelled')
    .gte('starts_at', today)
  if (weeksError) throw new Error(weeksError.message)
  const open = ((weeks ?? []) as { id: string; status: string; internal: boolean | null; start_time: string | null; starts_at: string | null; ends_at: string | null }[])
    .filter((w) => isSession(w))
  if (open.length === 0) return
  // One check stands for the series: every week of it is for the same people,
  // which "Apply to all upcoming weeks" keeps true.
  if (!(await mayTakePart(admin, user.id, rosterId, open[0].id))) throw new Error('Not authorized')

  const openIds = new Set(open.map((w) => w.id))
  const wanted = new Map(
    entries
      .filter((e) => openIds.has(e.instanceId))
      .map((e) => [e.instanceId, e.topic.trim().slice(0, MAX_TOPIC) || null])
  )

  const { data: crewRows, error: crewError } = await admin
    .from('instance_instructors')
    .select('id, instance_id, instructor_id, in_charge, topic')
    .in('instance_id', [...openIds])
  if (crewError) throw new Error(crewError.message)
  const crew = (crewRows ?? []) as { id: string; instance_id: string; instructor_id: string; in_charge: boolean | null; topic: string | null }[]
  const mine = new Map(crew.filter((c) => c.instructor_id === rosterId).map((c) => [c.instance_id, c]))

  const touched = new Set<string>()

  for (const [instanceId, topic] of wanted) {
    const existing = mine.get(instanceId)
    if (existing) {
      if (existing.topic !== topic) {
        const { error } = await admin.from('instance_instructors').update({ topic }).eq('id', existing.id)
        if (error) throw new Error(error.message)
        touched.add(instanceId)
      }
      continue
    }
    const hasPrimary = crew.some((c) => c.instance_id === instanceId && c.in_charge)
    // Lead is a wage band, and a meeting pays nobody — the timesheet and the
    // hours reminder both leave meetings out. It is the seat that reads as
    // "teaching" on the crew list.
    const { error } = await admin
      .from('instance_instructors')
      .insert({ instance_id: instanceId, instructor_id: rosterId, role: 'lead', topic, in_charge: !hasPrimary })
    if (error) throw new Error(error.message)
    touched.add(instanceId)
  }

  for (const [instanceId, row] of mine) {
    if (wanted.has(instanceId)) continue
    const { error } = await admin.from('instance_instructors').delete().eq('id', row.id)
    if (error) throw new Error(error.message)
    touched.add(instanceId)
    // A week whose primary steps back is handed to one of the others still on
    // it, so a week with teachers on it never reads as "no class yet". Which
    // one is arbitrary — the crew row keeps no time — and an admin can move it.
    if (row.in_charge) {
      const next = crew.find((c) => c.instance_id === instanceId && c.id !== row.id)
      if (next) await admin.from('instance_instructors').update({ in_charge: true }).eq('id', next.id)
    }
  }

  after(async () => {
    for (const id of touched) await syncCourseCalendar(admin, id)
  })
  for (const id of touched) revalidatePath(`/portal/${id}`)
  revalidatePath(`/portal/series/${seriesId}`)
  revalidatePath('/admin')
  revalidatePath('/admin/courses')
}
