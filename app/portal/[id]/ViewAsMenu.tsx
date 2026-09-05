'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Which role an admin is reading the page as.
//
// It was three links sitting in the bar, always. Three is the widest a
// two-state control ever needs to be, and the bar it sat in has a job of its
// own now — so it is one chip that opens a menu.
//
// The chip says what it does and what is true: off preview it reads "View as
// Admin", because a label naming only the state reads as a status and nobody
// taps a status, and a label naming only the action leaves you asking which
// role you are in. Previewing, it goes amber with a warning glyph and the
// role's name, and grows an ✕ straight back.
//
// It has to render *while* previewing, which is the part that was wrong
// before: the whole control lived behind a check for being un-previewed, so it
// vanished at exactly the moment it was needed. You discover you are in a
// preview when a control you expected is missing, and that is halfway down the
// page — the chip is what answers it there.

const ROLES = [
  { key: '', label: 'Admin', hint: 'Everything, unfiltered' },
  { key: 'instructor', label: 'Instructor', hint: 'What an assigned instructor sees (uses your real role on this course)' },
  { key: 'student', label: 'Student', hint: 'What an enrolled student sees' },
] as const

export default function ViewAsMenu({
  instanceId,
  viewAs,
  mode,
}: {
  instanceId: string
  /** '' when the admin is reading as themselves. */
  viewAs: string
  /** Carried through so switching preview doesn't also switch the job. */
  mode?: 'build' | 'teach'
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function away(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const href = (key: string) => {
    const q = new URLSearchParams()
    if (key) q.set('as', key)
    if (mode) q.set('mode', mode)
    const s = q.toString()
    return `/portal/${instanceId}${s ? `?${s}` : ''}`
  }

  const current = ROLES.find((r) => r.key === viewAs) ?? ROLES[0]
  const previewing = Boolean(viewAs)

  return (
    <div ref={box} className="relative shrink-0">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full text-[11px] transition-colors ${
          previewing
            ? 'border border-amber-700 bg-amber-500/15 text-amber-200 pl-2 pr-1'
            : 'border border-dashed border-zinc-700 text-zinc-400 px-2'
        }`}
      >
        {previewing ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
            <path d="M12 4.5 2.5 20h19zM12 10v4.5M12 17.4v.1" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
            <path d="M1.8 12S5.4 5.5 12 5.5 22.2 12 22.2 12 18.6 18.5 12 18.5 1.8 12 1.8 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          title={previewing ? `Previewing as ${current.label.toLowerCase()} — some controls are hidden` : 'Read this page as an instructor or a student'}
          className="py-1 whitespace-nowrap"
        >
          {/* The header row on a phone is 342px with a 140px wordmark and a
              hamburger already in it, which leaves about 160 for the two
              course controls — and Build/Teach wants a hundred of that. So
              here the eye carries the whole thing when there is nothing to
              report, and grows words only when there is: previewing is the
              state worth spending the room on, and it is also the state where
              Build/Teach steps aside, so the room is there. */}
          <span className="hidden sm:inline">{previewing ? '' : 'View as '}</span>
          <span className={previewing ? undefined : 'hidden sm:inline'}>{current.label} </span>
          ▾
        </button>
        {previewing && (
          <Link
            href={href('')}
            prefetch={false}
            title="Back to admin"
            aria-label="Back to admin"
            className="border-l border-amber-800/70 px-1.5 py-1 leading-none hover:text-white transition-colors"
          >
            ✕
          </Link>
        )}
      </span>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+5px)] z-30 min-w-40 rounded-lg border border-zinc-700 bg-zinc-950 p-1 shadow-xl"
        >
          <p className="px-2 pt-1.5 pb-1 text-[9.5px] uppercase tracking-widest text-zinc-500">See this page as</p>
          {ROLES.map((r) => (
            <Link
              key={r.label}
              role="menuitem"
              href={href(r.key)}
              // Three more full renders of the most expensive page we have,
              // kicked off by the page itself, if these prefetch. Switching
              // preview roles is rare enough to pay for its own navigation.
              prefetch={false}
              title={r.hint}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                r.key === viewAs ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <span className="w-3 shrink-0 text-pr-red-light">{r.key === viewAs ? '✓' : ''}</span>
              {r.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
