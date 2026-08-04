'use client'

import { useEffect, useRef } from 'react'

// Remembers whether a section is open, per section, across courses and visits.
// Most people care about one or two sections of a course page; having Estimates
// and Quotes expanded on every visit is noise they've already decided about.
//
// State lives on the <details> element itself rather than in React, so there's
// no hydration mismatch and no re-render when it changes.
export default function StickySection({
  id,
  defaultOpen = true,
  children,
}: {
  id: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const key = `course-section:${id}`

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const stored = localStorage.getItem(key)
    if (stored !== null) el.open = stored === '1'
    const onToggle = () => localStorage.setItem(key, el.open ? '1' : '0')
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [key])

  return (
    <details ref={ref} id={id} open={defaultOpen} className="mb-8 group scroll-mt-32">
      {children}
    </details>
  )
}
