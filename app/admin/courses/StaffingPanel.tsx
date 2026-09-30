'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeInstructor, setCourseRole, setPrimary } from './actions'
import InstructorAssign from './InstructorAssign'
import GuestInstructorButton from './GuestInstructorButton'
import StaffingInterest from './StaffingInterest'
import PrimaryStar from '@/components/PrimaryStar'
import type { StaffingPanelData } from '@/lib/staffing-panel'
import { INSTANCE_ROLES, roleLabel, PRIMARY_LABEL, ROLE_BADGE, ROLE_TEXT, asInstanceRole } from '@/lib/staffing-roles'

// Who is running this course: the crew, who else could be, and who has been
// asked.
//
// A client component, and handed its data rather than reading it, so that the
// same panel can be drawn on the course page and in the drawer under a row on
// the courses list. The drawer gets its data from a server action; markup
// cannot make that trip — a client component returned from an action isn't in
// the calling page's manifest and arrives as nothing at all.

export default function StaffingPanel({ data }: { data: StaffingPanelData }) {
  const { instanceId, internal, assigned, qualified, unassigned, hasPrimary, seats, conflicts, candidates, invites } = data

  const shortSeats = seats.filter((s) => s.open > 0)

  return (
    <div>
      {/* What the course is planned to run, against who is on it. The crew
          count alone said how many were missing; it could not say which kind,
          and "one short" is a different job to do depending on whether the
          missing person is a lead or a shadow. Only the seats still open — a
          plan that is met is a plan you do not need to read. */}
      {seats.length > 0 && (
        <p className="mb-3 text-xs flex items-center gap-2 flex-wrap">
          {shortSeats.length > 0 ? (
            <>
              <span className="text-amber-400/90">Still wanted</span>
              {shortSeats.map((s) => (
                <span key={s.role} className={ROLE_TEXT[s.role]}>
                  {s.open} {roleLabel(s.role).toLowerCase()}
                </span>
              ))}
            </>
          ) : (
            <span className="text-zinc-500">
              Crew plan met · {seats.map((s) => `${s.seats} ${roleLabel(s.role).toLowerCase()}`).join(' · ')}
            </span>
          )}
        </p>
      )}

      {assigned.length > 0 && (
        <div className="mb-4 space-y-2">
          {assigned.map((a) => (
            <CrewRow
              key={a.instructorId}
              instanceId={instanceId}
              member={a}
              clashes={conflicts[a.instructorId] ?? []}
              solePrimary={a.inCharge && assigned.filter((m) => m.inCharge).length === 1}
            />
          ))}
        </div>
      )}

      {/* A crew with nobody answering for it. Said here, beside the rows that
          fix it, as well as on the readiness chain — the chain is where you
          notice, this is where you are when you can do something about it. */}
      {assigned.length > 0 && !hasPrimary && (
        <p className="mb-4 -mt-2 text-xs text-amber-400/90">
          Nobody is primary yet — mark whoever is running it.
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
  solePrimary,
}: {
  instanceId: string
  member: { instructorId: string; name: string; role: string; inCharge: boolean }
  clashes: { course: string; days: string }[]
  /** The only primary, so unticking them leaves the course with nobody — worth
      a word before it happens rather than a warning after. */
  solePrimary: boolean
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    // The primary's row is lifted: a left edge in teal and a name in white.
    // Marking the person rather than adding a badge to their row is the whole
    // distinction — the bands label a row, this one picks it out of the list.
    // A clash still owns the border, because a double-booking outranks it.
    <div
      className={`px-4 py-2 bg-zinc-900 border rounded-lg ${
        clashes.length
          ? 'border-amber-800/70'
          : member.inCharge
            ? 'border-zinc-800 border-l-2 border-l-teal-400/80'
            : 'border-zinc-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-sm truncate ${member.inCharge ? 'font-semibold text-white' : 'font-medium text-zinc-300'}`}>
            {member.name}
          </span>
          {/* What they are paid. A select rather than a label, because this is
              the number their hours are worked out at and it is set by how they
              were staffed — a wage typed again in the actuals is a wage typed
              twice. */}
          {/* Tinted with its own band, so the row reads as a badge you can
              change rather than as a form field that happens to be there. The
              colour is the same one the roster card and the dashboard use for
              that band — there is one definition of it. */}
          <select
            value={member.role}
            disabled={pending}
            onChange={(e) =>
              start(async () => { await setCourseRole(instanceId, member.instructorId, e.target.value); router.refresh() })
            }
            title="What this course pays them by the hour"
            className={`bg-zinc-800 border rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide focus:outline-none focus:border-zinc-500 disabled:opacity-50 ${ROLE_BADGE[asInstanceRole(member.role)]}`}
          >
            {INSTANCE_ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
          {/* Who is running it. A star you press, not a tick box beside a
              select: the two controls sat in a row looking like two fields of
              one form, and they are not the same kind of answer. A filled star
              is a statement, an outlined one is an offer — and more than one
              person can hold it, which no tick box in a list of people implies.
              The word stays beside it on the primary's own row, since that is
              the row somebody is scanning for. */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => { await setPrimary(instanceId, member.instructorId, !member.inCharge); router.refresh() })
            }
            aria-pressed={member.inCharge}
            title={
              member.inCharge
                ? solePrimary
                  ? 'The only primary — unstarring leaves nobody running this course'
                  : 'Primary — running this course in the field'
                : 'Make them primary. More than one person can be.'
            }
            className={`shrink-0 flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50 ${
              member.inCharge ? 'text-teal-300 hover:text-teal-200' : 'text-zinc-700 hover:text-teal-400/70'
            }`}
          >
            <PrimaryStar filled={member.inCharge} className="shrink-0" />
            {member.inCharge && (
              <span className="font-bold uppercase tracking-wider text-[10px]">{PRIMARY_LABEL}</span>
            )}
          </button>
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
