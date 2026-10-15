import Link from 'next/link'

export type SortingCheck = {
  key: string
  title: string
  /** What is wrong, said as a consequence rather than as a count. */
  why: string
  count: number
  href: string
  action: string
  /** Blocked until the ones above it are done, and why. */
  after?: string
}

// The order to do it in, and what is left.
//
// Sorting 822 items is six different jobs, and before this they were six
// screens that each knew about their own. Nothing said how much was left, and
// nothing said which to do first — which matters, because the jobs are not
// independent: approving the 119 pending items before tagging them files 119
// untagged things onto shelves, and moving something to the right shelf before
// anyone has said what it is means reading it twice.
//
// A check with a count of zero is not drawn. When this page is empty the
// library is sorted, which is a thing no screen could say before.
export default function SortingInbox({ checks }: { checks: SortingCheck[] }) {
  const outstanding = checks.filter((c) => c.count > 0)

  if (outstanding.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-sm text-zinc-300">Nothing is waiting to be sorted.</p>
        <p className="text-xs text-zinc-600 mt-1">
          Everything published says what it is, sits on the right shelf, and knows where it is.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {outstanding.map((c, i) => (
        <div
          key={c.key}
          className={`rounded-lg border bg-zinc-900 px-4 py-3 ${
            i === 0 ? 'border-pr-red/50' : 'border-zinc-800'
          }`}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-sm font-medium">{c.title}</span>
            <span className="text-xs tabular-nums text-zinc-500">{c.count}</span>
            {/* Only the top one is marked. A list where everything is urgent
                is a list with no order in it. */}
            {i === 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-pr-red/20 text-pr-red-light">do this first</span>
            )}
            <Link
              href={c.href}
              className="ml-auto text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0"
            >
              {c.action}
            </Link>
          </div>
          <p className="text-xs text-zinc-500 mt-1 max-w-prose">{c.why}</p>
          {c.after && <p className="text-[11px] text-zinc-600 mt-1">After: {c.after}</p>}
        </div>
      ))}
    </div>
  )
}
