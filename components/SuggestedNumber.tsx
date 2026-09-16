'use client'

import { fmtMoney } from '@/lib/expenses'
import type { ChainLink } from '@/lib/billing'

// The note beside a money box that says where its number would come from.
//
// One component because there are two boxes — what we are asking Harken to
// invoice, and what we billed — and they read the same chain. Written twice,
// they immediately disagreed: one said "Quote 1 was accepted at $13,200.00"
// and the other "Quote 1 was accepted at this", which invites the reader to
// wonder what the difference means. There is none.
//
// The figure is always spelled out, even when the box already holds it. The
// point of the line is provenance — that this number came from the quote, or
// from the COA, and not from somebody's memory — and a sentence that trails
// off into "this" says everything except the thing worth knowing.
export default function SuggestedNumber({
  link,
  current,
  onUse,
}: {
  link: ChainLink | null
  /** What is in the box now, so the offer to use it appears only when it
      would change something. */
  current: number
  onUse: (total: number) => void
}) {
  if (!link) return null
  const differs = Math.abs(current - link.total) > 0.005
  return (
    <span className="text-xs text-zinc-500">
      {link.text} {fmtMoney(link.total)}
      {differs && (
        <button
          type="button"
          onClick={() => onUse(link.total)}
          className="ml-2 text-zinc-400 hover:text-white underline underline-offset-2 transition-colors"
        >
          use it
        </button>
      )}
    </span>
  )
}
