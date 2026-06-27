'use client'

import { useState } from 'react'
import { assignInstructor } from './actions'

type Instructor = { id: string; name: string }

export default function InstructorAssign({
  instanceId,
  qualified,
  unassigned,
}: {
  instanceId: string
  qualified: Instructor[]
  unassigned: Instructor[]
}) {
  const [showAll, setShowAll] = useState(false)

  const toShow = showAll ? unassigned : qualified
  const hasUnqualified = unassigned.length > qualified.length

  if (unassigned.length === 0) return null

  return (
    <div>
      <form action={assignInstructor.bind(null, instanceId)} className="flex gap-2 flex-wrap">
        <select name="instructor_id" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
          {!showAll && qualified.length > 0 ? (
            <optgroup label="Qualified">
              {qualified.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </optgroup>
          ) : (
            toShow.map(i => <option key={i.id} value={i.id}>{i.name}</option>)
          )}
        </select>
        <select name="role" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
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
