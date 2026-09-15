'use client'

import { useState } from 'react'
import { setPricingRateDefault } from '@/app/admin/courses/finance-actions'

// Whether a rate is pre-added to every new course estimate.
//
// Was a button reading "Make default" / "Default line ✓" — the widest thing
// in its column, saying twice over what a column heading says once. A tick
// box under a heading called Default is the same fact in a sixteenth of the
// room, and it looks like what it is: a property of the row, not an action
// you take on it.
export default function DefaultLineToggle({ rateId, initialValue }: { rateId: string; initialValue: boolean }) {
  const [on, setOn] = useState(initialValue)
  const [busy, setBusy] = useState(false)

  return (
    <label
      className="flex md:justify-center items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer"
      title="Pre-added to every new course estimate"
    >
      {/* Deliberately nameless: FormData skips unnamed controls, so this is
          neither submitted with the rate nor counted as an unsaved change by
          the Save button watching the same form. */}
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.checked
          setOn(next)
          setBusy(true)
          try {
            await setPricingRateDefault(rateId, next)
          } catch {
            // Put the box back rather than leaving it claiming something the
            // server never agreed to.
            setOn(!next)
          } finally {
            setBusy(false)
          }
        }}
        className="accent-teal-600 disabled:opacity-50"
      />
      {/* The column heading carries this from md up; below that there is no
          heading, so the box names itself. */}
      <span className="md:hidden">Default line</span>
    </label>
  )
}
