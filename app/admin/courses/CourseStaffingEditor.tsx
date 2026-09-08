import { createAdminClient } from '@/lib/supabase/admin'
import { removeInstructor } from './actions'
import { courseCapabilityCategories, courseSector } from '@/lib/capabilities'
import {
  courseShortName, formatDayList, overlappingDates,
  type OffDayRange, type StaffingConflicts,
} from '@/lib/courses'
import InstructorAssign from './InstructorAssign'
import GuestInstructorButton from './GuestInstructorButton'
import StaffingInterest from './StaffingInterest'

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

// Who is running this course: the crew, who else could be, and who has been
// asked.
//
// It loads its own data rather than being handed it. Working out who is
// qualified takes the course's capability categories, its sector, and every
// active instructor's skills and clearances — a page-sized amount of prep used
// for nothing else, and threading it through two screens as props would put
// the same twenty lines in both.
//
// A server component for the usual reason: the roster's Remove is a server
// action bound to a row.
export default async function CourseStaffingEditor({
  instanceId,
  courseType,
  courseCategory,
  customCategories,
  /** An internal course can be staffed by anyone — there is no client to be
      cleared for, and nobody outside the company on it. */
  internal,
  /** This course's window and its breaks, handed down rather than re-read:
      the page has both already, and working out who is double-booked needs
      them before the query that finds it can be built. */
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
}) {
  const admin = createAdminClient()

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

  const qualified = unassigned.filter((i) => hasSkill(i) && clearedForSector(i))
  const hasLead = (assigned ?? []).some((a) => a.role === 'lead')

  const instructorById = new Map((allInstructors ?? []).map((i) => [i.id, i]))
  const interestCandidates = unassigned.map((i) => ({
    id: i.id,
    name: i.name,
    hasEmail: Boolean(i.email),
    qualified: hasSkill(i) && clearedForSector(i),
    leadQualified: caps(i).some((c) => categories.includes(c.category) && c.role === 'lead') && clearedForSector(i),
  }))
  const interestInvites = (inviteRows ?? []).map((r) => ({
    id: r.id,
    instructorId: r.instructor_id,
    name: instructorById.get(r.instructor_id)?.name ?? 'Former instructor',
    sentAt: r.sent_at,
    respondedAt: r.responded_at,
    interested: r.interested,
    note: r.note,
    assigned: assignedIds.has(r.instructor_id),
  }))

  return (
    <div>
      {(assigned ?? []).length > 0 && (
        <div className="mb-4 space-y-2">
          {(assigned ?? []).map((a) => {
            const instr = a.instructors as unknown as { name: string } | null
            const removeWithArgs = removeInstructor.bind(null, instanceId, a.instructor_id)
            const clashes = conflicts[a.instructor_id] ?? []
            return (
              <div key={a.instructor_id} className={`px-4 py-2 bg-zinc-900 border rounded-lg ${clashes.length ? 'border-amber-800/70' : 'border-zinc-800'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{instr?.name ?? a.instructor_id}</span>
                    <span className={`ml-3 text-xs font-medium ${a.role === 'lead' ? 'text-teal-400' : 'text-blue-400'}`}>{a.role}</span>
                  </div>
                  <form action={removeWithArgs}>
                    <button type="submit" className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
                  </form>
                </div>
                {/* A clash can appear long after the assign — the other course
                    moved, or was created later — so it is shown on the crew
                    list too, not only where somebody is picked. */}
                {clashes.map((c) => (
                  <p key={c.course} className="mt-1.5 text-xs text-amber-400/90">Also on {c.course} · {c.days}</p>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <InstructorAssign
        instanceId={instanceId}
        qualified={qualified}
        unassigned={unassigned}
        hasLead={hasLead}
        anyone={internal}
        conflicts={conflicts}
      />

      <GuestInstructorButton instanceId={instanceId} hasLead={hasLead} />

      <StaffingInterest
        instanceId={instanceId}
        candidates={interestCandidates}
        invites={interestInvites}
        hasLead={hasLead}
        preselect={!internal}
        conflicts={conflicts}
      />
    </div>
  )
}
