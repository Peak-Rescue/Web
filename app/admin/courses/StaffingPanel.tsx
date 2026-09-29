'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeInstructor, setCourseRole, setInCharge } from './actions'
import InstructorAssign from './InstructorAssign'
import GuestInstructorButton from './GuestInstructorButton'
import StaffingInterest from './StaffingInterest'
import type { StaffingPanelData } from '@/lib/staffing-panel'
import { INSTANCE_ROLES, roleLabel, DIRECTOR_SHORT } from '@/lib/staffing-roles'

// Who is running this course: the crew, who else could be, and who has been
// asked.
//
// A client component, and handed its data rather than reading it, so that the
// same panel can be drawn on the course page and in the drawer under a row on
// the courses list. The drawer gets its data from a server action; markup
// cannot make that trip — a client component returned from an action isn't in
// the calling page's manifest and arrives as nothing at all.

export default function StaffingPanel({ data }: { data: StaffingPanelData }) {
  const { instanceId, internal, assigned, qualified, unassigned, hasDirector, conflicts, candidates, invites } = data

  return (
    <div>
      {assigned.length > 0 && (
        <div className="mb-4 space-y-2">
          {assigned.map((a) => (
            <CrewRow
              key={a.instructorId}
              instanceId={instanceId}
              member={a}
              clashes={conflicts[a.instructorId] ?? []}
              soleDirector={a.inCharge && assigned.filter((m) => m.inCharge).length === 1}
            />
          ))}
        </div>
      )}

      {/* A crew with nobody answering for it. Said here, beside the rows that
          fix it, as well as on the readiness chain — the chain is where you
          notice, this is where you are when you can do something about it. */}
      {assigned.length > 0 && !hasDirector && (
        <p className="mb-4 -mt-2 text-xs text-amber-400/90">
          Nobody is in charge of this course yet — mark whoever is running it.
        </p>
      )}

      <InstructorAssign
        instanceId={instanceId}
        qualified={qualified}
        unassigned={unassigned}
        hasCrew={assigned.length > 0}
        anyone={internal}
        conflicts={conflicts}
      />

      <GuestInstructorButton instanceId={instanceId} hasCrew={assigned.length > 0} />

      <StaffingInterest
        instanceId={instanceId}
        candidates={candidates}
        invites={invites}
        hasCrew={assigned.length > 0}
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
  soleDirector,
}: {
  instanceId: string
  member: { instructorId: string; name: string; role: string; inCharge: boolean }
  clashes: { course: string; days: string }[]
  /** The only person in charge, so unticking them leaves the course with
      nobody — worth a word before it happens rather than a warning after. */
  soleDirector: boolean
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <div className={`px-4 py-2 bg-zinc-900 border rounded-lg ${clashes.length ? 'border-amber-800/70' : 'border-zinc-800'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-sm truncate">{member.name}</span>
          {/* What they are paid. A select rather than a label, because this is
              the number their hours are worked out at and it is set by how they
              were staffed — a wage typed again in the actuals is a wage typed
              twice. */}
          <select
            value={member.role}
            disabled={pending}
            onChange={(e) =>
              start(async () => { await setCourseRole(instanceId, member.instructorId, e.target.value); router.refresh() })
            }
            title="What this course pays them by the hour"
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          >
            {INSTANCE_ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
          {/* Who is running it. Teal, the colour "lead" used to carry, because
              this is what that colour always meant to whoever was reading it. */}
          <label
            className={`shrink-0 flex items-center gap-1.5 text-xs cursor-pointer transition-colors ${
              member.inCharge ? 'text-teal-300' : 'text-zinc-600 hover:text-zinc-400'
            }`}
            title={
              member.inCharge
                ? soleDirector
                  ? 'Running this course — the only one. Unticking leaves nobody in charge of it.'
                  : 'Running this course in the field'
                : 'Mark them as running this course in the field — more than one person can be'
            }
          >
            <input
              type="checkbox"
              checked={member.inCharge}
              disabled={pending}
              onChange={(e) =>
                start(async () => { await setInCharge(instanceId, member.instructorId, e.target.checked); router.refresh() })
              }
              className="accent-teal-500 disabled:opacity-50"
            />
            {DIRECTOR_SHORT}
          </label>
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
