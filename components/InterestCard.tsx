'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CalendarCourse } from './CourseCalendar'
import { startInterest } from '@/app/admin/interest-actions'

// What an instructor sees on clicking a course they could work and are not on.
// The answer itself is given on the same page an emailed inquiry links to —
// roles, note and all — so there is one form and one record however it began.
export default function InterestCard({
  course,
  at,
  when,
  onClose,
}: {
  course: CalendarCourse
  at: { x: number; y: number }
  when: string
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const interest = course.interest!

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function go() {
    if (interest.token) return router.push(`/staffing/${interest.token}`)
    setBusy(true)
    setError(null)
    const r = await startInterest(course.id)
    if ('error' in r) {
      setError(r.error)
      setBusy(false)
      return
    }
    router.push(`/staffing/${r.token}`)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 text-left"
        style={{ left: at.x, top: Math.min(at.y, window.innerHeight - 240) }}
      >
        <p className="font-semibold text-white text-sm leading-snug">{course.name ?? course.label}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{when}{course.time && ` · ${course.time} MT`}</p>
        {course.client && <p className="text-xs text-zinc-300 mt-1">{course.client}</p>}
        {course.location && <p className="text-xs text-zinc-400">{course.location}</p>}
        <p className="text-xs text-zinc-500 mt-1.5">
          <span className="capitalize">{course.status}</span>
          {(course.crew?.length ?? 0) > 0 && ` · ${course.crew!.join(', ')}`}
        </p>
        {interest.needsCrew && interest.answer === null && (
          <p className="text-xs text-amber-300 mt-1">Still looking for instructors</p>
        )}

        <div className="mt-3 pt-3 border-t border-zinc-800">
          {interest.answer === true ? (
            <p className="text-xs text-teal-300">You said you’re interested.</p>
          ) : interest.answer === false ? (
            <p className="text-xs text-zinc-400">You said you can’t make it.</p>
          ) : null}
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className={`${interest.answer === null ? 'mt-0 px-3 py-1.5 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium' : 'mt-1.5 text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2'} transition-colors disabled:opacity-50`}
          >
            {busy ? 'Opening…' : interest.answer === null ? 'I’m interested →' : 'Change your answer'}
          </button>
          {interest.answer === null && (
            <p className="text-[11px] text-zinc-500 mt-2">Not a commitment — it tells us you’re available. Staffing is confirmed separately.</p>
          )}
          {error && <p className="text-xs text-amber-400 mt-2">{error}</p>}
        </div>
      </div>
    </>
  )
}
