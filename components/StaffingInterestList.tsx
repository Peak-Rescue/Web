import Link from 'next/link'

export type InterestItem = {
  token: string
  title: string
  client: string | null
  meta: string
}

// Portal-home staffing summary: the courses that have asked for you and that
// you haven't answered yet. Each row is a door to the tokenized staffing page,
// which is where the answering happens.
//
// It used to answer here too — two buttons on the row, flipping the reply in
// place — and the same question could then be answered from two different
// levels, which is a thing you have to work out rather than know. So the row
// asks and the page answers, and there is one place a reply comes from.
//
// Answered invites aren't here at all. They were full rows, then muted lines,
// then a fold; all three spent the portal's best space on the small chance of
// a change of mind. The invite email's link never expires and the page it
// opens handles a course that has since been cancelled or finished, so
// changing a reply has a permanent home that isn't this page.
//
// The unanswered ones stay, because this section is not only how you change an
// answer — it is how you find out you were asked. Email is the other half of
// that, and email here has failed before: blocked on corporate networks, and
// an outage in August. A staffing request that exists only in an inbox is a
// silent no the day the inbox eats it.
export default function StaffingInterestList({ items }: { items: InterestItem[] }) {
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
    </div>
  )
}
