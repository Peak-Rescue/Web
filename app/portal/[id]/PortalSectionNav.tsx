'use client'

import { Fragment, useEffect, useState } from 'react'

// Sticky jump bar for the course page. It only lists sections that actually
// rendered, and highlights the one you're reading so a long course still feels
// like a handful of named parts rather than one scroll.
export default function PortalSectionNav({
  sections,
  leading,
  trailing,
}: {
  sections: { id: string; label: string; team?: boolean; unread?: boolean }[]
  /** Pinned to the left, before the jump links: which job the bar is showing. */
  leading?: React.ReactNode
  /** Pinned to the right of the same sticky bar. The viewing-as toggle lives
      here so that which role you are reading as travels down the page with
      you — knowing you are in a preview matters most at the moment you find a
      control missing, which is never at the top. */
  trailing?: React.ReactNode
}) {
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      // Top band of the viewport, just under the sticky header.
      { rootMargin: '-128px 0px -65% 0px' }
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [sections])

  // The bar earns its place for the jump links, but the toggle has to stay on
  // screen even on a course too short to need them.
  if (sections.length < 2 && !trailing && !leading) return null

  return (
    <nav className="sticky top-16 md:top-20 z-20 -mx-4 px-4 mb-8 bg-zinc-950/90 backdrop-blur border-b border-zinc-900">
      <div className="flex items-center gap-2">
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex gap-1 overflow-x-auto py-2 no-scrollbar flex-1 min-w-0">
        {/* The bar is also the key: where you are is accented rather than
            grey-on-grey, team blocks are amber wherever they appear, and a dot
            marks the one section with something new in it. */}
        {sections.map((s, i) => (
          <Fragment key={s.id}>
          <a
            href={`#${s.id}`}
            className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              active === s.id
                ? s.team
                  ? 'border-amber-600 bg-amber-500/15 text-amber-200'
                  : 'border-pr-red bg-pr-red/15 text-white'
                : s.team
                  ? 'border-transparent text-amber-600/90 hover:text-amber-300 hover:bg-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {s.label}
            {s.unread && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-pr-red-light" />}
          </a>
          </Fragment>
        ))}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
    </nav>
  )
}
