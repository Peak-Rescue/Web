'use client'

import { useState } from 'react'

// One of the three stacked money sections on a course: cost, quotes, actuals.
//
// Which one is open follows the course rather than the reader: before it runs,
// the live question is what to charge, and once it starts the live question is
// what it cost. So the estimate and the quote fold away on the first day and
// the actuals open.
//
// A default, never a lock. A course that already ran still gets its estimate
// argued about, and the folded head carries its number so the argument can be
// had without opening anything.
//
// Open state lives in client state rather than on the DOM node, because every
// save in the actuals panel calls router.refresh(), and a `<details open>`
// re-rendered from the server would snap shut under whoever had just opened it.
export default function PricingFold({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string
  /** What the section says while closed — the number, so folding it away
      costs nothing at a glance. */
  summary?: React.ReactNode
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="border-t border-zinc-800 first:border-t-0 py-4 first:pt-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-baseline justify-between gap-4 text-left group"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-zinc-600 text-xs w-3 shrink-0">{open ? '▾' : '▸'}</span>
          <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
            {title}
          </span>
        </span>
        {!open && summary && <span className="text-xs text-zinc-500 truncate">{summary}</span>}
      </button>
      {open && <div className="mt-3 pl-5">{children}</div>}
    </section>
  )
}
