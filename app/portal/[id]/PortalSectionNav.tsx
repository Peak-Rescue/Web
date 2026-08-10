'use client'

import { useEffect, useState } from 'react'

// Sticky jump bar for the course page. It only lists sections that actually
// rendered, and highlights the one you're reading so a long course still feels
// like a handful of named parts rather than one scroll.
export default function PortalSectionNav({
  sections,
}: {
  sections: { id: string; label: string }[]
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

  if (sections.length < 2) return null

  return (
    <nav className="sticky top-16 md:top-20 z-20 -mx-4 px-4 mb-8 bg-zinc-950/90 backdrop-blur border-b border-zinc-900">
      <div className="flex gap-1 overflow-x-auto py-2 no-scrollbar">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              active === s.id
                ? 'border-zinc-600 bg-zinc-800 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
