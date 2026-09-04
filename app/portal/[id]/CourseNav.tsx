'use client'

import { createContext, useContext, useSyncExternalStore } from 'react'

// The course page's four doors.
//
// They used to be jump links: every section rendered, the bar scrolled you to
// one. That works while a course is a page you read top to bottom, and stops
// working the moment the page is longer than the thing you came for — which it
// always is. The curriculum alone is twenty-six cards, the schedule is five
// days of blocks, the gear list nineteen rows. Scrolling past two of those to
// reach the third is not navigation.
//
// So a section is somewhere you land, not somewhere you scroll to. Which also
// means the bar can say something a jump bar never could: a door with a dot on
// it holds something you have not seen.
//
// Panels stay mounted and are hidden rather than unmounted. Half the blocks in
// here save on a debounce, and unmounting one mid-edit drops the last change
// with nothing said about it — the same reason the course editor's tabs have
// always worked this way.

const ActiveSection = createContext<string>('')

// The remembered door, as an external store. Small enough to keep here: one
// value per course, written by the bar and read by nothing else.
const doorListeners = new Set<() => void>()
function subscribeToDoor(onChange: () => void) {
  doorListeners.add(onChange)
  return () => { doorListeners.delete(onChange) }
}
function doorChanged() { for (const l of doorListeners) l() }
function readDoor(key: string) {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

export type NavSection = {
  id: string
  label: string
  /** Amber rather than red: internal, not for students. */
  team?: boolean
  /** Something in here is newer than this reader's last visit. */
  unread?: boolean
}

export default function CourseNav({
  sections,
  storageKey,
  controls,
  children,
}: {
  sections: NavSection[]
  /** Per course, so returning to one puts you back where you were. */
  storageKey: string
  /** Build/Teach and the preview control. They sit at the far right of the
      same row: the tabs are what the bar is for, and they start at the left
      edge where the title and every card below it start. Four doors leave the
      room for this that nine never did. */
  controls?: React.ReactNode
  children: React.ReactNode
}) {
  // Come back to the door you were last on — you usually return to a course
  // for the same reason you left it.
  //
  // Which door that was lives in localStorage, and localStorage does not exist
  // on the server: read it while state is initialised and the server renders
  // the first door while the client renders a different one, which is a
  // hydration mismatch — React throws the server's HTML away and re-renders
  // the page. Read it in an effect instead and it is a setState that cascades
  // a second render on every visit. So it is read as what it actually is: an
  // external store, with a server snapshot that says "no preference".
  const stored = useSyncExternalStore(subscribeToDoor, () => readDoor(storageKey), () => '')

  // The list changes with the job — Pricing is Build's, Updates is Teach's —
  // so a remembered door can stop existing between one visit and the next.
  const active = sections.some((s) => s.id === stored) ? stored : sections[0]?.id ?? ''

  function pick(id: string) {
    try { localStorage.setItem(storageKey, id) } catch { /* private window */ }
    doorChanged()
  }

  return (
    <ActiveSection.Provider value={active}>
      <nav className="sticky top-16 md:top-20 z-20 -mx-4 px-4 pb-2.5 mb-8 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar border-b border-zinc-900">
            {sections.map((s) => {
              const on = s.id === active
              return (
                <button
                  key={s.id}
                  onClick={() => pick(s.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`shrink-0 -mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
                    on
                      ? s.team
                        ? 'border-amber-500 text-amber-100 font-medium'
                        : 'border-pr-red text-white font-medium'
                      : s.team
                        ? 'border-transparent text-amber-600/90 hover:text-amber-300'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {s.label}
                  {/* The whole notification. It says something moved and which
                      door it is behind; opening the door is how you find out
                      what. A line naming the change would be a second copy of
                      it, stale the moment anything else moves. */}
                  {s.unread && (
                    <span aria-hidden className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-pr-red-light align-middle" />
                  )}
                </button>
              )
            })}
          </div>
          {controls && <div className="shrink-0 flex items-center gap-2 pb-1">{controls}</div>}
        </div>
      </nav>
      {children}
    </ActiveSection.Provider>
  )
}

/** One door's worth of page. Hidden, never unmounted. */
export function NavPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const active = useContext(ActiveSection)
  return <div hidden={active !== id}>{children}</div>
}
