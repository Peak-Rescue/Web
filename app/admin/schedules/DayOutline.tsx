'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { replaceDayOutline, touchDay } from './actions'
import { useRegisterSaver } from '@/components/PendingSaves'
import type { ScheduleBlock } from './ScheduleEditor'

// `where` is the part of the day this line happens in — "Classroom" before
// lunch, "In canyon" after. It was on the blocks and shown on the course page
// from the first import, but no editor ever held it, so every save silently
// dropped it: the outline is written back by deleting the day's lines and
// re-inserting them, and what the row doesn't carry doesn't come back.
type Depth = 0 | 1 | 2
type Row = { key: string; title: string; time: string; where: string; depth: Depth }
type Job = { rows: Row[]; quiet: boolean }

// Three levels: a topic, what sits under it, and the detail under that. Deeper
// than that an outline stops being read as a shape and starts being read as a
// paragraph, so Tab stops here.
const MAX_DEPTH = 2

let seq = 0
const newKey = () => `r${++seq}`

// A line can only ever be one step deeper than the line above it — there is no
// sub-sub-topic hanging off nothing. Clamping here, on every edit, rather than
// only at save time, means the outline on screen is the outline that comes
// back: nothing indents a level further than it can be stored and then snaps
// out again on the next load. It also does the work the old first-line special
// cases did, and does it for outdenting too — pulling a topic out drags what
// sits under it along.
function normalize(rows: Row[]): Row[] {
  let prev = -1
  return rows.map((r) => {
    const depth = Math.min(r.depth, prev + 1, MAX_DEPTH) as Depth
    prev = depth
    return depth === r.depth ? r : { ...r, depth }
  })
}

// One line per topic, the way an outline is actually written: type, Enter for
// the next line, Tab to make it a sub-topic, Shift+Tab to pull it back out.
// Nothing is clicked and nothing is saved by hand — the whole day goes back to
// the server a beat after typing stops.
export default function DayOutline({
  dayId,
  blocks,
  onError,
}: {
  dayId: string
  blocks: ScheduleBlock[]
  onError: (message: string | null) => void
}) {
  const [rows, setRows] = useState<Row[]>(() => fromBlocks(blocks))
  const [saving, setSaving] = useState(false)
  // A run of whole lines, held by index: Shift+arrows extend it, a drag down
  // the margin draws it, and Shift+click reaches for the far end. Everything
  // that works on the line you're on — Tab, Backspace, Alt+arrows — works on
  // the run instead once there is one.
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const lo = sel ? Math.min(sel.a, sel.b) : -1
  const hi = sel ? Math.max(sel.a, sel.b) : -1

  // A phone has no Tab, no Alt and no Shift, and a drag down the margin is a
  // scroll. So the outline's verbs get buttons as well as keys: a bar that
  // rides above the keyboard and acts on the line the caret is in — or on the
  // run, once one is held. It is built on every screen and shown only where
  // the pointer is a thumb; where there are keys, the keys are still the way.
  //
  // `active` is the line the bar is aimed at. It survives a press because the
  // bar refuses the blur that would otherwise take the caret, the selection
  // and the keyboard down with it.
  const [active, setActive] = useState<number | null>(null)
  // Tapping a line normally puts the caret in it. Held down, the same tap
  // reaches for the far end of a run instead — what Shift+click is on a desk.
  const [extending, setExtending] = useState(false)
  // Which line has been asked for its time and its place. The columns are
  // gone on a narrow screen and these two are the quiet half of a line — most
  // lines have neither — so they show where they hold something already, or
  // where the bar has just asked for them. Without this, every topic carried a
  // greyed-out "time" on a line of its own, which is a row and a half of
  // nothing per topic.
  const [metaFor, setMetaFor] = useState<string | null>(null)
  // How much of the window the keyboard is sitting on. Fixed-to-the-bottom is
  // underneath it on iOS; the visual viewport is the only thing that knows
  // where the keyboard's top edge actually is.
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on) }
  }, [])

  const inputs = useRef(new Map<string, HTMLTextAreaElement>())
  const wheres = useRef(new Map<string, HTMLInputElement>())
  const times = useRef(new Map<string, HTMLInputElement>())
  const focusNext = useRef<{ key: string; caret: number } | null>(null)

  // Asking for these is asking to type one — the fields appear and the first
  // of them takes the caret, rather than appearing somewhere below the thumb
  // that asked. The hour on a topic; the place on a line under one, which has
  // no hour of its own.
  useEffect(() => {
    if (metaFor) (times.current.get(metaFor) ?? wheres.current.get(metaFor))?.focus()
  }, [metaFor])

  // A line grows to hold what was typed into it. It was an <input>, which is
  // a box text scrolls sideways out of — fine at a desk, where a topic is
  // sixty characters in a field six hundred wide, and useless on a phone,
  // where the same topic is cut off at "Course overview, safety, eq". The read
  // view has always wrapped; this is the editor catching up to it.
  function fit(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  // Every render, because a line can change height without being typed in:
  // pasting an outline, merging two lines with backspace, or simply the
  // keyboard coming up and narrowing the page under it.
  useEffect(() => { inputs.current.forEach(fit) })

  /** Whether this line is taller than the one line it started as — which is
      what decides whether an arrow key belongs to the text or to the outline. */
  function wrapped(el: HTMLTextAreaElement) {
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    return el.scrollHeight > line * 1.5
  }

  // Focus follows the edit that caused it — a split line, a merged one, an
  // arrow key — so the caret ends up where a typist expects it.
  useEffect(() => {
    const want = focusNext.current
    if (!want) return
    focusNext.current = null
    const el = inputs.current.get(want.key)
    if (!el) return
    el.focus()
    const at = Math.min(want.caret, el.value.length)
    el.setSelectionRange(at, at)
  })

  // Saves are serialised: the last edit always wins, and two half-written
  // versions of a day never race each other into the same table.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const queued = useRef<Job | null>(null)
  const pending = useRef<Row[] | null>(null)

  // Set by every quiet save, spent by the one that isn't — so a day saved
  // three times mid-sentence still refreshes the page once at the end.
  const owed = useRef(false)

  // What the current save is, so a close can wait on it rather than on the
  // next tick.
  const running = useRef<Promise<void>>(Promise.resolve())

  const drain = useCallback(async (first: Job) => {
    inFlight.current = true
    setSaving(true)
    try {
      // Drain rather than recurse: edits made while a save is in the air go
      // out after it, in order, and the last one still wins.
      let job: Job | null = first
      while (job) {
        try {
          await replaceDayOutline(
            dayId,
            job.rows.map((r) => ({ title: r.title, timeLabel: r.time, location: r.where, depth: r.depth })),
            { quiet: job.quiet }
          )
          owed.current = job.quiet
          onError(null)
        } catch (e) {
          onError(e instanceof Error ? e.message : 'That didn’t save')
        }
        job = queued.current
        queued.current = null
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }, [dayId, onError])

  const push = useCallback((first: Job): Promise<void> => {
    // A save already in the air takes the new rows with it when it drains, so
    // waiting on that one is waiting on this edit too.
    if (inFlight.current) { queued.current = first; return running.current }
    running.current = drain(first)
    return running.current
  }, [drain])

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const rows = pending.current
    pending.current = null
    if (rows) return push({ rows, quiet: false })
    if (owed.current) { owed.current = false; return touchDay(dayId).catch(() => {}) }
    return running.current
  }, [push, dayId])

  // An outline saves a beat after typing stops, which is the same beat someone
  // presses the X in. Closing the editor asks for that beat back.
  useRegisterSaver({
    isPending: () => timer.current !== null || inFlight.current || pending.current !== null || owed.current,
    flush: async () => { await flush() },
  })

  const edit = useCallback((raw: Row[]) => {
    const next = normalize(raw)
    setRows(next)
    // Indices don't survive a change of shape. An operation that means to keep
    // its run says so again, after this.
    setSel(null)
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const rows = pending.current
      pending.current = null
      if (rows) void push({ rows, quiet: true })
    }, 600)
  }, [push])

  // A day left mid-edit still lands — leaving the outline, or the page,
  // spends whatever the timer was still holding.
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })
  useEffect(() => () => { void flushRef.current() }, [])

  // Dragging down the lines selects them. The mouse can leave the outline
  // mid-drag, so the button coming up is watched on the window.
  const dragFrom = useRef<number | null>(null)
  // Where the caret last was, so Shift+click has a far end to reach from.
  const focused = useRef(0)
  useEffect(() => {
    const up = () => { dragFrom.current = null }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // Selected lines leave as text, indented the way they'd come back in.
  const asText = (from: number, to: number) =>
    rows.slice(from, to + 1).map((r) => '  '.repeat(r.depth) + r.title).join('\n')

  // Whatever the run is replaced by, the run itself goes: the rows leave and
  // the caret lands on what takes their place.
  function replaceRun(from: number, to: number, put: Row[], caret?: number) {
    const next = [...rows]
    next.splice(from, to - from + 1, ...put)
    const landing = put[put.length - 1] ?? next[from - 1] ?? next[0]
    if (!next.length) next.push(blankRow())
    const at = landing ?? next[0]
    focusNext.current = { key: at.key, caret: caret ?? (put.length ? 0 : at.title.length) }
    edit(next)
  }

  // The outline's two structural verbs, written once. A keystroke and a button
  // press are the same edit — which is the whole point, because the phone has
  // no key to press.
  //
  // Each takes the run to act on (the held selection, or the line the caret is
  // in), and where to put the caret afterwards: a thumb pressing indent has
  // not finished with the line it is writing.

  /** Where the caret is in a given line, for the bar — which has no keystroke
      to read one off, and must put it back exactly where the thumb left it. */
  function caretIn(key: string) {
    return inputs.current.get(key)?.selectionStart ?? 0
  }

  /** One step in or out for every line of the run, so the shape inside the run
      survives the move. `normalize` does the clamping — nothing ends up a
      level further in than the line above it can carry, and pulling a topic
      out drags what hangs off it along. */
  function indentBy(step: 1 | -1, from: number, to: number, at: number, caret: number) {
    const next = normalize(rows.map((r, n) =>
      n >= from && n <= to
        ? { ...r, depth: Math.min(Math.max(r.depth + step, 0), MAX_DEPTH) as Depth }
        : r
    ))
    // Already as far in as the line above allows: no edit, and no save.
    if (next.every((r, n) => r.depth === rows[n].depth)) return
    focusNext.current = { key: rows[aim].key, caret }
    edit(next)
    if (sel) setSel(sel)
  }

  /** The run past the line above or below it, carrying the selection with it
      so a second press keeps moving the same lines. */
  function moveBy(dir: -1 | 1, from: number, to: number, at: number, caret: number) {
    const landing = dir < 0 ? from - 1 : to + 1
    if (landing < 0 || landing >= rows.length) return
    const next = [...rows]
    const moved = next.splice(from, to - from + 1)
    next.splice(dir < 0 ? from - 1 : from + 1, 0, ...moved)
    focusNext.current = { key: rows[aim].key, caret }
    edit(next)
    if (sel) setSel({ a: lo + dir, b: hi + dir })
  }

  // Keys that mean something to a run of lines rather than to a caret. Runs
  // through before the single-line handling below, and falls through to it
  // when there's no run.
  function runKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') { e.preventDefault(); setSel(null); return true }

    // Alt with an arrow means move, and the line handling below already moves
    // a whole run when there is one.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) return false

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      e.preventDefault()
      const down = e.key === 'ArrowDown'
      if (e.shiftKey) {
        const b = Math.min(Math.max(sel!.b + (down ? 1 : -1), 0), rows.length - 1)
        focusNext.current = { key: rows[b].key, caret: 0 }
        setSel({ a: sel!.a, b })
      } else {
        // Stepping off a run leaves you at the end you stepped towards.
        const at = down ? hi : lo
        focusNext.current = { key: rows[aim].key, caret: down ? rows[at].title.length : 0 }
        setSel(null)
      }
      return true
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      indentBy(e.shiftKey ? -1 : 1, lo, hi, hi, 0)
      return true
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      replaceRun(lo, hi, [])
      return true
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const put = blankRow()
      replaceRun(lo, hi, [put])
      return true
    }

    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'x')) {
      e.preventDefault()
      void navigator.clipboard?.writeText(asText(lo, hi)).catch(() => {})
      if (e.key === 'x') replaceRun(lo, hi, [])
      return true
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault()
      setSel({ a: 0, b: rows.length - 1 })
      return true
    }

    // Typing over a run does what typing over a selection does anywhere: the
    // run goes, the character stays.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      replaceRun(lo, hi, [{ ...blankRow(), title: e.key, depth: rows[lo].depth }], 1)
      return true
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const at = e.key === 'ArrowLeft' ? lo : hi
      focusNext.current = { key: rows[aim].key, caret: e.key === 'ArrowLeft' ? 0 : rows[at].title.length }
      setSel(null)
      return true
    }

    // A modifier held on its own isn't a keystroke yet, and a shortcut this
    // doesn't claim — paste above all — has to reach the browser intact.
    if (e.metaKey || e.ctrlKey) return false
    return !['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)
  }

  function keyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (sel && runKeyDown(e)) return
    const el = e.currentTarget
    const caret = el.selectionStart ?? 0
    const selected = (el.selectionEnd ?? 0) !== caret
    const row = rows[i]

    if (e.key === 'Enter') {
      e.preventDefault()
      // An empty sub-topic pops back out a level before it starts a new
      // line — the same escape hatch a word processor gives you, one press per
      // level on the way out.
      if (!row.title && row.depth > 0) {
        edit(rows.map((r, n) => (n === i ? { ...r, depth: (r.depth - 1) as Depth } : r)))
        return
      }
      const before = row.title.slice(0, caret)
      const after = row.title.slice(el.selectionEnd ?? caret)
      const created: Row = { key: newKey(), title: after, time: '', where: '', depth: row.depth }
      const next = [...rows]
      next[i] = { ...row, title: before }
      next.splice(i + 1, 0, created)
      focusNext.current = { key: created.key, caret: 0 }
      edit(next)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      // One step per press, and never further in than one below the line
      // above — the first line of a day has nothing to hang off at all.
      indentBy(e.shiftKey ? -1 : 1, i, i, i, caret)
      return
    }

    if (e.key === 'Backspace' && caret === 0 && !selected) {
      if (row.depth > 0) {
        e.preventDefault()
        focusNext.current = { key: row.key, caret: 0 }
        edit(rows.map((r, n) => (n === i ? { ...r, depth: (r.depth - 1) as Depth } : r)))
        return
      }
      if (i === 0) return
      e.preventDefault()
      const prev = rows[i - 1]
      const next = [...rows]
      next[i - 1] = { ...prev, title: prev.title + row.title }
      next.splice(i, 1)
      focusNext.current = { key: prev.key, caret: prev.title.length }
      edit(next.length ? next : [blankRow()])
      return
    }

    if (e.key === 'Delete' && caret === row.title.length && !selected && i < rows.length - 1) {
      e.preventDefault()
      const next = [...rows]
      next[i] = { ...row, title: row.title + rows[i + 1].title }
      next.splice(i + 1, 1)
      focusNext.current = { key: row.key, caret: row.title.length }
      edit(next)
      return
    }

    // Alt+arrow moves the line itself, so reordering is a keystroke rather
    // than a drag. With a run selected it moves all of them, together.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault()
      moveBy(e.key === 'ArrowUp' ? -1 : 1, sel ? lo : i, sel ? hi : i, i, caret)
      return
    }

    // Shift with an up or down arrow can only mean whole lines here — a
    // one-line field has no line above to select into.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey) {
      e.preventDefault()
      const b = Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)
      if (b === i) return
      focusNext.current = { key: rows[b].key, caret: 0 }
      setSel({ a: i, b })
      return
    }

    // Select-all takes the field first and the day second, the way a word
    // processor widens from the paragraph to the document.
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      if (row.title && !(caret === 0 && el.selectionEnd === row.title.length)) return
      e.preventDefault()
      setSel({ a: 0, b: rows.length - 1 })
      return
    }

    // Up and down leave the line for the one above or below it — but a line
    // that has wrapped has lines of its own to walk first, so the arrow is the
    // text's until the caret is at the end it is heading for.
    if (e.key === 'ArrowUp' && i > 0) {
      if (wrapped(el) && caret > 0) return
      e.preventDefault()
      focusNext.current = { key: rows[i - 1].key, caret }
      setRows([...rows])
      return
    }
    if (e.key === 'ArrowDown' && i < rows.length - 1) {
      if (wrapped(el) && caret < row.title.length) return
      e.preventDefault()
      focusNext.current = { key: rows[i + 1].key, caret }
      setRows([...rows])
      return
    }

    // Escape steps back from the caret to the line it sits on — from there
    // the arrows walk the selection out over the ones around it.
    if (e.key === 'Escape') { e.preventDefault(); setSel({ a: i, b: i }) }
  }

  // Pasting an outline mid-line splits it into lines here rather than in a
  // separate import box — indentation still means sub-topic.
  function paste(e: React.ClipboardEvent<HTMLTextAreaElement>, i: number) {
    const text = e.clipboardData.getData('text/plain')
    if (!sel && !text.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const caret = el.selectionStart ?? 0
    const row = rows[i]
    const tail = row.title.slice(el.selectionEnd ?? caret)

    const parsed = text.split('\n').filter((l) => l.trim()).map((line) => ({
      key: newKey(),
      title: line.replace(/^[\s]*[-*•○·]?\s*/, '').trim().slice(0, 300),
      time: '',
      where: '',
      depth: indentOf(line),
    }))
    if (!parsed.length) return

    // Pasting over a run replaces it whole rather than landing inside the line
    // the caret happened to be on.
    if (sel) { replaceRun(lo, hi, parsed, parsed[parsed.length - 1].title.length); return }

    parsed[0] = { ...parsed[0], title: row.title.slice(0, caret) + parsed[0].title, depth: row.depth }
    const last = parsed[parsed.length - 1]
    const caretAt = last.title.length
    last.title += tail

    const next = [...rows]
    next.splice(i, 1, ...parsed)
    focusNext.current = { key: last.key, caret: caretAt }
    edit(next)
  }

  const input = 'bg-transparent border-0 px-1 py-1 focus:outline-none focus:bg-zinc-800/60 rounded'

  // What the bar is aimed at: the line holding the caret, and the run it
  // stands for — itself, or the whole selection when one is held. An edit can
  // shorten the outline under a stale index, so it is clamped to what exists.
  const aim = active === null ? -1 : Math.min(active, rows.length - 1)
  const runFrom = sel ? lo : aim
  const runTo = sel ? hi : aim
  const held = sel && hi > lo ? hi - lo + 1 : 0

  return (
    <div
      // `touch-type` sizes the fields at 16px where the pointer is a thumb.
      // Under that, a tap on a line zooms the whole page in and has to be
      // pinched back out — which on a phone is every single edit.
      className={`touch-type px-3 py-2 ${active !== null ? '[@media(hover:none)]:pb-16' : ''}`}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        // Focus left the outline for good — the bar goes with it, and so does
        // the reach it was holding.
        setActive(null)
        setExtending(false)
        flush()
      }}
    >
      {rows.map((row, i) => (
        <div
          key={row.key}
          onPointerDown={(e) => {
            // Reaching for the far end of a run. Taken here rather than in the
            // mouse handler below because a tap has to be refused *before* it
            // moves the caret: letting it land would put the keyboard away,
            // scroll the line under it out of view, and drop the very
            // selection the tap is trying to draw.
            if (!extending) return
            e.preventDefault()
            setSel({ a: sel ? sel.a : focused.current, b: i })
          }}
          onMouseDown={(e) => {
            // Shift reaches from wherever the caret is to the line clicked;
            // a plain press starts a drag and drops any run already held.
            if (e.shiftKey) {
              e.preventDefault()
              const from = sel ? sel.a : focused.current
              focusNext.current = { key: row.key, caret: 0 }
              setSel({ a: from, b: i })
              return
            }
            dragFrom.current = i
            setSel(null)
          }}
          onMouseEnter={() => {
            const from = dragFrom.current
            if (from === null || from === i) return
            focusNext.current = { key: row.key, caret: 0 }
            setSel({ a: from, b: i })
          }}
          // On a phone the line comes first and its trappings follow it.
          // Ranged down the sides, a 56px time gutter and two levels of indent
          // left a topic about fifteen characters to live in — and the gutter
          // was sized for "0830", not for "Afternoon", so it truncated the one
          // thing it existed to show. The break after the title is what drops
          // the time and the where onto a quiet line of their own; on a wider
          // screen it collapses and `order` puts the columns back exactly as
          // they were.
          className={`group/row flex flex-wrap sm:flex-nowrap items-start gap-x-1 gap-y-0.5 rounded ${
            sel && i >= lo && i <= hi ? 'bg-zinc-700/50' : ''
          }`}
        >
          {row.depth === 0 ? (
            <input
              value={row.time}
              onChange={(e) => edit(rows.map((r, n) => (n === i ? { ...r, time: e.target.value } : r)))}
              tabIndex={-1}
              placeholder="time"
              title="Optional time — click to fill in"
              ref={(el) => {
                if (el) times.current.set(row.key, el)
                else times.current.delete(row.key)
              }}
              // Wide enough for "Afternoon" where it has a line to itself, and
              // back to the narrow right-ranged column where it doesn't. The
              // gutter was 56px and ranged right, which is a width for "0830"
              // and not for the words people actually write here.
              className={`order-4 sm:order-1 w-24 text-left shrink-0 sm:w-16 sm:text-right text-[11px] text-zinc-500 placeholder:text-zinc-700 ${
                row.time || metaFor === row.key ? '' : 'hidden sm:block [@media(hover:none)]:hidden'
              } ${input}`}
            />
          ) : (
            // The gutter only exists where there are columns to line up.
            <span className="hidden sm:block sm:w-16 shrink-0 sm:order-1" />
          )}
          {/* A dot for a topic, a dash for what hangs off it, and a shorter,
              fainter dash further in for the level below that — the marker gets
              quieter as it goes down, so the eye reads the column of dots as
              the spine of the day. */}
          <span
            aria-hidden
            // Shallower steps on a phone: the indent is there to be read, and
            // at 36px a third-level line started two thirds of the way across
            // a 300px card. And the marker sits against the first line of the
            // text rather than the middle of a paragraph of it.
            className={`order-1 sm:order-2 shrink-0 mt-3 ${
              row.depth === 0
                ? 'w-1 h-1 rounded-full bg-zinc-600 mx-1'
                : row.depth === 1
                  ? 'w-1.5 h-px bg-zinc-700 ml-3 sm:ml-5 mr-1'
                  : 'w-1 h-px bg-zinc-800 ml-6 sm:ml-9 mr-1.5'
            }`}
          />
          <textarea
            ref={(el) => {
              if (el) { inputs.current.set(row.key, el); fit(el) }
              else inputs.current.delete(row.key)
            }}
            rows={1}
            value={row.title}
            onChange={(e) => { fit(e.currentTarget); edit(rows.map((r, n) => (n === i ? { ...r, title: e.target.value } : r))) }}
            onKeyDown={(e) => keyDown(e, i)}
            onPaste={(e) => paste(e, i)}
            onFocus={() => { focused.current = i; setActive(i) }}
            // Named for what it does on every screen. Tab is a key a phone
            // doesn't have, and the bar under the keyboard says the rest.
            placeholder={i === 0 && rows.length === 1 ? 'Type a topic — Enter starts the next line' : ''}
            className={`order-2 sm:order-3 flex-1 min-w-0 resize-none overflow-hidden leading-snug ${
              row.depth === 0 ? 'text-sm' : row.depth === 1 ? 'text-[13px] text-zinc-300' : 'text-[12px] text-zinc-400'
            } ${input}`}
          />
          {/* The break. A full-width nothing, so what follows starts a line —
              and gone entirely once there is room for columns. */}
          <span aria-hidden className="order-3 w-full h-0 sm:hidden" />
          {/* Where this line happens, when it isn't simply where the day is.
              Kept out of the tab order like the time at the other end — the
              outline is typed, not tabbed through — and out of sight until it
              holds something or the row is hovered, because most lines have
              nothing to say here. */}
          <input
            ref={(el) => {
              if (el) wheres.current.set(row.key, el)
              else wheres.current.delete(row.key)
            }}
            value={row.where}
            onChange={(e) => edit(rows.map((r, n) => (n === i ? { ...r, where: e.target.value } : r)))}
            tabIndex={-1}
            placeholder="where"
            title="Optional — where this part of the day happens, if it differs from the day"
            // Hiding behind a hover is hiding for good on a phone, so on a
            // narrow screen this is shown when it holds something or when the
            // bar's pin has asked for it, and takes a line of its own — the
            // one thing on the row worth losing width to, and only on the few
            // lines that have anything to say here.
            className={`order-5 sm:order-4 flex-1 sm:flex-none sm:w-24 sm:shrink-0 text-[11px] text-left sm:text-right ${
              row.where || metaFor === row.key ? '' : 'hidden sm:block [@media(hover:none)]:hidden'
            } ${input} ${
              row.where
                ? 'text-zinc-500'
                : 'text-zinc-500 placeholder:text-zinc-800 sm:opacity-0 focus:opacity-100 sm:group-hover/row:opacity-100'
            }`}
          />
        </div>
      ))}
      <div className="flex items-center justify-between pl-0 sm:pl-[4.5rem] pt-1">
        {/* Two lines for the same job, because the keys named here are keys a
            phone doesn't have. Where there are none, the bar is the answer and
            the only thing worth saying is what is currently held. */}
        <p className="text-[10px] text-zinc-700 [@media(hover:none)]:hidden">
          {sel && hi > lo
            ? `${hi - lo + 1} lines · Tab indents · Alt+↑↓ moves them · ⌫ deletes`
            : 'Tab indents · Shift+Tab outdents · Alt+↑↓ moves a line · Shift+↑↓ selects'}
        </p>
        <p className="hidden text-[10px] text-zinc-700 [@media(hover:none)]:block">
          {extending
            ? (sel && hi > lo ? `${hi - lo + 1} lines held — tap another to reach further` : 'Tap another line to reach it')
            : sel && hi > lo ? `${hi - lo + 1} lines held` : 'Tap a line to edit it'}
        </p>
        <span className={`text-[10px] transition-opacity ${saving ? 'text-zinc-500 opacity-100' : 'opacity-0'}`}>
          Saving…
        </span>
      </div>

      {/* The bar.
          
          Everything the outline can do that isn't typing, within a thumb's
          reach of the line being typed: in, out, up, down, reach, where, gone.
          It sits on the keyboard's top edge rather than the window's, because
          the window's is underneath the keyboard.

          Nothing here takes focus. A press that blurred the field would put
          the keyboard away, scroll the line out from under the thumb and drop
          the run — so the whole bar refuses the press that would do it, and
          every button works on the line the caret is still sitting in. */}
      {aim >= 0 && rows[aim] && (
        <div
          style={{ bottom: kb }}
          onPointerDown={(e) => e.preventDefault()}
          className="fixed inset-x-0 z-40 hidden [@media(hover:none)]:flex items-center gap-0.5 overflow-x-auto no-scrollbar border-t border-zinc-700 bg-zinc-900/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/80"
        >
          <Key label="Outdent" onPress={() => indentBy(-1, runFrom, runTo, aim, caretIn(rows[aim].key))}
            d="M21 6H10M21 12H10M21 18H10M7 8l-4 4 4 4" />
          <Key label="Indent" onPress={() => indentBy(1, runFrom, runTo, aim, caretIn(rows[aim].key))}
            d="M21 6H10M21 12H10M21 18H10M3 8l4 4-4 4" />
          <Key label="Move up" onPress={() => moveBy(-1, runFrom, runTo, aim, caretIn(rows[aim].key))}
            d="M12 19V5M5 12l7-7 7 7" />
          <Key label="Move down" onPress={() => moveBy(1, runFrom, runTo, aim, caretIn(rows[aim].key))}
            d="M12 5v14M19 12l-7 7-7-7" />
          <Key
            label={extending ? 'Stop reaching' : 'Select lines'}
            on={extending}
            onPress={() => {
              // On: the line the caret is in is the anchor, held and lit, so
              // the next tap has something visible to reach from.
              if (extending) { setExtending(false); setSel(null) }
              else { setExtending(true); setSel({ a: aim, b: aim }) }
            }}
            d="M9 4H5v4M15 4h4v4M9 20H5v-4M15 20h4v-4M4 12h16"
          />
          {/* A drag across two bullets selects nothing: each line is its own
              field and the browser will not carry a selection between two of
              them. Reaching is the way, so while it is on the bar says so —
              at the bottom of the outline the same words are under the
              keyboard, which is no place to explain anything. */}
          {extending && (
            <span className="shrink-0 whitespace-nowrap px-1 text-[11px] text-zinc-400">
              {held > 1 ? `${held} lines` : 'tap a line'}
            </span>
          )}
          <Key
            label="Time and place for this line"
            on={metaFor === rows[aim].key}
            onPress={() => {
              if (metaFor === rows[aim].key) {
                setMetaFor(null)
                inputs.current.get(rows[aim].key)?.focus()
              } else setMetaFor(rows[aim].key)
            }}
            d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2"
          />
          <Key label={held > 1 ? `Delete ${held} lines` : 'Delete line'} danger onPress={() => replaceRun(runFrom, runTo, [])}
            d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          <Key label="Done" className="ml-auto" onPress={() => inputs.current.get(rows[aim].key)?.blur()}
            d="M6 9l6 6 6-6" />
        </div>
      )}
    </div>
  )
}

// One key of the bar. Sized for a thumb rather than for the 11px type around
// it — a control you reach for in a parking lot at seven in the morning is not
// a control to make small.
//
// It acts on the press, not on a click. The bar cannot let a press land or the
// field loses focus and the keyboard goes down with it — but cancelling the
// press also cancels the compatibility events the browser would have
// synthesised from it, and whether `click` is among them is up to the browser.
// Safari sometimes sent one and sometimes didn't, which is exactly what a
// toolbar that works about half the time looks like. Nothing here waits for a
// click any more: the press is the event.
function Key({
  label,
  d,
  onPress,
  on,
  danger,
  className = '',
}: {
  label: string
  d: string
  onPress: () => void
  /** Lit, because it is a mode rather than a press — reaching, and the where. */
  on?: boolean
  danger?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress() }}
      // The press already did it. Without this, a browser that does synthesise
      // the click runs the whole thing twice — two indents for one press.
      onClick={(e) => e.preventDefault()}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`shrink-0 select-none touch-manipulation rounded p-2.5 transition-colors ${
        on
          ? 'bg-zinc-700 text-white'
          : danger
            ? 'text-zinc-400 active:bg-zinc-800 active:text-red-400'
            : 'text-zinc-300 active:bg-zinc-800 active:text-white'
      } ${className}`}
    >
      <svg
        aria-hidden
        xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </button>
  )
}

const blankRow = (): Row => ({ key: newKey(), title: '', time: '', where: '', depth: 0 })

// How far in a pasted line was written: two spaces or a tab per level, and a
// hollow bullet counts as one level in the way it does in a word processor.
function indentOf(line: string): Depth {
  const lead = line.match(/^\s*/)?.[0] ?? ''
  const levels = Math.floor(lead.replace(/\t/g, '  ').length / 2)
  const marked = /^\s*[○·]/.test(line) ? 1 : 0
  return Math.min(Math.max(levels, marked), MAX_DEPTH) as Depth
}

// Flatten the stored tree back to lines. A day with nothing on it still gets
// one empty line, so there's always somewhere to start typing.
function fromBlocks(blocks: ScheduleBlock[]): Row[] {
  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order)
  const rows: Row[] = []
  const walk = (parent: string | null, depth: Depth) => {
    for (const b of sorted.filter((x) => x.parent_id === parent)) {
      // Only a topic carries a time — the levels under it are what happens
      // inside that slot, and the editor gives them no field to type one in.
      rows.push({
        key: newKey(),
        title: b.title,
        time: depth === 0 ? b.time_label ?? '' : '',
        where: b.location ?? '',
        depth,
      })
      if (depth < MAX_DEPTH) walk(b.id, (depth + 1) as Depth)
    }
  }
  walk(null, 0)
  return rows.length ? rows : [blankRow()]
}
