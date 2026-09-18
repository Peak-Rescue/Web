'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeInstructor } from './actions'
import InstructorAssign from './InstructorAssign'
import GuestInstructorButton from './GuestInstructorButton'
import StaffingInterest from './StaffingInterest'
import type { StaffingPanelData } from '@/lib/staffing-panel'

// Who is running this course: the crew, who else could be, and who has been
// asked.
//
// A client component, and handed its data rather than reading it, so that the
// same panel can be drawn on the course page and in the drawer under a row on
// the courses list. The drawer gets its data from a server action; markup
// cannot make that trip — a client component returned from an action isn't in
// the calling page's manifest and arrives as nothing at all.

export default function StaffingPanel({ data }: { data: StaffingPanelData }) {
  const { instanceId, internal, assigned, qualified, unassigned, hasLead, conflicts, candidates, invites } = data

  return (
    <div>
      {assigned.length > 0 && (
        <div className="mb-4 space-y-2">
          {assigned.map((a) => (
            <CrewRow key={a.instructorId} instanceId={instanceId} member={a} clashes={conflicts[a.instructorId] ?? []} />
          ))}
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
        candidates={candidates}
        invites={invites}
        hasLead={hasLead}
        preselect={!internal}
        conflicts={conflicts}
      />
    </div>
  )
}

function CrewRow({
  instanceId,
  member,
  clashes,
}: {
  instanceId: string
  member: { instructorId: string; name: string; role: string }
  clashes: { course: string; days: string }[]
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <div className={`px-4 py-2 bg-zinc-900 border rounded-lg ${clashes.length ? 'border-amber-800/70' : 'border-zinc-800'}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-sm">{member.name}</span>
          <span className={`ml-3 text-xs font-medium ${member.role === 'lead' ? 'text-teal-400' : 'text-blue-400'}`}>{member.role}</span>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            // Refreshed here rather than left to the action's revalidation:
            // the same panel is drawn on two pages, and the one it is drawn
            // on is the one that has to redraw. Its siblings all do the same.
            start(async () => { await removeInstructor(instanceId, member.instructorId); router.refresh() })
          }
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {pending ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {/* A clash can appear long after the assign — the other course moved, or
          was created later — so it is shown on the crew list too, not only
          where somebody is picked. */}
      {clashes.map((c) => (
        <p key={c.course} className="mt-1.5 text-xs text-amber-400/90">Also on {c.course} · {c.days}</p>
      ))}
    </div>
  )
}
