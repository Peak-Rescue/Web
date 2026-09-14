'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmtMonth = (ym: string) =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The month heading, as the way to any other month.
 *
 *  Stepping an arrow is right for next month and absurd for next summer —
 *  eight presses out and eight back. The heading already says which month you
 *  are on, so it is the natural place to say which month you want.
 *
 *  Two ways to move, because it serves two calendars. A server-rendered one
 *  navigates, and is handed a href per month; a painted one keeps its month in
 *  state and is handed onPick. Months carrying work read bright and empty ones
 *  dim — that is the question you are really asking when you jump a long way
 *  out — but both are links: this is a map of the work, not a filter on it.
 */
export default function MonthJump({
  month,
  years,
  busy,
  hrefs,
  onPick,
}: {
  month: string
  years: number[]
  busy?: string[]
  hrefs?: Record<string, string>
  onPick?: (ym: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const carries = new Set(busy ?? [])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const cellClass = (ym: string) =>
    `rounded px-1 py-1 text-center text-[11px] transition-colors ${
      ym === month
        ? 'bg-pr-red font-semibold text-white'
        : carries.has(ym)
          ? 'text-zinc-200 hover:bg-zinc-800'
          : 'text-zinc-600 hover:bg-zinc-800'
    }`

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
      >
        {fmtMonth(month)}
        <span className={`text-[8px] text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          {years.map((yr) => (
            <div key={yr} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-zinc-500">{yr}</p>
              <div className="grid grid-cols-4 gap-0.5">
                {MONTH_ABBR.map((abbr, idx) => {
                  const ym = `${yr}-${String(idx + 1).padStart(2, '0')}`
                  return hrefs ? (
                    <Link key={ym} href={hrefs[ym] ?? '#'} scroll={false} onClick={() => setOpen(false)} className={cellClass(ym)}>
                      {abbr}
                    </Link>
                  ) : (
                    <button
                      key={ym}
                      type="button"
                      onClick={() => {
                        onPick?.(ym)
                        setOpen(false)
                      }}
                      className={cellClass(ym)}
                    >
                      {abbr}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
