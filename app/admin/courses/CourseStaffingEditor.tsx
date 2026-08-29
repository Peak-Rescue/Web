import { createAdminClient } from '@/lib/supabase/admin'
import { removeInstructor } from './actions'
import { courseCapabilityCategories, courseSector } from '@/lib/capabilities'
import InstructorAssign from './InstructorAssign'
import GuestInstructorButton from './GuestInstructorButton'
import StaffingInterest from './StaffingInterest'

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
}: {
  instanceId: string
  courseType: string | null
  courseCategory: string | null
  customCategories: string[] | null
  internal: boolean
}) {
  const admin = createAdminClient()
  const [{ data: assigned }, { data: allInstructors }, { data: inviteRows }] = await Promise.all([
    admin.from('instance_instructors')
      .select('instructor_id, role, instructors(name, profile_id)')
      .eq('instance_id', instanceId),
    admin.from('instructors')
      .select('id, name, email, instructor_role, sectors, instructor_capabilities(category, role)')
      .eq('active', true).order('name'),
    admin.from('course_interest_invites')
      .select('id, instructor_id, sent_at, responded_at, interested, note')
      .eq('instance_id', instanceId).order('created_at'),
  ])

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
            return (
              <div key={a.instructor_id} className="flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div>
                  <span className="font-medium text-sm">{instr?.name ?? a.instructor_id}</span>
                  <span className={`ml-3 text-xs font-medium ${a.role === 'lead' ? 'text-teal-400' : 'text-blue-400'}`}>{a.role}</span>
                </div>
                <form action={removeWithArgs}>
                  <button type="submit" className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
                </form>
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
      />

      <GuestInstructorButton instanceId={instanceId} hasLead={hasLead} />

      <StaffingInterest
        instanceId={instanceId}
        candidates={interestCandidates}
        invites={interestInvites}
        hasLead={hasLead}
        preselect={!internal}
      />
    </div>
  )
}
