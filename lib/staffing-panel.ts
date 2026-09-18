import { type createAdminClient } from '@/lib/supabase/admin'
import { courseCapabilityCategories, courseSector } from '@/lib/capabilities'
import {
  courseShortName, formatDayList, overlappingDates,
  type OffDayRange, type StaffingConflicts,
} from '@/lib/courses'

// Everything the staffing panel needs to know, worked out in one place.
//
// Who is qualified for a course takes its capability categories, its sector,
// and every active instructor's skills and clearances — a page-sized amount of
// prep used for nothing else. It lives here rather than inside the panel that
// draws it because the panel is now drawn in two places: on the course itself,
// and in a drawer under the course's row on the list. One loader, one panel,
// two doors — the alternative was a second staffing tool built to the same
// description, which is how two screens start disagreeing about who is cleared
// for military work.

export type InterestCandidate = {
  id: string
  name: string
  hasEmail: boolean
  qualified: boolean
  leadQualified: boolean
}

export type InterestInviteRow = {
  id: string
  instructorId: string
  name: string
  sentAt: string | null
  respondedAt: string | null
  interested: boolean | null
  note: string | null
  assigned: boolean
}

/** The panel's whole world, and plain data all the way down — it crosses the
    wire to the browser both as part of a page and as an action's answer. */
export type StaffingPanelData = {
  instanceId: string
  internal: boolean
  assigned: { instructorId: string; name: string; role: string }[]
  qualified: { id: string; name: string }[]
  unassigned: { id: string; name: string }[]
  hasLead: boolean
  conflicts: StaffingConflicts
  candidates: InterestCandidate[]
  invites: InterestInviteRow[]
}

type NearbyCourse = {
  ref_number: number
  course_type: string
  custom_title: string | null
  client_name: string | null
  starts_at: string | null
  ends_at: string | null
  instance_off_days: OffDayRange[] | null
  instance_instructors: { instructor_id: string }[] | null
}

export async function loadStaffingPanel(
  admin: ReturnType<typeof createAdminClient>,
  {
    instanceId,
    courseType,
    courseCategory,
    customCategories,
    /** An internal course can be staffed by anyone — there is no client to be
        cleared for, and nobody outside the company on it. */
    internal,
    /** This course's window and its breaks: working out who is double-booked
        needs them before the query that finds it can be built. */
    startsAt,
    endsAt,
    offDays,
  }: {
    instanceId: string
    courseType: string | null
    courseCategory: string | null
    customCategories: string[] | null
    internal: boolean
    startsAt: string | null
    endsAt: string | null
    offDays: OffDayRange[]
  }
): Promise<StaffingPanelData> {
  // Every other course whose window touches this one's, with its own breaks
  // and its crew. Narrowed in the query to the courses that could possibly
  // clash; which of them actually do is decided day by day below, because two
  // windows overlapping is not the same as two courses running together.
  //
  // A course with no dates yet clashes with nothing, so it asks nothing.
  const windowEnd = endsAt ?? startsAt
  const nearbyCourses = startsAt
    ? admin.from('course_instances')
        .select('id, ref_number, course_type, custom_title, client_name, starts_at, ends_at, instance_off_days(off_date, end_date), instance_instructors!inner(instructor_id)')
        .neq('id', instanceId)
        .neq('status', 'cancelled')
        .lte('starts_at', windowEnd as string)
        .or(`ends_at.gte.${startsAt},and(ends_at.is.null,starts_at.gte.${startsAt})`)
    : Promise.resolve({ data: [] })

  const [{ data: assigned }, { data: allInstructors }, { data: inviteRows }, { data: nearby }] = await Promise.all([
    admin.from('instance_instructors')
      .select('instructor_id, role, instructors(name, profile_id)')
      .eq('instance_id', instanceId),
    admin.from('instructors')
      .select('id, name, email, instructor_role, sectors, instructor_capabilities(category, role)')
      .eq('active', true).order('name'),
    admin.from('course_interest_invites')
      .select('id, instructor_id, sent_at, responded_at, interested, note')
      .eq('instance_id', instanceId).order('created_at'),
    nearbyCourses,
  ])

  // Keyed by person, because that is what is double-booked. One instructor
  // can be clashing with two other courses at once, so it's a list.
  const conflicts: StaffingConflicts = {}
  for (const c of (nearby ?? []) as NearbyCourse[]) {
    const shared = overlappingDates(
      { starts_at: startsAt, ends_at: endsAt, offDays },
      { starts_at: c.starts_at, ends_at: c.ends_at, offDays: c.instance_off_days ?? [] },
    )
    if (shared.length === 0) continue
    const clash = {
      course: `${courseShortName(c.course_type, c.custom_title)}${c.client_name ? ` · ${c.client_name}` : ''} (PR-${String(c.ref_number).padStart(4, '0')})`,
      days: formatDayList(shared),
    }
    for (const { instructor_id } of c.instance_instructors ?? []) {
      (conflicts[instructor_id] ??= []).push(clash)
    }
  }

  const categories: string[] = courseCapabilityCategories(courseType ?? '', customCategories)
  const assignedIds = new Set((assigned ?? []).map((a) => a.instructor_id))
  const unassigned = (allInstructors ?? []).filter((i) => !assignedIds.has(i.id))

  // Staffing needs both: the skill, and clearance to work this client type.
  // Someone signed off in Swift Water can run a military water course only if
  // they're cleared for military work.
  const sector = courseSector(courseCategory)
  const clearedForSector = (i: { sectors?: string[] | null }) =>
    (i.sectors ?? []).length === 0 || (i.sectors ?? []).includes(sector)
  const caps = (i: { instructor_capabilities: unknown }) =>
    i.instructor_capabilities as { category: string; role: string }[]
  const hasSkill = (i: { instructor_capabilities: unknown }) =>
    caps(i).some((c) => categories.includes(c.category))

  const instructorById = new Map((allInstructors ?? []).map((i) => [i.id, i]))

  return {
    instanceId,
    internal,
    assigned: (assigned ?? []).map((a) => ({
      instructorId: a.instructor_id,
      name: (a.instructors as unknown as { name: string } | null)?.name ?? a.instructor_id,
      role: a.role,
    })),
    qualified: unassigned
      .filter((i) => hasSkill(i) && clearedForSector(i))
      .map((i) => ({ id: i.id, name: i.name })),
    unassigned: unassigned.map((i) => ({ id: i.id, name: i.name })),
    hasLead: (assigned ?? []).some((a) => a.role === 'lead'),
    conflicts,
    candidates: unassigned.map((i) => ({
      id: i.id,
      name: i.name,
      hasEmail: Boolean(i.email),
      qualified: hasSkill(i) && clearedForSector(i),
      leadQualified: caps(i).some((c) => categories.includes(c.category) && c.role === 'lead') && clearedForSector(i),
    })),
    invites: (inviteRows ?? []).map((r) => ({
      id: r.id,
      instructorId: r.instructor_id,
      name: instructorById.get(r.instructor_id)?.name ?? 'Former instructor',
      sentAt: r.sent_at,
      respondedAt: r.responded_at,
      interested: r.interested,
      note: r.note,
      assigned: assignedIds.has(r.instructor_id),
    })),
  }
}
