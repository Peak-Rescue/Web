'use client'

import { useState } from 'react'
import { assignInstructor } from './actions'

type Instructor = { id: string; name: string }

export default function InstructorAssign({
  instanceId,
  qualified,
  unassigned,
  hasLead,
  anyone = false,
}: {
  instanceId: string
  qualified: Instructor[]
  unassigned: Instructor[]
  hasLead: boolean
  // Internal events don't run by the staffing rules — who comes to a CE day or
  // a planning day is a choice, not a qualification — so the list opens on
  // everyone rather than on whoever the expertise map would have allowed.
  anyone?: boolean
}) {
  const [showAll, setShowAll] = useState(anyone)

  const toShow = showAll ? unassigned : qualified
  const hasUnqualified = unassigned.length > qualified.length

  if (unassigned.length === 0) return null

  return (
    <div>
      <form action={assignInstructor.bind(null, instanceId)} className="flex gap-2 flex-wrap">
        <select name="instructor_id" required defaultValue="" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
          <option value="" disabled>Select instructor…</option>
          {!showAll && qualified.length > 0 ? (
            <optgroup label="Qualified">
              {qualified.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </optgroup>
          ) : (
            toShow.map(i => <option key={i.id} value={i.id}>{i.name}</option>)
          )}
        </select>
        <select name="role" defaultValue={hasLead ? 'assist' : 'lead'} className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
          <option value="lead">Lead</option>
          <option value="assist">Assist</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Assign</button>
      </form>

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
