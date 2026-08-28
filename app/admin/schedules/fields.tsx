'use client'

import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'

// The marks and boxes a schedule day is written with. Shared, because a day is
// now edited in two places — laid out in order by the full editor, and on its
// own under the day you are reading on the course page — and two copies of a
// text box are two things to keep in step.

// A placeholder only says what a field is until you fill it in — after that,
// two grey lines under a day title are just two grey lines. These are the same
// marks the course page reads with, so the field you type into is the one the
// students see.
// An uncontrolled textarea sized to its content, on mount and on every
// keystroke, so nothing it holds is hidden behind a scrollbar.
export function Grows(props: ComponentProps<'textarea'>) {
  function fit(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  return (
    <textarea
      {...props}
      ref={fit}
      rows={1}
      onInput={(e) => { fit(e.currentTarget); props.onInput?.(e) }}
      className={`resize-none overflow-hidden ${props.className ?? ''}`}
    />
  )
}

export function Marked({ icon, top, children }: { icon: ReactNode; top?: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={`absolute left-2 text-zinc-600 ${top ? 'top-2.5' : 'top-1/2 -translate-y-1/2'}`}
      >
        {icon}
      </span>
      {children}
    </div>
  )
}

const glyph = {
  xmlns: 'http://www.w3.org/2000/svg', width: 12, height: 12, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

// A line with waypoints on it — a route, as opposed to the pin's single spot.
export function RouteIcon() {
  return (
    <svg {...glyph} aria-hidden>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h4a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h4" />
    </svg>
  )
}

export function PinIcon() {
  return (
    <svg {...glyph}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg {...glyph} width={10} height={10} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

// Where to stand, as opposed to the pin's where the day happens.
export function FlagIcon() {
  return (
    <svg {...glyph}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 3.5L16 11H5" />
    </svg>
  )
}

export function NoteIcon() {
  return (
    <svg {...glyph}>
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
      <path d="M14 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

export function TargetIcon() {
  return (
    <svg {...glyph}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  )
}
