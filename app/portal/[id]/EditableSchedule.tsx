'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import CloseButton from '@/components/CloseButton'
import { usePendingSaves } from '@/components/PendingSaves'

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
  title,
  note,
  badge,
  editor,
  children,
}: {
  /** What pressing it does, said plainly — "Edit day". */
  label: string
  /** Names the block, and gives the button something to sit on. Without it the
      button is a right-aligned row of its own floating above the content,
      which is how "Edit maps" ended up hanging under the WHERE card attached
      to nothing.

      This is the same header a SubHead draws, deliberately: a block that had
      its own SubHead and an EditInPlace above it showed two headers, an orphan
      button over a title, with nothing saying they belonged together. One
      header, and the button lives on it. */
  title?: string
  /** The live fact beside the name — "0 of 20 places taken". */
  note?: string
  /** Who the block is for, in the pills used everywhere else. */
  badge?: React.ReactNode
  /** Built on the server, so its code only reaches the people who can open it
      and a student gets no button either. */
  editor: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const { value: saves, settle, Provider: SavesProvider } = usePendingSaves()
  const abandoned = useRef(false)

  // The way out waits for the way in to finish.
  //
  // The fields behind this button save on a debounce, so the second after the
  // last keystroke is a second where the screen says one thing and the
  // database says another. Closing used to unmount the editor in that second:
  // the timer fired into a form that no longer existed and the edit was gone,
  // with nothing said about it. The X is pressed *because* someone is done
  // typing, which puts it right on top of that second.
  //
  // So closing sends what is outstanding and waits for it. If it still won't
  // save — a failing action rather than a slow one — that is the one case
  // worth a question, because the only alternatives are losing the change or
  // trapping someone in an editor they are trying to leave.
  async function close() {
    // Pressed again while it waits: a save can hang for as long as its timeout
    // allows, and an X that stops answering is worse than one that asks. The
    // second press is the way out of a wait that has gone on too long.
    if (closing) {
      if (!window.confirm('This is still saving. Close anyway and risk losing the last change?')) return
      abandoned.current = true
      setClosing(false)
      router.refresh()
      setEditing(false)
      return
    }
    abandoned.current = false
    setClosing(true)
    const settled = await settle()
    // Left without us: the wait was abandoned above and the editor is already
    // closed, so this is a dialog nobody asked for.
    if (abandoned.current) return
    setClosing(false)
    if (!settled && !window.confirm('Some changes haven’t saved yet. Close anyway and lose them?')) return
    // Closing re-reads the page. The fields save as you leave them, but the
    // day outline saves quietly while you type — so without this, finishing an
    // outline and closing would show the version you started with.
    router.refresh()
    setEditing(false)
  }

  if (!editor) return <>{children}</>

  return (
    <>
      <div className={`flex items-baseline gap-2 mb-2 ${title ? '' : 'justify-end'}`}>
        {title && <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>}
        {note && <span className="text-xs text-zinc-500">{note}</span>}
        {badge}
        {title && <span className="ml-auto" />}
        {editing ? (
          <>
            {/* Said out loud, so a close that takes a moment reads as the
                editor finishing rather than as a button that missed. */}
            {closing && <span className="text-xs text-zinc-500">Saving…</span>}
            <CloseButton label={closing ? 'Close without waiting' : 'Done editing'} onClick={() => void close()} />
          </>
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
      {editing ? <SavesProvider value={saves}>{editor}</SavesProvider> : children}
    </>
  )
}
