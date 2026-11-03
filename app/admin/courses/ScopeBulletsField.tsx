'use client'

import { useState } from 'react'

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

// The label a seeded line starts with — "Duration", "Participants",
// "Location" — which is how a line typed over is still recognised as the
// course's.
const labelOf = (line: string) => line.match(/^([^:]{1,40}):/)?.[1].trim().toLowerCase() ?? null

/** A draft quote's scope lines, and a word when the ones copied from the course
 *  no longer match it. The lines are text the moment the quote is made, so a
 *  course that loses two days goes on saying seven until somebody notices.
 *
 *  Only lines whose label the course still writes are compared, and a line
 *  somebody deleted is not put back: leaving the location off is a decision. */
export default function ScopeBulletsField({ initial, fromCourse }: { initial: string[]; fromCourse: string[] }) {
  const [text, setText] = useState(initial.join('\n'))

  const lines = text.split('\n')
  const stale = fromCourse.flatMap((want) => {
    const label = labelOf(want)
    const at = lines.findIndex((l) => labelOf(l) === label)
    return at >= 0 && lines[at].trim() !== want ? [{ at, have: lines[at].trim(), want }] : []
  })

  function update() {
    const next = [...lines]
    for (const s of stale) next[s.at] = s.want
    setText(next.join('\n'))
  }

  return (
    <>
      <textarea name="scope_bullets" rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} resize-y`} />
      {stale.length > 0 && (
        <div className="mt-1 text-[11px] flex items-center gap-2 flex-wrap">
          <span className="text-amber-500/80">The course has changed since these were written</span>
          <span className="text-zinc-500 min-w-0">{stale.map((s) => s.want).join(' · ')}</span>
          <button type="button" onClick={update} className="text-zinc-400 hover:text-white underline underline-offset-2 transition-colors">
            Update
          </button>
          <span className="text-zinc-600">then save the quote</span>
        </div>
      )}
    </>
  )
}
