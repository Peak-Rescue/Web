'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setActualsClosed } from './actuals-actions'
import { fmtMoney } from '@/lib/expenses'
import { btn } from '@/lib/ui'
import type { BooksQuickData } from './quick-actions'

// Saying our own costs on this course are final.
//
// The same `closed_at` the course's Actuals panel sets, and the same action —
// there is one answer to "are the books shut on this course", and a second
// switch for it would be a second answer waiting to disagree.
//
// It locks nothing. A number that turns out wrong still has to be fixable, so
// closing is a statement about attention rather than a freeze, and reopening
// costs one click.
export default function BooksQuickClose({ data }: { data: BooksQuickData }) {
  const { instanceId, closedAt, invoiced, costTotal, costLines } = data
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const set = (closed: boolean) => {
    setError(null)
    start(async () => {
      try {
        await setActualsClosed(instanceId, closed)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not change that')
      }
    })
  }

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-3">
      {/* What is being called final, so the click is not blind. Closing the
          books on a course with no costs recorded is nearly always somebody
          about to lose a card statement. */}
      <div className="flex items-baseline gap-x-5 gap-y-1 flex-wrap text-sm">
        <span className="text-zinc-400">
          Costs recorded{' '}
          <span className="text-zinc-100 font-medium">{fmtMoney(costTotal)}</span>
          <span className="text-zinc-600"> across {costLines} line{costLines === 1 ? '' : 's'}</span>
        </span>
        {invoiced !== null && (
          <span className="text-zinc-400">
            Invoiced <span className="text-zinc-100 font-medium">{fmtMoney(invoiced)}</span>
          </span>
        )}
      </div>

      {costLines === 0 && !closedAt && (
        <p className="text-xs text-amber-400/90">
          Nothing has been costed on this course yet. Worth a look at the actuals before calling them final.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {closedAt ? (
          <>
            <span className="text-sm text-teal-300">Closed {fmtDay(closedAt)}</span>
            <button disabled={pending} onClick={() => set(false)} className={btn.secondary}>
              {pending ? 'Reopening…' : 'Reopen the books'}
            </button>
          </>
        ) : (
          <button disabled={pending} onClick={() => set(true)} className={btn.secondaryLg}>
            {pending ? 'Closing…' : 'Close the books'}
          </button>
        )}
        <Link
          href={`/portal/${instanceId}?open=pricing`}
          prefetch={false}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
        >
          Open the actuals
        </Link>
      </div>

      <p className="text-xs text-zinc-600">
        Closing locks nothing — it says the costs have stopped moving, so a year-end total knows which courses
        are finished with. A late charge can always reopen it.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
