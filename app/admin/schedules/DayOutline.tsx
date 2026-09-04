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
type Row = { key: string; title: string; time: string; where: string; depth: 0 | 1 }
type Job = { rows: Row[]; quiet: boolean }

let seq = 0
const newKey = () => `r${++seq}`

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

  const inputs = useRef(new Map<string, HTMLInputElement>())
  const focusNext = useRef<{ key: string; caret: number } | null>(null)

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

  const edit = useCallback((next: Row[]) => {
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
    rows.slice(from, to + 1).map((r) => (r.depth === 1 ? '  ' : '') + r.title).join('\n')

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

  // Keys that mean something to a run of lines rather than to a caret. Runs
  // through before the single-line handling below, and falls through to it
  // when there's no run.
  function runKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
        focusNext.current = { key: rows[at].key, caret: down ? rows[at].title.length : 0 }
        setSel(null)
      }
      return true
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const depth: 0 | 1 = e.shiftKey ? 0 : 1
      const next = rows.map((r, n) =>
        // The first line of a day has nothing to hang off, so it stays a topic
        // even when the rest of the run indents around it.
        n >= lo && n <= hi && !(depth === 1 && n === 0) ? { ...r, depth } : r
      )
      focusNext.current = { key: rows[hi].key, caret: 0 }
      edit(next)
      setSel(sel)
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
      focusNext.current = { key: rows[at].key, caret: e.key === 'ArrowLeft' ? 0 : rows[at].title.length }
      setSel(null)
      return true
    }

    // A modifier held on its own isn't a keystroke yet, and a shortcut this
    // doesn't claim — paste above all — has to reach the browser intact.
    if (e.metaKey || e.ctrlKey) return false
    return !['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)
  }

  function keyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (sel && runKeyDown(e)) return
    const el = e.currentTarget
    const caret = el.selectionStart ?? 0
    const selected = (el.selectionEnd ?? 0) !== caret
    const row = rows[i]

    if (e.key === 'Enter') {
      e.preventDefault()
      // An empty sub-topic pops back out to a topic before it starts a new
      // line — the same escape hatch a word processor gives you.
      if (!row.title && row.depth === 1) {
        edit(rows.map((r, n) => (n === i ? { ...r, depth: 0 as const } : r)))
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
      const depth: 0 | 1 = e.shiftKey ? 0 : 1
      // Nothing to hang off: the first line of a day stays a topic.
      if (depth === 1 && i === 0) return
      if (row.depth === depth) return
      focusNext.current = { key: row.key, caret }
      edit(rows.map((r, n) => (n === i ? { ...r, depth } : r)))
      return
    }

    if (e.key === 'Backspace' && caret === 0 && !selected) {
      if (row.depth === 1) {
        e.preventDefault()
        focusNext.current = { key: row.key, caret: 0 }
        edit(rows.map((r, n) => (n === i ? { ...r, depth: 0 as const } : r)))
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
      const up = e.key === 'ArrowUp'
      const from = sel ? lo : i
      const to = sel ? hi : i
      const landing = up ? from - 1 : to + 1
      if (landing < 0 || landing >= rows.length) return
      const next = [...rows]
      const moved = next.splice(from, to - from + 1)
      next.splice(up ? from - 1 : from + 1, 0, ...moved)
      focusNext.current = { key: row.key, caret }
      edit(next)
      if (sel) setSel({ a: up ? lo - 1 : lo + 1, b: up ? hi - 1 : hi + 1 })
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

    if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault()
      focusNext.current = { key: rows[i - 1].key, caret }
      setRows([...rows])
      return
    }
    if (e.key === 'ArrowDown' && i < rows.length - 1) {
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
  function paste(e: React.ClipboardEvent<HTMLInputElement>, i: number) {
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
      depth: (/^(\s{2,}|\t|\s*[○·])/.test(line) ? 1 : 0) as 0 | 1,
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

  return (
    <div
      className="px-3 py-2"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) flush() }}
    >
      {rows.map((row, i) => (
        <div
          key={row.key}
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
          className={`group/row flex items-center gap-1 rounded ${
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
              className={`w-16 shrink-0 text-[11px] text-zinc-500 text-right placeholder:text-zinc-700 ${input}`}
            />
          ) : (
            <span className="w-16 shrink-0" />
          )}
          <span
            aria-hidden
            className={`shrink-0 ${
              row.depth === 1 ? 'w-1.5 h-px bg-zinc-700 ml-5 mr-1' : 'w-1 h-1 rounded-full bg-zinc-600 mx-1'
            }`}
          />
          <input
            ref={(el) => {
              if (el) inputs.current.set(row.key, el)
              else inputs.current.delete(row.key)
            }}
            value={row.title}
            onChange={(e) => edit(rows.map((r, n) => (n === i ? { ...r, title: e.target.value } : r)))}
            onKeyDown={(e) => keyDown(e, i)}
            onPaste={(e) => paste(e, i)}
            onFocus={() => { focused.current = i }}
            placeholder={i === 0 && rows.length === 1 ? 'Type a topic — Tab indents, Enter starts the next line' : ''}
            className={`flex-1 min-w-0 ${row.depth === 1 ? 'text-[13px] text-zinc-300' : 'text-sm'} ${input}`}
          />
          {/* Where this line happens, when it isn't simply where the day is.
              Kept out of the tab order like the time at the other end — the
              outline is typed, not tabbed through — and out of sight until it
              holds something or the row is hovered, because most lines have
              nothing to say here. */}
          <input
            value={row.where}
            onChange={(e) => edit(rows.map((r, n) => (n === i ? { ...r, where: e.target.value } : r)))}
            tabIndex={-1}
            placeholder="where"
            title="Optional — where this part of the day happens, if it differs from the day"
            className={`w-24 shrink-0 text-[11px] text-right ${input} ${
              row.where
                ? 'text-zinc-500'
                : 'text-zinc-500 placeholder:text-zinc-800 opacity-0 focus:opacity-100 group-hover/row:opacity-100'
            }`}
          />
        </div>
      ))}
      <div className="flex items-center justify-between pl-[4.5rem] pt-1">
        <p className="text-[10px] text-zinc-700">
          {sel && hi > lo
            ? `${hi - lo + 1} lines · Tab indents · Alt+↑↓ moves them · ⌫ deletes`
            : 'Tab indents · Shift+Tab outdents · Alt+↑↓ moves a line · Shift+↑↓ selects'}
        </p>
        <span className={`text-[10px] transition-opacity ${saving ? 'text-zinc-500 opacity-100' : 'opacity-0'}`}>
          Saving…
        </span>
      </div>
    </div>
  )
}

const blankRow = (): Row => ({ key: newKey(), title: '', time: '', where: '', depth: 0 })

// Flatten the stored tree back to lines. A day with nothing on it still gets
// one empty line, so there's always somewhere to start typing.
function fromBlocks(blocks: ScheduleBlock[]): Row[] {
  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order)
  const rows: Row[] = []
  for (const t of sorted.filter((b) => !b.parent_id)) {
    rows.push({ key: newKey(), title: t.title, time: t.time_label ?? '', where: t.location ?? '', depth: 0 })
    for (const c of sorted.filter((b) => b.parent_id === t.id)) {
      rows.push({ key: newKey(), title: c.title, time: '', where: c.location ?? '', depth: 1 })
    }
  }
  return rows.length ? rows : [blankRow()]
}
