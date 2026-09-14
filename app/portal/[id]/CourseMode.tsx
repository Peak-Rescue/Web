'use client'

import { createContext, useContext, useState } from 'react'

// Building a course and running one are different jobs with different halves
// of this page, and one strip of tabs cannot hold both — ordering them was an
// attempt at it and failed, because order is the weakest signal there is when
// the thing you want is off the side of a scrolling bar.
//
// So the bar shows one job at a time.
//
// Build is the sequence a course is actually assembled in: what the client
// asked for, what it costs, the gear that changes what it costs, who teaches
// it, what they teach, where, when, who comes, and what they sign. Teach is
// the short list you need with a phone in your hand: today's plan, telling
// people about it, and who has signed.
//
// The ones you touch mid-course but for next time — curriculum links, a
// resource you missed, a gear list to fix — sit in Build, because that is what
// editing them is.
//
// The switch was a pair of links to ?mode=, which meant every press threw the
// page away and fetched it again — the loading skeleton, a dozen queries, the
// lot — to change which four words are in the tab bar. Nothing behind the
// doors depends on the job: every panel is rendered and hidden either way. So
// the job is client state, and pressing the switch moves the tabs and nothing
// else.

export type Mode = 'build' | 'teach'

const ModeValue = createContext<Mode>('teach')
const ModeSet = createContext<(m: Mode) => void>(() => {})

export function useCourseMode() {
  return useContext(ModeValue)
}

export function CourseModeProvider({
  initial,
  children,
}: {
  /** What the course's own dates say you are probably here for, worked out on
      the server — or the job named in the link, if one was. */
  initial: Mode
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<Mode>(initial)

  function change(m: Mode) {
    setMode(m)
    // Keep the address honest without going back to the server for it: a link
    // copied out of the bar should open on the job you were looking at, and
    // replaceState is the one way to say so that does not re-render the route.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('mode', m)
      window.history.replaceState(null, '', url)
    } catch { /* no history in a sandboxed frame */ }
  }

  return (
    <ModeValue.Provider value={mode}>
      <ModeSet.Provider value={change}>{children}</ModeSet.Provider>
    </ModeValue.Provider>
  )
}

/** Something that is build work and only build work. */
export function BuildOnly({ children }: { children: React.ReactNode }) {
  return useCourseMode() === 'build' ? <>{children}</> : null
}

export default function CourseMode() {
  const mode = useCourseMode()
  const setMode = useContext(ModeSet)
  return (
    <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-medium">
      {(['build', 'teach'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`px-2 sm:px-2.5 py-1 rounded-full transition-colors ${
            mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {m === 'build' ? 'Build' : 'Teach'}
        </button>
      ))}
    </div>
  )
}
