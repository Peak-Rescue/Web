'use client'

import { useEffect } from 'react'

/** Takes the reader to a row that was just created.
 *
 *  These lists are added to from a form at the foot of the page, and the row
 *  lands wherever the list's order puts it — usually above the fold, often
 *  behind a section heading nobody was looking at. From where you are
 *  standing, the only sign anything happened is the form going blank, which
 *  is also what a silent failure looks like. So the create redirects back
 *  with `?added=<id>` and this scrolls to the row and marks it for a beat —
 *  long enough to pick it out of a list of near-identical ones, short enough
 *  not to become part of how the row looks.
 *
 *  The mark goes on imperatively rather than through the row's own props:
 *  every one of these lists is server-rendered, and threading a "you are the
 *  new one" flag down through three different row components to say something
 *  that lasts two seconds is a lot of ceremony for a highlight. */
export default function JumpToNewRow({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const marks = ['ring-2', 'ring-teal-400/70', 'ring-offset-2', 'ring-offset-zinc-950']
    el.classList.add(...marks)
    const t = setTimeout(() => el.classList.remove(...marks), 2500)
    return () => {
      clearTimeout(t)
      el.classList.remove(...marks)
    }
  }, [targetId])

  return null
}
