'use client'

import { useState } from 'react'
import { assignInstructor } from './actions'
import type { StaffingConflicts } from '@/lib/courses'

type Instructor = { id: string; name: string }

export default function InstructorAssign({
  instanceId,
  qualified,
  unassigned,
  hasLead,
  anyone = false,
  conflicts = {},
}: {
  instanceId: string
  qualified: Instructor[]
  unassigned: Instructor[]
  hasLead: boolean
  // Internal events don't run by the staffing rules — who comes to a CE day or
  // a planning day is a choice, not a qualification — so the list opens on
  // everyone rather than on whoever the expertise map would have allowed.
  anyone?: boolean
  /** Courses each instructor is already on that run on this course's days.
      A warning, never a block: a two-hour overlap on a travel day is a call
      only the person staffing it can make, and refusing the assign would
      leave them no way to make it. */
  conflicts?: StaffingConflicts
}) {
  const [showAll, setShowAll] = useState(anyone)
  const [picked, setPicked] = useState('')

  const toShow = showAll ? unassigned : qualified
  const hasUnqualified = unassigned.length > qualified.length
  // An option can't be styled, so the clash goes in its text — the days only,
  // which is what decides it. Which course is underneath, where there's room.
  const label = (i: Instructor) => {
    const clashes = conflicts[i.id] ?? []
    return clashes.length ? `${i.name} — booked ${clashes.map((c) => c.days).join(', ')}` : i.name
  }
  // Assigning someone takes them out of the list under a picked select. Fall
  // back to nothing chosen rather than to an id with no option behind it.
  const value = unassigned.some(i => i.id === picked) ? picked : ''
  const pickedClashes = conflicts[value] ?? []

  if (unassigned.length === 0) return null

  return (
    <div>
      <form action={assignInstructor.bind(null, instanceId)} className="flex gap-2 flex-wrap">
        <select
          name="instructor_id"
          required
          value={value}
          onChange={e => setPicked(e.target.value)}
          className={`bg-zinc-800 border rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 ${pickedClashes.length ? 'border-amber-700' : 'border-zinc-700'}`}
        >
          <option value="" disabled>Select instructor…</option>
          {!showAll && qualified.length > 0 ? (
            <optgroup label="Qualified">
              {qualified.map(i => <option key={i.id} value={i.id}>{label(i)}</option>)}
            </optgroup>
          ) : (
            toShow.map(i => <option key={i.id} value={i.id}>{label(i)}</option>)
          )}
        </select>
        <select name="role" defaultValue={hasLead ? 'assist' : 'lead'} className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
          <option value="lead">Lead</option>
          <option value="assist">Assist</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Assign</button>
      </form>

      {pickedClashes.length > 0 && (
        <div className="mt-2 text-xs text-amber-400/90">
          {pickedClashes.map(c => <p key={c.course}>Already on {c.course} · {c.days}</p>)}
        </div>
      )}

      {hasUnqualified && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showAll
            ? '↑ Show qualified only'
            : `${qualified.length === 0 ? 'No qualified instructors — ' : ''}Show all instructors`}
        </button>
      )}
    </div>
  )
}
