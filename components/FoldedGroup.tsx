'use client'

import { useState } from 'react'

// A folded group whose contents exist only once it is open.
//
// A <details> renders everything inside it whether or not anybody opens it,
// so a shelf holding every row of every type — which is what a group has to
// hold to be a group — would build three hundred editor forms to show seven
// headings. This builds none of them until the heading is clicked.
//
// The children are rendered on the server either way; what is saved is the
// DOM, which is the part that costs anything to make and to keep.
export default function FoldedGroup({
  heading,
  count,
  defaultOpen = false,
  children,
}: {
  heading: React.ReactNode
  count: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full cursor-pointer flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors py-1.5"
      >
        <span aria-hidden className={`text-zinc-600 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        {heading}
        <span className="text-zinc-600 font-normal">{count}</span>
      </button>
      {open && <div className="pt-1 pb-3">{children}</div>}
    </div>
  )
}
