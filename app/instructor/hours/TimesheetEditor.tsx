'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import InfoHint from '@/components/InfoHint'
import { PAY_CODES, TRAVEL_CODE, FIELD_CODE } from '@/lib/paycodes'
import { dayShift } from '@/lib/courses'
import HoursCalendar, { type CalendarCourse } from './HoursCalendar'
import {
  DEFAULT_HOURS,
  rowsAsText,
  rowsAsTsv,
  shiftPeriod,
  totalHours,
  type Period,
  type TimesheetRow,
} from '@/lib/timesheet'

const short = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}/${y.slice(2)}`
}

const sameRows = (a: TimesheetRow[], b: TimesheetRow[]) => JSON.stringify(a) === JSON.stringify(b)

export default function TimesheetEditor({
  period,
  month,
  rows: initial,
  generated,
  courses,
  spill,
  savedAt,
  hasSaved,
  senderName,
  senderEmail,
  approverEmail,
  onSave,
  onMarkSent,
}: {
  period: Period
  month: string
  rows: TimesheetRow[]
  generated: TimesheetRow[]
  courses: (CalendarCourse & { state: string })[]
  spill: TimesheetRow[]
  savedAt: string | null
  hasSaved: boolean
  senderName: string
  senderEmail: string | null
  approverEmail: string | null
  onSave: (periodStart: string, periodEnd: string, rows: TimesheetRow[]) => Promise<void>
  onMarkSent: (periodStart: string) => Promise<void>
}) {
  const [rows, setRows] = useState<TimesheetRow[]>(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Where a new week starts in the list, and what the week before it came to.
  // Sunday, because that is the week the overtime rule counts in.
  const weekBreaks = useMemo(() => {
    const out = new Map<number, { start: string; hours: number }>()
    let weekStart: string | null = null
    rows.forEach((r, i) => {
      const sunday = dayShift(r.date, -new Date(r.date + 'T00:00:00Z').getUTCDay())
      if (sunday === weekStart) return
      weekStart = sunday
      out.set(i, {
        start: sunday,
        hours: totalHours(rows.filter((x) => dayShift(x.date, -new Date(x.date + 'T00:00:00Z').getUTCDay()) === sunday)),
      })
    })
    return out
  }, [rows])

  const dirty = !sameRows(rows, initial)
  const prev = shiftPeriod(period, -1)
  const next = shiftPeriod(period, 1)

  function run(action: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  // What a newly painted day inherits. A travel day usually sits beside its
  // course rather than on it, so a blank day looks to the course that starts
  // tomorrow or ended yesterday before giving up.
  const metaFor = (date: string) => {
    const on =
      courses.find((c) => c.starts_at <= date && date <= c.ends_at) ??
      courses.find((c) => c.starts_at === dayShift(date, 1)) ??
      courses.find((c) => c.ends_at === dayShift(date, -1))
    if (on) return { state: on.state, note: on.label }
    // No course to inherit from — a day of admin, a day added by hand. Carry
    // the nearest row above it instead, which is nearly always the same trip,
    // rather than leaving a blank state to be retyped.
    const above = [...rows].filter((r) => r.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    return { state: above?.state ?? '', note: above?.note ?? '' }
  }

  // The calendar paints into the same list the table edits — one day, one
  // row, and clicking the mark a day already has takes the day off.
  const setDay = (date: string, code: string | null) => {
    if (code === null) return setRows(rows.filter((r) => r.date !== date))
    const held = rows.find((r) => r.date === date)
    if (held) return setRows(rows.map((r) => (r.date === date ? { ...r, code } : r)))
    setRows(
      [...rows, { date, hours: DEFAULT_HOURS, code, ...metaFor(date) }].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    )
  }

  const edit = (i: number, patch: Partial<TimesheetRow>) =>
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))

  // Typing a state carries it to the rest of that course's days.
  //
  // The state is read off the course location, and a location like
  // "San Diego" names no state to read — inferring California from a city is
  // a guess, and a guessed state on a payroll line is worse than a blank one.
  // So it gets typed once rather than six times: every other day of the same
  // course that was blank, or wrong in the same way, follows.
  const editState = (i: number, next: string) => {
    const row = rows[i]
    setRows(
      rows.map((r, n) =>
        n === i || (r.note === row.note && (r.state === '' || r.state === row.state))
          ? { ...r, state: next }
          : r
      )
    )
  }

  // The first day of the period that hasn't got a row yet. It used to reuse
  // the last row's date, which put a second row on a day that already had one
  // — invisible on the calendar, since a day can only be painted once, and a
  // duplicate in the list. A day you add is a day you can see.
  const firstFreeDay = () => {
    const taken = new Set(rows.map((r) => r.date))
    for (let d = period.start; d <= period.end; d = dayShift(d, 1)) if (!taken.has(d)) return d
    return null
  }

  // Copying a row is how a run of days that the courses don't know about gets
  // entered — a week of admin, a course that was never written down.
  const duplicate = (r: TimesheetRow) => {
    const date = firstFreeDay()
    if (!date) return
    setRows([...rows, { ...r, date }].sort((a, b) => a.date.localeCompare(b.date)))
  }

  const addRow = () => {
    const date = firstFreeDay()
    if (!date) return
    setDay(date, FIELD_CODE)
  }

  // Gmail's compose window, not a mailto:. A mailto hands the draft to
  // whatever the operating system thinks the mail app is, which here is one
  // nobody uses — the message went nowhere anybody would ever see it.
  //
  // authuser names the work address rather than trusting whichever account
  // the browser happens to have first: Chrome is usually signed into a
  // personal Gmail, and payroll leaving from a personal address is the same
  // failure as payroll leaving from the portal. Gmail resolves it by email,
  // so it lands in the right account without knowing its index.
  const composeUrl = useMemo(() => {
    const subject = `Hours — ${senderName} — ${short(period.start)} to ${short(period.end)}`
    const body = rowsAsText(rows)
    const q = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: approverEmail ?? '',
      su: subject,
      body,
    })
    if (senderEmail) q.set('authuser', senderEmail)
    return `https://mail.google.com/mail/?${q}`
  }, [rows, period, senderName, senderEmail, approverEmail])

  async function copy() {
    await navigator.clipboard.writeText(rowsAsTsv(rows))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* The pay period, and the two beside it. Stepping is a link rather than
          a control because the page is the period — reload it and you are
          still looking at the fortnight you chose. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href={`/instructor/hours?period=${prev.end}`}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs transition-colors"
          >
            ←
          </Link>
          <span className="text-sm font-medium">
            {short(period.start)} – {short(period.end)}
          </span>
          <Link
            href={`/instructor/hours?period=${next.end}`}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs transition-colors"
          >
            →
          </Link>
        </div>
        <span className="text-xs text-zinc-500 inline-flex items-center gap-1.5">
          {rows.length} days · {totalHours(rows)} hrs
          {savedAt && !dirty && <span className="text-zinc-600">· sent</span>}
          <InfoHint
            below
            text="Drafted from the courses you're staffed on: a travel day either side of each block of field days, ten hours each. Off days in the middle of a course split it, so you get travel home and back. Everything is editable — the draft can't know you flew home early."
          />
        </span>
      </div>

      <HoursCalendar
        month={month}
        period={period}
        rows={rows}
        courses={courses}
        basePath="/instructor/hours"
        onSet={setDay}
      />

      {/* A travel day that lands the far side of a boundary is not missing —
          it is on the next timesheet, which is where it gets paid. Said here
          because its absence from the grid reads like a mistake. */}
      {spill.length > 0 && (
        <p className="text-xs text-zinc-500">
          {spill.map((r) => `${short(r.date)} ${r.code === TRAVEL_CODE ? 'travel' : 'field'}`).join(', ')}
          {' '}falls in the next pay period —{' '}
          <Link href={`/instructor/hours?period=${shiftPeriod(period, 1).end}`} className="underline hover:text-zinc-300">
            it belongs on that timesheet
          </Link>
          .
        </p>
      )}

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Department code</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 sticky right-0 bg-zinc-900" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={i}>
                {/* Overtime is reckoned by the week, so the weeks are broken
                    apart and each totals its own hours. */}
                {weekBreaks.has(i) && (
                  <tr className="bg-zinc-950/60">
                    <td colSpan={6} className="px-3 py-1 text-[11px] text-zinc-500">
                      Week of {short(weekBreaks.get(i)!.start)}
                      <span className={weekBreaks.get(i)!.hours > 40 ? 'text-amber-400' : 'text-zinc-600'}>
                        {' · '}{weekBreaks.get(i)!.hours} hrs
                        {weekBreaks.get(i)!.hours > 40 ? ' · over 40' : ''}
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={r.date}
                      onChange={(e) => edit(i, { date: e.target.value })}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={r.hours}
                      onChange={(e) => edit(i, { hours: Number(e.target.value) })}
                      className="w-12 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={r.code}
                      onChange={(e) => edit(i, { code: e.target.value })}
                      className={`bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500 ${
                        r.code === TRAVEL_CODE ? 'text-zinc-400' : 'text-white'
                      }`}
                    >
                      {/* Grouped by entity rather than suffixed with it: a
                          select is as wide as its widest option, and the
                          closed box has to show the whole of the one chosen.
                          The group heading says Peak Rescue or PR Service
                          once instead of on all twelve lines. */}
                      {(['Peak Rescue', 'PR Service'] as const).map((entity) => (
                        <optgroup key={entity} label={entity}>
                          {PAY_CODES.filter((c) => c.entity === entity).map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} · {c.short} (${c.rate})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={r.state}
                      onChange={(e) => editState(i, e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="—"
                      title="Fills the rest of this course's days too"
                      className="w-12 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs uppercase placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-zinc-500">
                    <span className="block max-w-[10rem] truncate" title={r.note}>{r.note}</span>
                  </td>
                  {/* Pinned: the table can still scroll sideways on a phone,
                      and a delete you have to scroll to find is a delete
                      nobody finds. */}
                  <td className="px-3 py-1.5 text-right sticky right-0 bg-zinc-900">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => duplicate(r)}
                        disabled={!firstFreeDay()}
                        className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30 text-xs transition-colors"
                        aria-label="Copy this day to the next free date"
                        title="Copy this day to the next free date"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={() => setRows(rows.filter((_, n) => n !== i))}
                        className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                        aria-label="Remove this day"
                        title="Remove this day"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
                </Fragment>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-zinc-500">
                    No courses on the books this period. Add the days yourself.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-zinc-800 flex items-center gap-4">
          <button
            onClick={addRow}
            disabled={!firstFreeDay()}
            title={firstFreeDay() ? undefined : 'Every day in this period already has a row'}
            className="text-xs text-zinc-400 hover:text-white disabled:text-zinc-700 disabled:cursor-default transition-colors"
          >
            + Add a day
          </button>
          {rows.length > 0 && (
            <span className="text-[11px] text-zinc-600">
              Remove one with the ✕ on its row, or by clicking its mark on the calendar.
            </span>
          )}
          {hasSaved && !sameRows(rows, generated) && (
            <button
              onClick={() => setRows(generated)}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Start again from the courses
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => run(() => onSave(period.start, period.end, rows))}
          disabled={isPending || !dirty}
          className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
        >
          {isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        <button
          onClick={copy}
          className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs transition-colors"
        >
          {copied ? 'Copied!' : 'Copy for the spreadsheet'}
        </button>
        {/* A mailto, not a portal email. It opens in his own mail app, arrives
            from him, and lands in his sent items — which is the whole point:
            a payroll hand-off that looks like automated portal mail is one
            that gets read on Monday. */}
        <a
          href={composeUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => run(() => onMarkSent(period.start))}
          className="px-3 py-2 rounded bg-pr-red hover:bg-pr-red-dark text-white text-xs font-medium transition-colors inline-flex items-center gap-1.5"
        >
          Email these hours
        </a>
        <InfoHint text="Opens a Gmail draft in a new tab, addressed and filled in, in your peak-rescue.com account rather than whichever one the browser had open. It goes out from you rather than from the portal — so save your edits first, since the draft is built from what is on screen." />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {!approverEmail && (
        <p className="text-xs text-amber-400/80">
          No email on file for Micah — the draft will open with the address blank.
        </p>
      )}
    </div>
  )
}
