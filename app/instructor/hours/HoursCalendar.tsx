'use client'

import { CATEGORY_STYLE, sectorOf } from '@/lib/calendar-colors'
import { dayShift } from '@/lib/courses'
import { TRAVEL_CODE, FIELD_CODE } from '@/lib/paycodes'
import { totalHours, type Period, type TimesheetRow } from '@/lib/timesheet'

export type CalendarCourse = {
  id: string
  label: string
  starts_at: string
  ends_at: string
  status: string
  category?: string | null
  internal?: boolean | null
  client?: string | null
}

// The pay period as a calendar, in the portal's own grid: Sunday-start weeks,
// the same course chips, the same colours. A fortnight read as a column of
// ISO dates is a fortnight nobody checks — read as weeks with the courses
// drawn across them, a wrong day is visible at a glance.
//
// L and T are the only two buttons because they are the only two codes anyone
// here uses. The rest of the handbook's ladder lives in the table below,
// which this paints into: a day is a row, and clicking is how the row gets
// written, changed or deleted.
export default function HoursCalendar({
  period,
  rows,
  courses,
  onSet,
}: {
  period: Period
  rows: TimesheetRow[]
  courses: CalendarCourse[]
  onSet: (date: string, code: string | null) => void
}) {
  // Whole weeks: back to the Sunday on or before the period opens, forward to
  // the Saturday on or after it closes. The period's own edges are marked in
  // the cells rather than by cropping the week, because a week cut in half is
  // exactly what makes a fortnight hard to read.
  const firstCell = dayShift(period.start, -new Date(period.start + 'T00:00:00Z').getUTCDay())
  const lastCell = dayShift(period.end, 6 - new Date(period.end + 'T00:00:00Z').getUTCDay())

  const weeks: string[][] = []
  for (let d = firstCell; d <= lastCell; d = dayShift(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => dayShift(d, i)))
  }

  const byDate = new Map(rows.map((r) => [r.date, r]))

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 text-[10px] text-zinc-500 uppercase tracking-wide">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-1.5 py-1">{d}</div>
        ))}
      </div>

      {weeks.map((week) => {
        // Each week totals on its own line. Overtime is reckoned by the week,
        // not the fortnight, so the number that matters is this one.
        const inPeriod = week.filter((d) => d >= period.start && d <= period.end)
        const weekRows = inPeriod.map((d) => byDate.get(d)).filter(Boolean) as TimesheetRow[]
        const hours = totalHours(weekRows)
        return (
          <div key={week[0]}>
            <div className="grid grid-cols-7 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
              {week.map((day) => {
                const outside = day < period.start || day > period.end
                const row = byDate.get(day)
                const active = courses.filter((c) => c.starts_at <= day && day <= c.ends_at)
                return (
                  <div
                    key={day}
                    className={`min-h-[4.5rem] p-1 flex flex-col gap-1 ${
                      outside ? 'bg-zinc-950/40' : 'bg-zinc-950'
                    }`}
                  >
                    <div className={`text-[10px] px-0.5 ${outside ? 'text-zinc-700' : 'text-zinc-500'}`}>
                      {Number(day.slice(8))}
                    </div>

                    {active.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        title={c.label}
                        className={`text-[9px] leading-tight px-1 py-0.5 rounded border truncate ${
                          CATEGORY_STYLE[sectorOf(c)].solid
                        }`}
                      >
                        {c.label}
                      </div>
                    ))}

                    {/* Outside the period a day belongs to another timesheet,
                        so it shows its courses and takes no marks. */}
                    {!outside && (
                      <div className="mt-auto flex gap-1">
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
                              className={`flex-1 rounded border text-[10px] font-medium py-0.5 transition-colors ${
                                isOn ? on : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300'
                              }`}
                            >
                              {letter}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* A day carrying one of the handbook's other codes can't
                        be shown as L or T without lying about it. */}
                    {!outside && row && row.code !== FIELD_CODE && row.code !== TRAVEL_CODE && (
                      <div className="text-[9px] text-amber-400/80 px-0.5">{row.code}</div>
                    )}
                    {!outside && row && row.hours !== 10 && (
                      <div className="text-[9px] text-zinc-500 px-0.5">{row.hours}h</div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end pt-1 pr-1">
              <span className={`text-[11px] ${hours > 40 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {weekRows.length} days · {hours} hrs{hours > 40 ? ' · over 40' : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
