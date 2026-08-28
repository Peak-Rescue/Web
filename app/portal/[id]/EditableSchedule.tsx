'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import CloseButton from '@/components/CloseButton'

// A read view with an editor behind it, swapped by a button that looks like a
// button.
//
// It wrapped the whole Schedule section to begin with, which put one control at
// the top of the section for editing any day in it — a long way from the day
// you were actually looking at, and a mode you entered rather than a thing you
// pressed. Now it wraps a single day, under that day.
//
// Read first, edit on purpose: every field behind it saves on blur, so a card
// that is permanently live is one where thumbing past it on a phone can move a
// start time.
export default function EditInPlace({
  label,
  editor,
  children,
}: {
  /** What pressing it does, said plainly — "Edit day". */
  label: string
  /** Built on the server, so its code only reaches the people who can open it
      and a student gets no button either. */
  editor: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  if (!editor) return <>{children}</>

  return (
    <>
      <div className="flex justify-end mb-2">
        {editing ? (
          <CloseButton
            label="Done editing"
            onClick={() => {
              // Closing re-reads the page. The fields save as you leave them,
              // but the day outline saves quietly while you type — so without
              // this, finishing an outline and closing would show the version
              // you started with.
              router.refresh()
              setEditing(false)
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            {label}
          </button>
        )}
      </div>
      {editing ? editor : children}
    </>
  )
}
