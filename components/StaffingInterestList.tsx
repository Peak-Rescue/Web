import Link from 'next/link'

export type InterestItem = {
  token: string
  title: string
  client: string | null
  meta: string
}

export type AnsweredItem = InterestItem & {
  /** The reply on file. */
  interested: boolean
  /** Every slot has a name and one of them is leading. */
  filled: boolean
  crew: number
  wanted: number
}

// Portal-home staffing summary: the courses that have asked for you. Each row
// is a door to the tokenized staffing page, which is where the answering
// happens.
//
// It used to answer here too — two buttons on the row, flipping the reply in
// place — and the same question could then be answered from two different
// levels, which is a thing you have to work out rather than know. So the row
// asks and the page answers, and there is one place a reply comes from. That
// holds for the answered ones below as well: they are rows, not controls.
//
// The unanswered ones are the section's reason to exist, because it is not
// only how you change an answer — it is how you find out you were asked. Email
// is the other half of that, and email here has failed before: blocked on
// corporate networks, and an outage in August. A staffing request that exists
// only in an inbox is a silent no the day the inbox eats it.
//
// The answered ones sit behind a fold. They were full rows once, then muted
// lines, then cut altogether on the grounds that a change of mind is rare and
// the email's link is a permanent home for it. The first half of that was
// right and the second was not: changing your mind is only one of the two
// reasons to come back, the other is finding out whether the crew filled
// without you, and neither should send somebody digging through an inbox. So
// they return, but folded and muted, and carrying the thing the inbox cannot
// tell you — how the crew stands now, not when the email went out.
export default function StaffingInterestList({
  items,
  answered = [],
}: {
  items: InterestItem[]
  answered?: AnsweredItem[]
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.token}
          href={`/staffing/${item.token}`}
          className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 border border-yellow-900/50 rounded-lg hover:border-yellow-700 transition-colors group"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium truncate">
              {item.title}
              {item.client && <span className="text-zinc-400 font-normal"> · {item.client}</span>}
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">{item.meta}</span>
          </span>
          {/* Says what is on the other side of the click, because the row is
              otherwise indistinguishable from the course rows below it — which
              go somewhere else entirely. */}
          <span className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 group-hover:border-yellow-700 group-hover:text-yellow-300 transition-colors">
            Reply →
          </span>
        </Link>
      ))}

      {answered.length > 0 && (
        <details className="group/fold">
          <summary className="cursor-pointer list-none px-1 py-2 flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors select-none">
            <span aria-hidden className="transition-transform group-open/fold:rotate-90">▶</span>
            {answered.length} answered
            {/* The bound, said out loud. Without it the count looks like every
                invite you have ever had, and its shortness looks like a bug. */}
            <span className="text-zinc-700">on courses still to come</span>
          </summary>
          <div className="space-y-2 mt-2">
            {answered.map((item) => (
              <Link
                key={item.token}
                href={`/staffing/${item.token}`}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/60 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors group"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate text-zinc-400">
                    {item.title}
                    {item.client && <span className="text-zinc-500"> · {item.client}</span>}
                  </span>
                  <span className="block text-xs text-zinc-600 mt-0.5">{item.meta}</span>
                  {/* Where the crew stands, which is the half of this row that
                      changes after you have answered. "Crew filled" is the same
                      test the courses list marks green and the staffing page
                      warns about: a yes against a full crew is a yes to being
                      backup, and the page you land on says so in those words. */}
                  <span
                    className={`block text-xs mt-1 ${item.filled ? 'text-teal-400' : 'text-zinc-500'}`}
                  >
                    {item.filled ? 'Crew filled' : `${item.crew} of ${item.wanted} crew`}
                  </span>
                </span>
                {/* The reply on file, not an instruction — the whole row is the
                    door to changing it, and a second "Change →" chip beside a
                    chip that already says what you said would only make you
                    read both to find out which one is the button. */}
                <span
                  className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                    item.interested
                      ? 'border-teal-800 text-teal-400'
                      : 'border-zinc-700 text-zinc-500'
                  }`}
                >
                  {item.interested ? 'You said yes' : "You said can't"}
                </span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
