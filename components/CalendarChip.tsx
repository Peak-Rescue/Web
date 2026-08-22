'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CalendarCourse } from './CourseCalendar'

// Calendar event bar with a styled hover tooltip replacing the native title
// popup (whose ~1s delay is browser-controlled). Rendered through a portal so
// the calendar grid's overflow clipping can't cut it off.

const SHOW_DELAY_MS = 150

function fmtRange(s: string, e: string): string {
  const d = (v: string) => new Date(v + 'T00:00:00')
  const md = { month: 'short', day: 'numeric' } as const
  const year = d(e).toLocaleDateString('en-US', { year: 'numeric' })
  if (s === e) return `${d(s).toLocaleDateString('en-US', md)}, ${year}`
  const sameMonth = s.slice(0, 7) === e.slice(0, 7)
  const end = sameMonth ? Number(e.slice(8)) : d(e).toLocaleDateString('en-US', md)
  return `${d(s).toLocaleDateString('en-US', md)} – ${end}, ${year}`
}

export default function CalendarChip({
  course,
  className,
  style,
}: {
  course: CalendarCourse
  className: string
  style?: React.CSSProperties
}) {
  // Anchored to the bar (above it, at the cursor's x), flipping below when
  // the bar sits too close to the viewport top for the panel to fit.
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX, 110), window.innerWidth - 110)
    const below = rect.top < 140
    const y = below ? rect.bottom : rect.top
    timer.current = setTimeout(() => setTip({ x, y, below }), SHOW_DELAY_MS)
  }
  const onLeave = () => {
    if (timer.current) clearTimeout(timer.current)
    setTip(null)
  }

  const chipProps = {
    style,
    className,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    // The tooltip replaces the native one — no title attribute.
  }

  const isMilitary = course.category === 'tactical'
  // Ours only when there's no client at all — a consultation has no students
  // but is still that client's job.
  const ours = !!course.internal && !course.client
  const tooltip =
    tip &&
    createPortal(
      <div
        className={`fixed z-50 pointer-events-none -translate-x-1/2 ${
          tip.below ? 'pt-1.5' : '-translate-y-full pb-1.5'
        }`}
        style={{ left: tip.x, top: tip.y }}
      >
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl px-3 py-2 text-xs w-max max-w-64 text-left">
          <p className="font-semibold text-white leading-snug">{course.name ?? course.label}</p>
          <p className="text-zinc-400 mt-0.5">{fmtRange(course.starts_at, course.ends_at)}</p>
          {course.client && <p className="text-zinc-300 mt-1">{course.client}</p>}
          {course.location && <p className="text-zinc-400">{course.location}</p>}
          {(course.crew?.length ?? 0) > 0 && (
            <p className="text-zinc-400 mt-1">Crew: {course.crew!.join(', ')}</p>
          )}
          <p className="flex items-center gap-1.5 text-zinc-500 mt-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                ours ? 'bg-zinc-500' : isMilitary ? 'bg-orange-700' : 'bg-cyan-700'
              }`}
            />
            {ours ? 'Internal' : isMilitary ? 'Military' : 'Civilian'}
            <span className="capitalize">· {course.status}</span>
          </p>
          {course.internal && (
            <p className="text-zinc-500 mt-0.5">No students</p>
          )}
        </div>
      </div>,
      document.body
    )

  return course.href ? (
    <Link key={course.id} href={course.href} {...chipProps}>
      {course.label}
      {tooltip}
    </Link>
  ) : (
    <span key={course.id} {...chipProps}>
      {course.label}
      {tooltip}
    </span>
  )
}
