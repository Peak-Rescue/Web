'use client'

import { createPortal } from 'react-dom'
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

// Whether the bar has room for the controls beside the tabs. It does at a
// desk, where four tabs use less than half of it; it does not on a phone,
// where four tabs and their dots are most of 324px and the two controls would
// squeeze them down to two-and-a-scroll — which is the crowding this whole
// exercise was about.
//
// Read as a store rather than in an effect, and answered "wide" on the server:
// the server has no viewport, so a guess either way would be a hydration
// mismatch if it guessed wrong, and this way the phone moves them once on
// first paint instead of re-rendering the page.
const NARROW = '(max-width: 767px)'
function subscribeToWidth(onChange: () => void) {
  const mq = window.matchMedia(NARROW)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export type NavSection = {
  id: string
  label: string
  /** Something in here is newer than this reader's last visit. */
  unread?: boolean
}

// One glyph per door, for the bar you reach with a thumb. Words alone at that
// size are a row of grey; a shape you recognise without reading is the whole
// point of putting it down there.
const DOOR_ICON: Record<string, string> = {
  details: 'M4 6h16M4 12h16M4 18h10',
  prep: 'M6 8h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z|M9 8V5a3 3 0 0 1 6 0v3|M9 13h6',
  schedule: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  updates: 'M3 11l18-8-8 18-2-8-8-2Z',
  pricing: 'M3 3h7l11 11-7 7L3 10V3ZM7.5 7.5h.01',
}

export default function CourseNav({
  sections,
  storageKey,
  controls,
  thumbReach,
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
  /** Whether this reader is running the course rather than building it. On a
      phone that job happens with one hand and the screen at arm's length, so
      the doors move to the bottom where a thumb reaches; at a desk, and while
      building, they stay a tab strip. */
  thumbReach?: boolean
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

  const narrow = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(NARROW).matches,
    () => false,
  )
  // On a phone they go up into the header's empty middle, which is stuck to
  // the top already — so they stay reachable without costing this bar a row.
  const slot = narrow && typeof document !== 'undefined'
    ? document.getElementById('page-header-slot')
    : null

  function pick(id: string) {
    try { localStorage.setItem(storageKey, id) } catch { /* private window */ }
    doorChanged()
  }

  const thumb = narrow && Boolean(thumbReach)

  return (
    <ActiveSection.Provider value={active}>
      {!thumb && (
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
                      ? 'border-pr-red text-white font-medium'
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
          {controls && !slot && <div className="shrink-0 flex items-center gap-2 pb-1">{controls}</div>}
        </div>
      </nav>
      )}
      {controls && slot && createPortal(controls, slot)}
      {/* Room for the bar to sit over, plus whatever the phone reserves at the
          bottom of its own screen. */}
      <div className={thumb ? 'pb-24' : undefined}>{children}</div>
      {thumb && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-800 bg-zinc-950/95 px-1 pt-1.5 backdrop-blur"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          {sections.map((s) => {
            const on = s.id === active
            return (
              <button
                key={s.id}
                onClick={() => pick(s.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-1 text-[10.5px] transition-colors ${
                  on ? 'text-white' : 'text-zinc-500'
                }`}
              >
                <span className="relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    className={on ? 'text-pr-red-light' : undefined}
                    aria-hidden
                  >
                    {(DOOR_ICON[s.id] ?? DOOR_ICON.details).split('|').map((d, i) => <path key={i} d={d} />)}
                  </svg>
                  {s.unread && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-pr-red-light ring-2 ring-zinc-950"
                    />
                  )}
                </span>
                {s.label}
              </button>
            )
          })}
        </nav>
      )}
    </ActiveSection.Provider>
  )
}

/** One door's worth of page. Hidden, never unmounted. */
export function NavPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const active = useContext(ActiveSection)
  return <div hidden={active !== id}>{children}</div>
}
