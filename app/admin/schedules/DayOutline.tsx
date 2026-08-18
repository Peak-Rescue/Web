'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { replaceDayOutline, touchDay } from './actions'
import type { ScheduleBlock } from './ScheduleEditor'

type Row = { key: string; title: string; time: string; depth: 0 | 1 }
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

  const push = useCallback(async (first: Job) => {
    if (inFlight.current) { queued.current = first; return }
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
            job.rows.map((r) => ({ title: r.title, timeLabel: r.time, depth: r.depth })),
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

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const rows = pending.current
    pending.current = null
    if (rows) void push({ rows, quiet: false })
    else if (owed.current) { owed.current = false; void touchDay(dayId).catch(() => {}) }
  }, [push, dayId])

  const edit = useCallback((next: Row[]) => {
    setRows(next)
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
  useEffect(() => () => flushRef.current(), [])

  function keyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
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
      const created: Row = { key: newKey(), title: after, time: '', depth: row.depth }
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
    // than a drag.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault()
      const to = e.key === 'ArrowUp' ? i - 1 : i + 1
      if (to < 0 || to >= rows.length) return
      const next = [...rows]
      next.splice(to, 0, next.splice(i, 1)[0])
      focusNext.current = { key: row.key, caret }
      edit(next)
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

    if (e.key === 'Escape') el.blur()
  }

  // Pasting an outline mid-line splits it into lines here rather than in a
  // separate import box — indentation still means sub-topic.
  function paste(e: React.ClipboardEvent<HTMLInputElement>, i: number) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const caret = el.selectionStart ?? 0
    const row = rows[i]
    const tail = row.title.slice(el.selectionEnd ?? caret)

    const parsed = text.split('\n').filter((l) => l.trim()).map((line) => ({
      key: newKey(),
      title: line.replace(/^[\s]*[-*•○·]?\s*/, '').trim().slice(0, 300),
      time: '',
      depth: (/^(\s{2,}|\t|\s*[○·])/.test(line) ? 1 : 0) as 0 | 1,
    }))
    if (!parsed.length) return

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
        <div key={row.key} className="flex items-center gap-1 group">
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
            placeholder={i === 0 && rows.length === 1 ? 'Type a topic — Tab indents, Enter starts the next line' : ''}
            className={`flex-1 min-w-0 ${row.depth === 1 ? 'text-[13px] text-zinc-300' : 'text-sm'} ${input}`}
          />
        </div>
      ))}
      <div className="flex items-center justify-between pl-[4.5rem] pt-1">
        <p className="text-[10px] text-zinc-700">
          Tab indents · Shift+Tab outdents · Alt+↑↓ moves a line
        </p>
        <span className={`text-[10px] transition-opacity ${saving ? 'text-zinc-500 opacity-100' : 'opacity-0'}`}>
          Saving…
        </span>
      </div>
    </div>
  )
}

const blankRow = (): Row => ({ key: newKey(), title: '', time: '', depth: 0 })

// Flatten the stored tree back to lines. A day with nothing on it still gets
// one empty line, so there's always somewhere to start typing.
function fromBlocks(blocks: ScheduleBlock[]): Row[] {
  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order)
  const rows: Row[] = []
  for (const t of sorted.filter((b) => !b.parent_id)) {
    rows.push({ key: newKey(), title: t.title, time: t.time_label ?? '', depth: 0 })
    for (const c of sorted.filter((b) => b.parent_id === t.id)) {
      rows.push({ key: newKey(), title: c.title, time: '', depth: 1 })
    }
  }
  return rows.length ? rows : [blankRow()]
}
