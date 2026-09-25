'use client'

import CourseCalendar, { type CalendarCourse } from '@/components/CourseCalendar'
import { TRAVEL_CODE, FIELD_CODE } from '@/lib/paycodes'
import { type Period, type TimesheetRow } from '@/lib/timesheet'

export type { CalendarCourse }

// The portal's calendar, with a mark on every day of the pay period.
//
// Not a calendar of its own: the same component the portal home draws, handed
// a node per day. Anything else would be a second drawing of the same month
// that could drift out of step with the first — different chip colours, a
// different idea of which week a Sunday starts.
//
// L and T are the only two buttons because they are the only two codes anyone
// here uses. Days outside the period show their courses and take no marks —
// they belong to the timesheet either side of this one.
export default function HoursCalendar({
  month,
  period,
  rows,
  courses,
  basePath,
  onSet,
}: {
  month: string
  period: Period
  rows: TimesheetRow[]
  courses: CalendarCourse[]
  basePath: string
  onSet: (date: string, code: string | null) => void
}) {
  const byDate = new Map(rows.map((r) => [r.date, r]))

  const marks: Record<string, React.ReactNode> = {}
  for (let d = period.start; d <= period.end; ) {
    const day = d
    const row = byDate.get(day)
    marks[day] = (
      <div className="flex gap-1">
        {[
          { code: FIELD_CODE, letter: 'L', on: 'bg-pr-red text-white border-pr-red' },
          { code: TRAVEL_CODE, letter: 'T', on: 'bg-zinc-600 text-white border-zinc-500' },
        ].map(({ code, letter, on }) => {
          const isOn = row?.code === code
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSet(day, isOn ? null : code)}
              aria-pressed={isOn}
              aria-label={`${letter} on ${day}`}
              className={`flex-1 rounded border text-[10px] font-medium leading-none py-1 transition-colors ${
                isOn ? on : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {letter}
            </button>
          )
        })}
        {/* A day carrying one of the handbook's other codes cannot be shown as
            L or T without lying about it, so it says which it is. */}
        {row && row.code !== FIELD_CODE && row.code !== TRAVEL_CODE && (
          <span className="text-[9px] text-amber-400/80 self-center">{row.code}</span>
        )}
      </div>
    )
    const next = new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)
    d = next
  }

  return (
    <CourseCalendar
      month={month}
      courses={courses}
      basePath={basePath}
      params={{ period: period.end }}
      marks={marks}
    />
  )
}
