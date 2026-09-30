// Asking the database who is double-booked on one course.
//
// Kept apart from `lib/staffing-conflicts.ts`, which has the rule and no
// database in it — that separation is what makes the rule testable without a
// server, and it is worth one extra file.
//
// The query is the same shape the staffing panel's has always used: only courses
// whose window could possibly touch this one's, because which of them actually
// clash is decided day by day afterwards. Two windows overlapping is not two
// courses running together — one of them may have that week off.

import { type createAdminClient } from '@/lib/supabase/admin'
import { type OffDayRange, type StaffingConflicts } from '@/lib/courses'
import { clashesFor, clashSentence, clashNames, asClashCourse } from '@/lib/staffing-conflicts'

type Admin = ReturnType<typeof createAdminClient>

const NEARBY_COLS =
  'id, ref_number, course_type, custom_title, client_name, status, starts_at, ends_at, instance_off_days(off_date, end_date), instance_instructors!inner(instructor_id)'

export type CrewClashes = {
  /** Keyed by instructor id; empty when the crew's week is their own. */
  conflicts: StaffingConflicts
  /** Whose name goes with an id, for anything that wants to say who. */
  names: Record<string, string>
  /** The whole thing in one sentence, or null when there is nothing to say. */
  sentence: string | null
  /** The people, for somewhere with room for names but not a sentence. */
  who: string[]
}

export const NO_CLASHES: CrewClashes = { conflicts: {}, names: {}, sentence: null, who: [] }

/** Every double-booking the crew of one course currently has.
 *
 *  Read after any write that moves the course's days — including the off-day
 *  clamp, since a clash is about days the course actually holds rather than days
 *  somebody typed. */
export async function loadCrewClashes(admin: Admin, instanceId: string): Promise<CrewClashes> {
  const [{ data: inst }, { data: crew }] = await Promise.all([
    admin
      .from('course_instances')
      .select('id, ref_number, course_type, custom_title, client_name, status, starts_at, ends_at, instance_off_days(off_date, end_date)')
      .eq('id', instanceId)
      .maybeSingle(),
    admin
      .from('instance_instructors')
      .select('instructor_id, instructors(name)')
      .eq('instance_id', instanceId),
  ])
  if (!inst || !inst.starts_at || !crew || crew.length === 0) return NO_CLASHES

  const names: Record<string, string> = Object.fromEntries(
    crew.map((c) => [
      c.instructor_id as string,
      (c.instructors as unknown as { name: string | null } | null)?.name ?? 'Somebody',
    ])
  )

  const windowEnd = (inst.ends_at as string | null) ?? (inst.starts_at as string)
  const { data: nearby } = await admin
    .from('course_instances')
    .select(NEARBY_COLS)
    .neq('id', instanceId)
    .neq('status', 'cancelled')
    .lte('starts_at', windowEnd)
    .or(`ends_at.gte.${inst.starts_at},and(ends_at.is.null,starts_at.gte.${inst.starts_at})`)

  const course = asClashCourse({
    ...(inst as unknown as Parameters<typeof asClashCourse>[0]),
    instance_off_days: (inst.instance_off_days ?? []) as OffDayRange[],
    instance_instructors: crew.map((c) => ({ instructor_id: c.instructor_id as string })),
  })

  const conflicts = clashesFor(
    course,
    ((nearby ?? []) as unknown as Parameters<typeof asClashCourse>[0][]).map(asClashCourse)
  )

  return {
    conflicts,
    names,
    sentence: clashSentence(conflicts, (id) => names[id]),
    who: clashNames(conflicts, (id) => names[id]),
  }
}
