'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { todayIn } from '@/lib/course-clock'

// Picking the course an expense belongs to. Nine times in ten it's a course
// the person is staffed on and either just finished or is about to start, so
// that's the whole opening view — their courses, nearest to today first.
// Everything else (other people's courses, older or further out) is one click
// or one keystroke away behind the search box, not mixed into the first list.

export type CourseOption = {
  id: string
  label: string
  mine?: boolean
  starts_at?: string | null
}

const NEAR_LIMIT = 6

// The reader's own clock. This runs in the instructor's browser and sorts
// their courses into upcoming and past, so the day it is where they are
// standing is the right answer — and toISOString would have said UTC, which
// is tomorrow for half their evening.
function today() {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone)
}

// Upcoming soonest-first, then past most-recent-first: closeness to today,
// with the future winning ties. Undated instances sit at the end.
function byProximity(a: CourseOption, b: CourseOption) {
  const now = today()
  const aUp = a.starts_at ? a.starts_at >= now : false
  const bUp = b.starts_at ? b.starts_at >= now : false
  if (!a.starts_at || !b.starts_at) return (a.starts_at ? 0 : 1) - (b.starts_at ? 0 : 1)
  if (aUp !== bUp) return aUp ? -1 : 1
  return aUp ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)
}

export default function CoursePicker({
  courses,
  value,
  onChange,
  noneLabel = '— none / general —',
  className,
}: {
  courses: CourseOption[]
  value: string
  onChange: (id: string) => void
  noneLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = courses.find((c) => c.id === value)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      const hits = courses.filter((c) => c.label.toLowerCase().includes(q))
      const mine = hits.filter((c) => c.mine).sort(byProximity)
      const others = hits.filter((c) => !c.mine).sort(byProximity)
      return [
        { title: 'Your courses', items: mine },
        { title: 'Other courses', items: others },
      ].filter((g) => g.items.length > 0)
    }
    const now = today()
    const mine = courses.filter((c) => c.mine)
    const upcoming = mine.filter((c) => c.starts_at && c.starts_at >= now).sort(byProximity)
    const recent = mine.filter((c) => !c.starts_at || c.starts_at < now).sort(byProximity)
    const base = [
      { title: 'Upcoming', items: showAll ? upcoming : upcoming.slice(0, NEAR_LIMIT) },
      { title: 'Recent', items: showAll ? recent : recent.slice(0, NEAR_LIMIT) },
    ]
    if (showAll) base.push({ title: 'Other courses', items: courses.filter((c) => !c.mine).sort(byProximity) })
    return base.filter((g) => g.items.length > 0)
  }, [courses, query, showAll])

  // Flat order for keyboard navigation — the "none" row is always first.
  const flat = useMemo(() => [{ id: '', label: noneLabel } as CourseOption, ...groups.flatMap((g) => g.items)], [groups, noneLabel])
  const hidden = !query.trim() && !showAll ? courses.length - (flat.length - 1) : 0

  useEffect(() => setCursor(0), [query, showAll, open])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
    setShowAll(false)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, Math.min(flat.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[cursor]) pick(flat[cursor].id)
    }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-cursor="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const rowCls = (active: boolean) =>
    `w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
      active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800'
    }`

  let index = 0

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${className ?? ''} text-left flex items-center justify-between gap-2`}
      >
        <span className={`truncate ${selected ? '' : 'text-zinc-500'}`}>{selected?.label ?? noneLabel}</span>
        <span className="shrink-0 text-zinc-500">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search all courses…"
            className="w-full mb-1 px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            {(() => {
              const i = index++
              return (
                <button type="button" data-cursor={cursor === i ? '1' : undefined} onClick={() => pick('')} className={rowCls(cursor === i)}>
                  {noneLabel}
                </button>
              )
            })()}
            {groups.map((g) => (
              <div key={g.title}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{g.title}</p>
                <ul>
                  {g.items.map((c) => {
                    const i = index++
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          data-cursor={cursor === i ? '1' : undefined}
                          onClick={() => pick(c.id)}
                          className={`${rowCls(cursor === i)} truncate ${c.id === value ? 'font-medium' : ''}`}
                        >
                          {c.id === value ? '✓ ' : ''}
                          {c.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="px-3 py-2 text-sm text-zinc-500">
                {query.trim() ? 'No matching courses' : 'No courses assigned to you'}
              </p>
            )}
          </div>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full mt-1 px-3 py-1.5 text-left text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Show all {courses.length} courses
            </button>
          )}
        </div>
      )}
    </div>
  )
}
