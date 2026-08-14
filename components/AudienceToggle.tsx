'use client'

import { useState } from 'react'
import { type LibraryAudience } from '@/lib/library'

// The pill *is* the control.
//
// Who can see something was being set three ways — a dropdown beside maps,
// links and photos, a form field in the library, and nowhere at all on a
// curriculum section — while a pill said the answer somewhere else. Same
// question, four widgets. Here the thing that reports the state is the thing
// that changes it.
//
// Instructors is not a toggle. Everyone on the course team can see everything
// on their own course; an item nobody can see isn't a state worth being able
// to reach, it's an item to remove.

const STUDENTS_ON = 'bg-teal-900/50 text-teal-300 hover:bg-teal-900'
const STUDENTS_OFF = 'bg-zinc-800/60 text-zinc-600 line-through decoration-zinc-700 hover:text-zinc-400'
const INSTRUCTORS = 'bg-amber-950/60 text-amber-400'
const CONFIRM = 'bg-pr-red/20 text-pr-red-light ring-1 ring-pr-red/60'

export default function AudienceToggle({
  audience,
  onChange,
  disabled,
  noun = 'this',
  showInstructors = true,
}: {
  audience: LibraryAudience
  onChange: (next: LibraryAudience) => void
  disabled?: boolean
  /** What's being shared, for the confirm step: "Show students the evac map?" */
  noun?: string
  /**
   * Drop the instructors pill where the answer is already on screen — a row
   * inside a section whose header says it. Repeating it on every child is
   * noise, and the gesture people learn is the students pill anyway.
   */
  showInstructors?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const pill = 'text-[10px] leading-none px-1.5 py-1 rounded transition-colors disabled:opacity-40'
  const shared = audience === 'shared'

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {confirming ? (
        <>
          {/* Showing something to students is the direction with a
              consequence — instructor manuals, evac plans and client
              paperwork all live behind this. Hiding is reversible and
              obvious, so it happens on the first click. */}
          <button
            type="button"
            onClick={() => { setConfirming(false); onChange('shared') }}
            disabled={disabled}
            className={`${pill} ${CONFIRM}`}
          >
            Show students {noun}?
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[10px] leading-none px-1 py-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            aria-label="Cancel"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => (shared ? onChange('internal') : setConfirming(true))}
          disabled={disabled}
          title={shared ? 'Students can see this — click to hide it' : 'Hidden from students — click to show it'}
          aria-pressed={shared}
          className={`${pill} ${shared ? STUDENTS_ON : STUDENTS_OFF}`}
        >
          Students
        </button>
      )}
      {showInstructors && (
        <span className={`${pill} ${INSTRUCTORS}`} title="Everyone on the course team can see this">
          Instructors
        </span>
      )}
    </span>
  )
}

// The same pills as a first answer rather than a change to an existing one.
//
// The toggle above assumes a document that already has an audience, and puts
// the direction with a consequence behind a confirm. Adding is the other case:
// there is no state to flip yet, so both pills start off and picking one *is*
// the decision — which is why the dialog won't submit until one is picked. No
// default, because a default here is a guess about a document only the person
// pasting it has read, and the guess gets copied onto a library item that then
// caps every course using it.
//
// Students implies instructors, exactly as AudiencePills renders it: choosing
// Students lights both, choosing Instructors lights one.
export function AudienceChoice({
  audience,
  onChange,
  disabled,
}: {
  audience: LibraryAudience | null
  onChange: (next: LibraryAudience) => void
  disabled?: boolean
}) {
  const pill = 'text-[11px] leading-none px-2 py-1.5 rounded transition-colors disabled:opacity-40'
  const off = 'bg-zinc-800/60 text-zinc-600 hover:text-zinc-400'

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange('shared')}
        disabled={disabled}
        aria-pressed={audience === 'shared'}
        title="Students and the course team can see this"
        className={`${pill} ${audience === 'shared' ? STUDENTS_ON : off}`}
      >
        Students
      </button>
      <button
        type="button"
        onClick={() => onChange('internal')}
        disabled={disabled}
        aria-pressed={audience !== null}
        title="Only the course team can see this"
        className={`${pill} ${audience !== null ? INSTRUCTORS : off}`}
      >
        Instructors
      </button>
    </span>
  )
}
