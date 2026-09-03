'use client'

import { useEffect, useRef, useState } from 'react'
import { updateInstanceDates, paintOffDays } from '@/app/admin/courses/actions'
import { clampOffDays, strokeOffDays, type OffSpan } from '@/lib/courses'
import { useSteadyRefresh } from './useSteadyRefresh'
import InfoHint from './InfoHint'

const ymd = (d: Date) => d.toISOString().slice(0, 10)

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1
}

const fmtDay = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })

const fmtMonth = (m: string) =>
  new Date(m + '-01T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })

const monthOf = (d: string) => d.slice(0, 7)
const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1 + n, 1))
  return ymd(t).slice(0, 7)
}

/** The cells of one month, Sunday-start, with the lead and trail padded out.
    Blank rather than the adjacent months' real dates, unlike the read-only
    course calendar: two months are drawn side by side here, and a day that
    appeared twice would be a day you could paint in one place and not the
    other. */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number)
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) cells.push(ymd(new Date(Date.UTC(y, m - 1, d))))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** Course dates as a thing you draw rather than a thing you type.
 *
 *  Two date fields could never show the shape of what they described. Start
 *  and end were entered blind — the second one with the first out of sight —
 *  and a break was a third and fourth field asking for dates you had to work
 *  out yourself from the two above, which is why they so often came back as
 *  the course dates themselves. Drawn instead, the whole window is one stroke
 *  and a break is a click on the day it lands on, in the middle of the run
 *  you can see it interrupting.
 *
 *  One calendar, and where you press says what you meant: outside the window
 *  or on either end, you are moving the window; strictly inside it, you are
 *  cutting a break out of it, or rubbing one out if the day already has one.
 *  The date fields stay for exact entry, and because a gesture is no way to
 *  reach a keyboard.
 */
export default function CourseDatePainter({
  instanceId,
  startsAt,
  endsAt,
  offDays,
}: {
  instanceId: string
  startsAt: string | null
  endsAt: string | null
  offDays: { off_date: string; end_date: string | null; instructors_paid?: boolean | null }[]
}) {
  const fromProps = (): OffSpan[] =>
    offDays
      .map((o) => ({ from: o.off_date, to: o.end_date ?? o.off_date, paid: Boolean(o.instructors_paid) }))
      .sort((a, b) => a.from.localeCompare(b.from))

  const [win, setWin] = useState<{ start: string | null; end: string | null }>({ start: startsAt, end: endsAt })
  const [breaks, setBreaks] = useState<OffSpan[]>(fromProps)
  const [month, setMonth] = useState(() => monthOf(startsAt ?? ymd(new Date())))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useSteadyRefresh()
  // Writes land one at a time but the props behind them arrive whenever the
  // refresh does; while anything is in flight the drawing on screen is ahead
  // of the server and must not be reset to it.
  const inFlight = useRef(0)
  // What the server was last known to hold, so a save can tell whether the
  // dates actually moved without asking the drawing, which runs ahead of it.
  const saved = useRef<{ start: string | null; end: string | null }>({ start: startsAt, end: endsAt })
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (typing.current) clearTimeout(typing.current) }, [])

  const sig = JSON.stringify([startsAt, endsAt, offDays.map((o) => [o.off_date, o.end_date, o.instructors_paid])])
  useEffect(() => {
    if (inFlight.current > 0) return
    saved.current = { start: startsAt, end: endsAt }
    setWin({ start: startsAt, end: endsAt })
    setBreaks(fromProps())
    // Redrawn from the server's answer, whatever it was — the signature is the
    // whole of what this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  async function run(fn: () => Promise<void>, revert: () => void) {
    inFlight.current += 1
    setSaving(true)
    setError(null)
    try {
      await fn()
      refresh()
    } catch (e) {
      revert()
      setError(e instanceof Error ? e.message : 'Could not save those dates')
    } finally {
      inFlight.current -= 1
      if (inFlight.current === 0) setSaving(false)
    }
  }

  function saveWindow(start: string | null, end: string | null) {
    const before = { win: saved.current, breaks }
    if (start === saved.current.start && end === saved.current.end) return
    // The server trims breaks the new window no longer contains; the drawing
    // does the same so the two agree before the refresh lands.
    const kept = start && end ? clampOffDays(breaks, start, end) : breaks
    saved.current = { start, end }
    setWin({ start, end })
    setBreaks(kept)
    void run(async () => {
      const fd = new FormData()
      fd.set('starts_at', start ?? '')
      fd.set('ends_at', end ?? '')
      await updateInstanceDates(instanceId, fd)
    }, () => {
      saved.current = before.win
      setWin(before.win)
      setBreaks(before.breaks)
    })
  }

  // A typed date is half-typed for a moment, and half a date reads as no date
  // at all: saved on the keystroke, a course being retyped loses its dates and
  // every instructor on it hears that it has. So the field shows the change at
  // once and the save waits for the typing to stop.
  function typeWindow(start: string | null, end: string | null) {
    setWin({ start, end })
    if (typing.current) clearTimeout(typing.current)
    typing.current = setTimeout(() => saveWindow(start, end), 900)
  }

  function saveStroke(from: string, to: string, paint: boolean) {
    const before = breaks
    // Paid, because that is what a break is here nearly every time: the crew
    // stays where they are and stays on the clock. The rare unpaid one is
    // marked on its own row, where the answer is about a break that exists
    // rather than about the next one drawn.
    setBreaks(strokeOffDays(breaks, from, to, paint, true))
    void run(
      () => paintOffDays(instanceId, from, to, paint, true),
      () => setBreaks(before)
    )
  }

  // ——— the gesture ———————————————————————————————————————————————

  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'window' | 'break'; anchor: string; paint: boolean } | null>(null)
  const [stroke, setStroke] = useState<{ mode: 'window' | 'break'; from: string; to: string; paint: boolean } | null>(null)

  const inWindow = (d: string) => Boolean(win.start && win.end && d >= win.start && d <= win.end)
  const isEdge = (d: string) => d === win.start || d === win.end
  const breakOn = (d: string) => breaks.find((b) => d >= b.from && d <= b.to)

  const dayAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-day]')?.getAttribute('data-day') ?? null

  function onPointerDown(day: string, ev: React.PointerEvent) {
    if (ev.button !== 0) return
    ev.preventDefault()
    gridRef.current?.setPointerCapture(ev.pointerId)
    // A half-typed date waiting to save would land after the stroke and undo
    // it. Drawing is the more recent answer.
    if (typing.current) { clearTimeout(typing.current); typing.current = null }

    // Where you press is the whole of what you meant. On an end of the window
    // you have taken hold of that end, so the other one anchors and the window
    // can be pulled shorter as well as longer; outside it you are stretching
    // the nearer end out to meet you; inside it you are cutting a break, or
    // rubbing one out if the day already has one.
    if (!win.start || !win.end) {
      drag.current = { mode: 'window', anchor: day, paint: true }
    } else if (day === win.start) {
      drag.current = { mode: 'window', anchor: win.end, paint: true }
    } else if (day === win.end) {
      drag.current = { mode: 'window', anchor: win.start, paint: true }
    } else if (!inWindow(day)) {
      drag.current = { mode: 'window', anchor: day < win.start ? win.end : win.start, paint: true }
    } else {
      drag.current = { mode: 'break', anchor: day, paint: !breakOn(day) }
    }
    setStroke({ mode: drag.current.mode, from: day, to: day, paint: drag.current.paint })
  }

  function onPointerMove(ev: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const day = dayAt(ev.clientX, ev.clientY)
    if (!day) return
    setStroke({
      mode: d.mode,
      from: day < d.anchor ? day : d.anchor,
      to: day < d.anchor ? d.anchor : day,
      paint: d.paint,
    })
  }

  function onPointerUp() {
    const d = drag.current
    const s = stroke
    drag.current = null
    setStroke(null)
    if (!d || !s) return
    if (d.mode === 'window') saveWindow(s.from, s.to)
    else saveStroke(s.from, s.to, s.paint)
  }

  // ——— what a day looks like ————————————————————————————————————

  function cellClass(day: string): string {
    const previewing = stroke && day >= stroke.from && day <= stroke.to
    const base = 'relative h-9 flex items-center justify-center text-xs rounded-md select-none touch-none transition-colors cursor-pointer'

    // Mid-stroke the day is drawn as it will be, not as it is: painting is
    // only worth the name if the paint shows up under the pointer.
    let course = inWindow(day)
    let off = Boolean(breakOn(day))
    if (previewing && stroke) {
      if (stroke.mode === 'window') {
        // The two ends of a window are the course's first and last day, so a
        // break can't survive under them.
        course = true
        off = off && day !== stroke.from && day !== stroke.to
      } else if (course && !isEdge(day)) {
        // A break stroke that overshoots the window paints nothing out there.
        off = stroke.paint
      }
    }
    if (stroke?.mode === 'window' && !previewing) course = false

    const ring = previewing ? ' ring-2 ring-inset ring-pr-red-light' : ''
    // An unpaid break is the exception and the expensive one to miss — it is
    // the only thing here that takes a day off what the client is quoted — so
    // it is drawn apart from the ordinary paid break rather than left to the
    // list below to disclose.
    if (course && off) {
      const unpaid = breakOn(day) ? !breakOn(day)!.paid : false
      return unpaid
        ? `${base} bg-zinc-800 text-amber-300/80 border border-dashed border-amber-700/70${ring}`
        : `${base} bg-zinc-800 text-zinc-500 border border-dashed border-zinc-600${ring}`
    }
    if (course) return `${base} bg-pr-red/85 text-white font-medium hover:bg-pr-red${ring}`
    return `${base} text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300${ring}`
  }

  const months = [month, shiftMonth(month, 1)]
  const total = win.start && win.end ? daysBetween(win.start, win.end) : 0
  const offCount = breaks.reduce((n, b) => n + daysBetween(b.from, b.to), 0)

  return (
    <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-zinc-500">
          {win.start && win.end ? (
            <>
              <span className="text-zinc-300">{fmtDay(win.start)}</span>
              <span className="text-zinc-600"> → </span>
              <span className="text-zinc-300">{fmtDay(win.end)}</span>
              <span className="text-zinc-600">
                {' · '}{total} day{total === 1 ? '' : 's'}
                {offCount > 0 ? `, ${offCount} off` : ''}
              </span>
            </>
          ) : (
            'Drag across the days the course runs'
          )}
          <InfoHint
            below
            text="Drag across the calendar to paint the course window; drag either end to move it. Once the window is painted, a click on a day inside it cuts a break out of the course, and a click on a break rubs it out. The first and last day are the course itself and cannot be a break — pull that end in instead."
          />
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <span className="text-xs text-zinc-500">Saving…</span>}
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 text-sm transition-colors"
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 text-sm transition-colors"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      <div
        ref={gridRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        {months.map((m) => (
          <div key={m}>
            <p className="text-xs font-semibold text-zinc-300 mb-2">{fmtMonth(m)}</p>
            <div className="grid grid-cols-7 text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-center py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {monthCells(m).map((day, i) =>
                day === null ? (
                  <div key={i} className="h-9" />
                ) : (
                  <div
                    key={day}
                    data-day={day}
                    onPointerDown={(ev) => onPointerDown(day, ev)}
                    title={
                      isEdge(day)
                        ? `${day === win.start ? 'First' : 'Last'} day — drag to move it`
                        : breakOn(day)
                          ? breakOn(day)!.paid
                            ? 'Break, instructors paid — click to put the day back'
                            : 'Break, unpaid — click to put the day back'
                          : inWindow(day)
                            ? 'Course day — click to make it a break'
                            : 'Click to set the course dates'
                    }
                    className={cellClass(day)}
                  >
                    {Number(day.slice(8))}
                    {isEdge(day) && (
                      <span className="absolute inset-x-0 -bottom-0.5 mx-auto h-0.5 w-4 rounded-full bg-white/70" />
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 mt-4 pt-3 border-t border-zinc-800">
        {/* Typed entry stays: a drag is no way to reach a date two years out,
            and no way to reach anything at all from a keyboard. */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Course start</label>
          <input
            type="date"
            value={win.start ?? ''}
            onChange={(e) => typeWindow(e.target.value || null, win.end)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Course end</label>
          <input
            type="date"
            value={win.end ?? ''}
            onChange={(e) => typeWindow(win.start, e.target.value || null)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
