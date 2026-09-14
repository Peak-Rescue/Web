'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { updateInstanceDates, paintOffDays, setBreaksPaid } from '@/app/admin/courses/actions'
import { clampOffDays, strokeOffDays, type OffSpan } from '@/lib/courses'
import { useSteadyRefresh } from './useSteadyRefresh'
import InfoHint from './InfoHint'
import MonthJump from './MonthJump'
import { CATEGORY_STYLE, sectorOf } from '@/lib/calendar-colors'

/** Another course on the books, as this calendar needs to draw it. */
export type OtherCourse = {
  id: string
  label: string
  starts_at: string
  ends_at: string
  category: string | null
  internal: boolean
  client: string | null
}

// How many overlapping courses one day can name before the cell runs out of
// room. Anything past this still names itself in the day's tooltip — the
// drawing thins out, the answer to "what is on that day" does not.
const MAX_BARS = 3

const ymd = (d: Date) => d.toISOString().slice(0, 10)

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1
}

const fmtDay = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })

const monthOf = (d: string) => d.slice(0, 7)
const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1 + n, 1))
  return ymd(t).slice(0, 7)
}

/** The cells of one month, Sunday-start, with the lead and trail carrying the
    adjacent months' real dates — the same grid the read-only course calendar
    draws. They were blank while two months sat side by side, because a day
    that appeared twice would be a day you could paint in one place and not
    the other. One month at a time, that cannot happen, and the days either
    side are worth having: a course that runs over the turn of the month is
    one stroke again rather than two clicks a page apart. */
function monthCells(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const total = Math.ceil((lead + days) / 7) * 7
  return Array.from({ length: total }, (_, i) => ymd(new Date(Date.UTC(y, m - 1, i + 1 - lead))))
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
 *
 *  A drag is one way to say a range and a pair of clicks is the other, and a
 *  calendar that took the first was expected to take the second. So a click
 *  that lands on the window commits nothing: it sets one end and waits for the
 *  click that says the other, with the days between drawn in as you move
 *  across them. Only a click strictly inside the window still acts at once,
 *  because a break is a click on a day and has no second end to wait for.
 */
export default function CourseDatePainter({
  instanceId,
  onChange,
  startsAt,
  endsAt,
  offDays = [],
  breaksPaid = true,
  today,
  others,
}: {
  /** Absent before the course exists: nothing is saved, the window is handed
      up through onChange, and there are no breaks to cut. */
  instanceId?: string
  onChange?: (start: string | null, end: string | null) => void
  startsAt: string | null
  endsAt: string | null
  /** Whether the crew is paid through this course's breaks — one answer for
      the course, not one per break. */
  breaksPaid?: boolean
  // What day it is where the course runs, worked out on the server. The
  // browser's own clock would be the admin's, and an admin travelling is the
  // one person likely to open this on a different continent to the course.
  today: string
  offDays?: { off_date: string; end_date: string | null }[]
  /** Every other course on the books, for the overlay. Absent → no toggle. */
  others?: OtherCourse[]
}) {
  // No row to write to yet: the painter is an input on someone else's form.
  const local = !instanceId

  const fromProps = (): OffSpan[] =>
    offDays
      .map((o) => ({ from: o.off_date, to: o.end_date ?? o.off_date }))
      .sort((a, b) => a.from.localeCompare(b.from))

  const [win, setWin] = useState<{ start: string | null; end: string | null }>({ start: startsAt, end: endsAt })
  const [breaks, setBreaks] = useState<OffSpan[]>(fromProps)
  const [month, setMonth] = useState(() => monthOf(startsAt ?? today))
  const [paid, setPaid] = useState(breaksPaid)
  // On by default. Setting a date without seeing what it lands on is how two
  // courses end up on one week, and the answer is only in the way when you
  // already know the dates — in which case you typed them.
  const [showOthers, setShowOthers] = useState(true)
  const [sector, setSector] = useState<'military' | 'civilian' | null>(null)
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

  const sig = JSON.stringify([startsAt, endsAt, breaksPaid, offDays.map((o) => [o.off_date, o.end_date])])
  useEffect(() => {
    if (inFlight.current > 0) return
    saved.current = { start: startsAt, end: endsAt }
    setWin({ start: startsAt, end: endsAt })
    setBreaks(fromProps())
    setPaid(breaksPaid)
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
    if (local) {
      saved.current = { start, end }
      setWin({ start, end })
      onChange?.(start, end)
      return
    }
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
    setPending(null)
    setStroke(null)
    setWin({ start, end })
    if (local) { onChange?.(start, end); return }
    if (typing.current) clearTimeout(typing.current)
    typing.current = setTimeout(() => saveWindow(start, end), 900)
  }

  // Breaks and their pay only exist on a saved course; the local painter never
  // reaches either, having no window to cut one out of.
  function saveStroke(from: string, to: string, paint: boolean) {
    if (!instanceId) return
    const before = breaks
    setBreaks(strokeOffDays(breaks, from, to, paint))
    void run(
      () => paintOffDays(instanceId, from, to, paint),
      () => setBreaks(before)
    )
  }

  // Pay is a fact about the course, not about a particular break: the crew
  // stays over the weekend on the clock, or they go home and are off it.
  function savePaid(next: boolean) {
    if (!instanceId) return
    const before = paid
    setPaid(next)
    void run(
      () => setBreaksPaid(instanceId, next),
      () => setPaid(before)
    )
  }

  // ——— the gesture ———————————————————————————————————————————————

  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<
    { mode: 'window' | 'break'; anchor: string; paint: boolean; origin: string; clickAnchor: string; moved: boolean } | null
  >(null)
  const [stroke, setStroke] = useState<{ mode: 'window' | 'break'; from: string; to: string; paint: boolean } | null>(null)
  // The end a click put down, waiting for the click that says the other end.
  const [pending, setPending] = useState<string | null>(null)

  const inWindow = (d: string) => Boolean(win.start && win.end && d >= win.start && d <= win.end)
  const isEdge = (d: string) => d === win.start || d === win.end
  const breakOn = (d: string) => breaks.find((b) => d >= b.from && d <= b.to)

  // Half a range is a state you must be able to get out of, and the two ways
  // out of any half-finished thing are Escape and pressing somewhere else.
  useEffect(() => {
    if (!pending) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPending(null)
      setStroke(null)
    }
    const away = (e: PointerEvent) => {
      if (gridRef.current?.contains(e.target as Node)) return
      setPending(null)
      setStroke(null)
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', away)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', away)
    }
  }, [pending])

  const dayAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-day]')?.getAttribute('data-day') ?? null

  function onPointerDown(day: string, ev: React.PointerEvent) {
    if (ev.button !== 0) return
    ev.preventDefault()
    // A half-typed date waiting to save would land after the stroke and undo
    // it. Drawing is the more recent answer.
    if (typing.current) { clearTimeout(typing.current); typing.current = null }

    // The click that says the other end. Everything between the two is the
    // course, whatever the day happens to be now — mid-range there is no such
    // thing as a click that means a break.
    if (pending) {
      drag.current = null
      setPending(null)
      setStroke(null)
      saveWindow(day < pending ? day : pending, day < pending ? pending : day)
      return
    }
    gridRef.current?.setPointerCapture(ev.pointerId)

    // Where you press is the whole of what you meant. On an end of the window
    // you have taken hold of that end, so the other one anchors and the window
    // can be pulled shorter as well as longer; outside it you are stretching
    // the nearer end out to meet you; inside it you are cutting a break, or
    // rubbing one out if the day already has one.
    if (!win.start || !win.end) {
      drag.current = { mode: 'window', anchor: day, paint: true, origin: day, clickAnchor: day, moved: false }
    } else if (day === win.start) {
      drag.current = { mode: 'window', anchor: win.end, paint: true, origin: day, clickAnchor: day, moved: false }
    } else if (day === win.end) {
      drag.current = { mode: 'window', anchor: win.start, paint: true, origin: day, clickAnchor: day, moved: false }
    } else if (!inWindow(day)) {
      drag.current = { mode: 'window', anchor: day < win.start ? win.end : win.start, paint: true, origin: day, clickAnchor: day, moved: false }
    } else if (local) {
      // Nothing to cut a break out of yet, so a press inside the window is the
      // start of a new one rather than a break in this one.
      drag.current = { mode: 'window', anchor: day, paint: true, origin: day, clickAnchor: day, moved: false }
    } else {
      drag.current = { mode: 'break', anchor: day, paint: !breakOn(day), origin: day, clickAnchor: day, moved: false }
    }
    // Which end a click puts down, if the press turns out to be a click and
    // not a drag: the day you pressed, except on an end of the window, where
    // you have taken hold of that end and it is the other one that stays put —
    // the same thing dragging it would mean.
    drag.current.clickAnchor = day === win.start && win.end ? win.end : day === win.end && win.start ? win.start : day
    setStroke({ mode: drag.current.mode, from: day, to: day, paint: drag.current.paint })
  }

  function onPointerMove(ev: React.PointerEvent) {
    const d = drag.current
    const day = dayAt(ev.clientX, ev.clientY)
    // Between the two clicks the days you cross are drawn in, so the range is
    // something you can see before you commit to it rather than after.
    if (!d) {
      if (!pending || !day) return
      setStroke({
        mode: 'window',
        from: day < pending ? day : pending,
        to: day < pending ? pending : day,
        paint: true,
      })
      return
    }
    if (!day) return
    if (day !== d.origin) d.moved = true
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
    if (!d || !s) { setStroke(null); return }
    // Pressed and released on the one day, you have not drawn a one-day
    // course — you have put down one end of a range and the second click says
    // the other. A break has no second end and still lands on the click.
    if (d.mode === 'window' && !d.moved) {
      setPending(d.clickAnchor)
      setStroke({ mode: 'window', from: d.clickAnchor, to: d.clickAnchor, paint: true })
      return
    }
    setStroke(null)
    if (d.mode === 'window') saveWindow(s.from, s.to)
    else saveStroke(s.from, s.to, s.paint)
  }

  // ——— the other courses ————————————————————————————————————————

  // Same rule as the month calendar's legend: both sectors show by default,
  // and asking for one drops the courses belonging to neither.
  const overlay = useMemo(() => {
    if (!showOthers || !others?.length) return { lanes: new Map<string, number>(), shown: [] as OtherCourse[] }
    const shown = others
      .filter((o) => o.id !== instanceId && o.starts_at && o.ends_at)
      .filter((o) => {
        const sec = sectorOf(o)
        return sector ? sec === sector : true
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.ends_at.localeCompare(b.ends_at))
    // A course holds one lane for its whole span, so its bar sits at the same
    // height on every day it covers instead of hopping rows across the week.
    const lanes = new Map<string, number>()
    const laneEnds: string[] = []
    for (const o of shown) {
      let lane = laneEnds.findIndex((end) => end < o.starts_at)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = o.ends_at
      lanes.set(o.id, lane)
    }
    return { lanes, shown }
  }, [showOthers, others, sector, instanceId])

  const othersOn = (day: string) => overlay.shown.filter((o) => o.starts_at <= day && day <= o.ends_at)

  // Where the work is, for the jump panel. Every course, not the ticked ones:
  // the map of the book should not move when you hide a sector.
  const jump = useMemo(() => {
    const months = new Set<string>()
    for (const o of others ?? []) {
      const last = o.ends_at.slice(0, 7)
      for (let cur = o.starts_at.slice(0, 7); cur <= last; ) {
        months.add(cur)
        const [cy, cm] = cur.split('-').map(Number)
        cur = ymd(new Date(Date.UTC(cy, cm, 1))).slice(0, 7)
      }
    }
    // Always the year on screen and the year it is, so a book with nothing in
    // it still has somewhere to point.
    const ys = [...months].map((ym) => Number(ym.slice(0, 4)))
    const here = Number(month.slice(0, 4))
    const now = Number(today.slice(0, 4))
    const from = Math.min(here, now, ...ys)
    const to = Math.max(here, now, ...ys)
    return { busy: [...months], years: Array.from({ length: to - from + 1 }, (_, i) => from + i) }
  }, [others, month, today])

  // ——— what a day looks like ————————————————————————————————————

  function cellClass(day: string): string {
    const previewing = stroke && day >= stroke.from && day <= stroke.to
    // With the overlay on, the cell becomes a calendar square like the month
    // calendar's: the date in the corner and the courses named underneath.
    const base = showOthers
      ? 'relative h-20 rounded-md select-none touch-none transition-colors cursor-pointer'
      : 'relative h-9 flex items-center justify-center text-xs rounded-md select-none touch-none transition-colors cursor-pointer'

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
    if (course && off) return `${base} bg-zinc-800 text-zinc-500 border border-dashed border-zinc-600${ring}`
    if (course) return `${base} bg-pr-red/85 text-white font-medium hover:bg-pr-red${ring}`
    // The days either side of the turn of the month are real days and can be
    // painted; they just are not what this page is about.
    const dim = day.slice(0, 7) === month ? 'text-zinc-500' : 'text-zinc-700'
    return `${base} ${dim} hover:bg-zinc-800 hover:text-zinc-300${ring}`
  }

  const total = win.start && win.end ? daysBetween(win.start, win.end) : 0
  const offCount = breaks.reduce((n, b) => n + daysBetween(b.from, b.to), 0)

  return (
    <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-zinc-500">
          {pending ? (
            <>
              <span className="text-zinc-300">{fmtDay(pending)}</span>
              <span className="text-zinc-600"> → now click the other end</span>
            </>
          ) : win.start && win.end ? (
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
            'Drag across the days the course runs, or click the first day then the last'
          )}
          <InfoHint
            below={!local}
            text={
              local
                ? 'Drag across the calendar, or click the first day and then the last. Dragging either end moves it, and Escape abandons a half-made range. Breaks are cut later, on the course page.'
                : 'Drag across the calendar to paint the course window, or click the first day and then the last — everything between the two clicks becomes the course. Dragging either end moves it. Once the window is painted, a click on a day inside it cuts a break out of the course, and a click on a break rubs it out. The first and last day are the course itself and cannot be a break — pull that end in instead. Escape abandons a half-made range.'
            }
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
        onPointerLeave={() => {
          if (pending && !drag.current) setStroke({ mode: 'window', from: pending, to: pending, paint: true })
        }}
      >
        {[month].map((m) => (
          <div key={m}>
            <div className="mb-2">
              <MonthJump month={m} years={jump.years} busy={jump.busy} onPick={setMonth} />
            </div>
            <div className="grid grid-cols-7 text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-center py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {monthCells(m).map((day, i) => {
                const booked = othersOn(day)
                const gesture = pending
                  ? 'Click to set the other end of the course'
                  : isEdge(day)
                    ? `${day === win.start ? 'First' : 'Last'} day — drag to move it`
                    : breakOn(day)
                      ? 'Break — click to put the day back'
                      : inWindow(day)
                        ? 'Course day — click to make it a break'
                        : 'Click to set the course dates'
                return (
                  <div
                    key={day}
                    data-day={day}
                    onPointerDown={(ev) => onPointerDown(day, ev)}
                    // Every course on the day is named here, including any the
                    // cell had no room to draw.
                    title={booked.length ? `${booked.map((o) => o.label).join('\n')}\n\n${gesture}` : gesture}
                    className={cellClass(day)}
                  >
                    <span className={showOthers ? 'absolute top-1 left-1.5 text-[10px] leading-none' : undefined}>
                      {Number(day.slice(8))}
                    </span>
                    {/* Drawn, not clickable: the day underneath is still a day
                        of this course to be painted. */}
                    {showOthers && (
                      <span className="pointer-events-none absolute inset-x-0.5 top-5 flex flex-col gap-px">
                        {Array.from({ length: MAX_BARS }, (_, lane) => {
                          const o = booked.find((b) => overlay.lanes.get(b.id) === lane)
                          // One chip per course per week row, drawn on its
                          // first day in the row and stretched over the days
                          // it covers — so the name has the whole bar's width,
                          // as it does on the month calendar.
                          const opens = o && (day === o.starts_at || i % 7 === 0)
                          if (!o || !opens) return <span key={lane} className="h-4" />
                          const toEnd = Math.round((Date.parse(o.ends_at) - Date.parse(day)) / 86_400_000)
                          // Clamped to the week: the next row redraws it.
                          const span = Math.max(1, Math.min(toEnd + 1, 7 - (i % 7)))
                          return (
                            <span
                              key={lane}
                              style={span > 1 ? { width: `calc(${span * 100}% + ${(span - 1) * 6}px)` } : undefined}
                              className={`relative z-10 block h-4 px-1 border rounded text-[10px] leading-4 truncate ${CATEGORY_STYLE[sectorOf(o)].solid}`}
                            >
                              {o.label}
                            </span>
                          )
                        })}
                      </span>
                    )}
                    {isEdge(day) && (
                      <span className="absolute inset-x-0 -bottom-0.5 mx-auto h-0.5 w-4 rounded-full bg-white/70" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* What else is on those days, drawn as the month calendar draws it:
          named chips in the same colours, stretched across the days they
          cover, with the same sector checkboxes and the same rule — both on
          by default, and unticking the last one flips to the other rather
          than emptying the overlay. Off to start with; the cells shrink back
          to bare dates when it is. */}
      {others && others.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px]">
          <label className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={showOthers}
              onChange={(e) => setShowOthers(e.target.checked)}
              className="w-3.5 h-3.5 accent-pr-red bg-zinc-800 border-zinc-700 rounded"
            />
            Show other courses
          </label>
          {showOthers &&
            (['military', 'civilian'] as const).map((k) => {
              const other = k === 'military' ? ('civilian' as const) : ('military' as const)
              const checked = sector !== other
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSector(checked ? other : null)}
                  title={checked ? `Hide ${k} courses` : `Show ${k} courses`}
                  className={`flex items-center gap-1.5 transition-colors ${
                    checked ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-3 h-3 rounded-sm border ${
                      checked ? CATEGORY_STYLE[k].swatch : 'border-zinc-600'
                    }`}
                  >
                    {checked && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {k === 'military' ? 'Military' : 'Civilian'}
                </button>
              )
            })}
        </div>
      )}

      {/* Typed entry lives on the form itself when the painter is one field of
          one, so the course's dates are not asked for in two places. */}
      <div className={`flex flex-wrap items-end gap-4 mt-4 pt-3 border-t border-zinc-800${local ? ' hidden' : ''}`}>
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
        {breaks.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-zinc-300 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => savePaid(e.target.checked)}
              className="w-4 h-4 accent-pr-red bg-zinc-800 border-zinc-700 rounded"
            />
            Paying instructors through breaks
            <InfoHint
              below
              text="Paid breaks count as instructor days on the estimate; unpaid ones don't. Lodging and the vehicle span them either way."
            />
          </label>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
