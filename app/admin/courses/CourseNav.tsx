'use client'

import { useEffect, useRef, useState } from 'react'

// The course page serves four unrelated jobs — planning, staffing, money,
// delivery — and you open it to do one of them. This bar keeps the sections
// one click apart instead of one scroll, and marks where you are.

export type NavSection = { id: string; label: string }

export default function CourseNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Whichever section is nearest the top of the viewport wins.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-100px 0px -70% 0px' }
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [sections])

  return (
    <div
      ref={ref}
      className="sticky top-16 md:top-20 z-30 -mx-4 px-4 py-2 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 mb-6"
    >
      <nav className="flex gap-1 overflow-x-auto text-xs">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => {
              // Opening a collapsed section on jump, so the anchor isn't a
              // scroll to a closed header.
              const el = document.getElementById(s.id)
              if (el instanceof HTMLDetailsElement) el.open = true
            }}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
              active === s.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  )
}
