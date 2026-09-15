'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import CloseButton from '@/components/CloseButton'
import { usePendingSaves } from '@/components/PendingSaves'

// The pencil, drawn once. Both shells offer the same way in, so it looks and
// reads the same whether it sits on a block's header or on a day's title line.
function EditButton({ label, short, onClick }: { label: string; short?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      {short ?? label}
    </button>
  )
}

// The swap itself — who is editing, and the careful way out of it — kept apart
// from where the button is drawn, because the day card draws its own (on its
// title line, inside the <summary>) and the two must behave identically.
function useEditSwap() {
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

  return { editing, setEditing, closing, saves, SavesProvider, close }
}

// A read view with an editor behind it, swapped by a button that looks like a
// button.
//
// It wrapped the whole Schedule section to begin with, which put one control at
// the top of the section for editing any day in it — a long way from the day
// you were actually looking at, and a mode you entered rather than a thing you
// pressed. Now it wraps one block, with its button on that block's own header.
// A schedule day is the same idea with its own shell, DayFold, because the
// header it belongs on is a <summary>.
//
// Read first, edit on purpose: every field behind it saves on blur, so a block
// that is permanently live is one where thumbing past it on a phone can move a
// start time.
export default function EditInPlace({
  label,
  title,
  note,
  badge,
  editor,
  empty,
  emptyLabel,
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
  /** What to say when the block holds nothing yet — and the way in, on the
      same panel. An empty block that renders as nothing at all is the one
      place a person needs telling: there is no content to explain itself, and
      the header button above sits at the top of a section they are still
      scrolling. Passed only when there is genuinely nothing, so the block
      itself decides what empty means. */
  empty?: string
  /** What starting from nothing is called, when "Edit" is the wrong verb for
      it. Falls back to the ordinary label. */
  emptyLabel?: string
  children: ReactNode
}) {
  const { editing, setEditing, closing, saves, SavesProvider, close } = useEditSwap()

  // No editor means no button — it does not mean no heading. This threw the
  // whole header away for anyone who couldn't edit, which is why a student's
  // page was a run of unlabelled cards: the crew, the maps and the reference
  // all arrived with nothing saying which was which. The heading is how you
  // know what you are looking at, and that is not an admin's question.
  if (!editor) {
    return (
      <>
        {(title || note || badge) && (
          <div className="flex items-baseline gap-2 mb-2">
            {title && <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>}
            {note && <span className="text-xs text-zinc-500">{note}</span>}
            {badge}
          </div>
        )}
        {empty ? <p className="text-xs text-zinc-600">{empty}</p> : children}
      </>
    )
  }


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
          <EditButton label={label} onClick={() => setEditing(true)} />
        )}
      </div>
      {editing ? (
        <SavesProvider value={saves}>{editor}</SavesProvider>
      ) : empty ? (
        // Dashed, like every other panel on this page that is waiting to be
        // filled, and the sentence and the way in are one thing rather than a
        // statement here and a button somewhere above it.
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs text-zinc-500 min-w-0">{empty}</p>
          <button
            onClick={() => setEditing(true)}
            className="ml-auto shrink-0 text-[11px] px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            {emptyLabel ?? label}
          </button>
        </div>
      ) : (
        children
      )}
    </>
  )
}

// One day of the schedule: a fold, a title line, and the editor behind it.
//
// It exists because of where the button goes. A day already has a header — the
// <summary> carrying "Day 2", the name, the date — and a second right-aligned
// row under it saying "Edit day" was a header for the header. The way in
// belongs on the line that names the thing it edits, and a <summary> is not
// something a block wrapper can be handed.
//
// The pieces arrive from the server already built, so a student is sent no
// editor and no button: `editor` is null for them and this is a plain fold.
export function DayFold({
  open,
  /** The title line's contents — everything but the button. */
  summary,
  /** Under the title, above the swap, and untouched by it: the day's morning.
      As a child it vanished the moment the curriculum editor opened, and where
      we meet is not what that button edits. */
  above,
  editor,
  children,
}: {
  open: boolean
  summary: ReactNode
  above?: ReactNode
  editor: ReactNode
  children: ReactNode
}) {
  const { editing, setEditing, closing, saves, SavesProvider, close } = useEditSwap()
  const ref = useRef<HTMLDetailsElement>(null)

  return (
    <details ref={ref} open={open} className="group/day bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      {/* Wrapping, and nothing in here fixed at its own width: a no-wrap row of
          shrink-0 parts ran the controls off the right edge of a phone, where
          `overflow-x: clip` took them away rather than letting anyone scroll to
          them. A long day name takes a second line and the button stays on the
          card. */}
      <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {summary}
        {editor && (
          /* Inside a <summary>, so this corner has to say it is not a fold:
             the browser toggles the day on any click in the title line unless
             the default is refused. One refusal for the whole group, rather
             than one per button. */
          <span className="ml-auto shrink-0 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
            {editing ? (
              <>
                {closing && <span className="text-xs text-zinc-500">Saving…</span>}
                <CloseButton label={closing ? 'Close without waiting' : 'Done editing'} onClick={() => void close()} />
              </>
            ) : (
              <EditButton
                label="Edit day"
                short="Edit"
                onClick={() => {
                  // A day already behind us is folded shut; opening its editor
                  // under a closed fold would be a button that does nothing.
                  if (ref.current) ref.current.open = true
                  setEditing(true)
                }}
              />
            )}
          </span>
        )}
      </summary>
      {above}
      {editing ? <SavesProvider value={saves}>{editor}</SavesProvider> : children}
    </details>
  )
}
