'use client'

import Link from 'next/link'

// Building a course and running one are different jobs with different halves
// of this page, and one strip of tabs cannot hold both — ordering them was an
// attempt at it and failed, because order is the weakest signal there is when
// the thing you want is off the side of a scrolling bar.
//
// So the bar shows one job at a time.
//
// Build is the sequence a course is actually assembled in: what the client
// asked for, what it costs, the gear that changes what it costs, who teaches
// it, what they teach, where, when, who comes, and what they sign. Teach is
// the short list you need with a phone in your hand: today's plan, telling
// people about it, and who has signed.
//
// The ones you touch mid-course but for next time — curriculum links, a
// resource you missed, a gear list to fix — sit in Build, because that is what
// editing them is.
export default function CourseMode({
  mode,
  href,
}: {
  mode: 'build' | 'teach'
  /** Same page, one query away — the mode is in the URL so a link to a course
      can carry it and a reload cannot lose it. */
  href: (mode: 'build' | 'teach') => string
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-medium">
      {(['build', 'teach'] as const).map((m) => (
        <Link
          key={m}
          href={href(m)}
          scroll={false}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {m === 'build' ? 'Build' : 'Teach'}
        </Link>
      ))}
    </div>
  )
}
