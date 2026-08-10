'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// A refresh that doesn't move the page under you.
//
// Editors that write optimistically — the gear list, the catalog — draw the
// result themselves and call router.refresh() only to pick up what the server
// decided: real ids, recalculated counts. Two things made that unpleasant.
//
// One refresh per click meant six items added to a list rebuilt the course page
// six times, so the trip is delayed until the writing stops and only the last
// one is made. And when the payload lands the browser can end up at the top of
// the page — the document is re-laid-out around a scroll position it no longer
// agrees with, and globals.css asks for smooth scrolling, so the page visibly
// glides away from the row just edited. So the position is held briefly across
// the update, and let go the moment the reader scrolls themselves, since after
// that it isn't ours to hold.

const QUIET_MS = 500
const HOLD_MS = 800

export function useSteadyRefresh() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null

      const { scrollX: x, scrollY: y } = window
      router.refresh()

      // Anything below means the reader has taken the page back.
      const taken = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
      const until = Date.now() + HOLD_MS
      let held = true
      const release = () => {
        held = false
        for (const ev of taken) window.removeEventListener(ev, release)
      }
      for (const ev of taken) window.addEventListener(ev, release, { passive: true })

      const hold = () => {
        if (!held) return
        if (window.scrollY !== y || window.scrollX !== x) window.scrollTo({ top: y, left: x, behavior: 'instant' })
        if (Date.now() < until) requestAnimationFrame(hold)
        else release()
      }
      requestAnimationFrame(hold)
    }, QUIET_MS)
  }, [router])
}
