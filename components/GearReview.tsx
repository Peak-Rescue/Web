'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestGearReview, reviewGearList } from '@/app/portal/[id]/update-actions'

export type GearReviewState = {
  requestedAt: string | null
  reviewedAt: string | null
  reviewerName: string | null
  note: string | null
  /** When the list itself last changed, so a sign-off can be shown as stale. */
  updatedAt: string | null
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// Whether anybody else has read this list.
//
// A gear list goes to students and, through an order, to a client, and the
// person who assembled it is usually the only one who has read it. There was
// no way to ask for a look that pointed at the list, and nowhere to answer, so
// there was no way to tell afterwards whether anyone had.
//
// Three states and they are all one line: nobody asked, asked and waiting,
// signed off — plus the fourth that matters most, signed off and then edited,
// which is worked out from the list's own updated_at rather than stored. A
// sign-off on a list that has changed since is not a sign-off on this list.
export default function GearReview({
  instanceId,
  listId,
  state,
  canSignOff,
  canAsk,
}: {
  instanceId: string
  listId: string
  state: GearReviewState
  /** Any instructor on the course — the point is a reader who didn't write it. */
  canSignOff: boolean
  canAsk: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [said, setSaid] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  // A missing field is not a sign-off.
  //
  // `reviewedAt` arrives undefined when a query forgets to ask for the column,
  // and `undefined !== null` is true — so a list nobody had read announced
  // itself as "checked by the crew Invalid Date", with the sign-off button
  // hidden because it thought the job was done. Read it as absent.
  const reviewedAt = state.reviewedAt ?? null
  const updatedAt = state.updatedAt ?? null
  const requestedAt = state.requestedAt ?? null

  const stale =
    reviewedAt !== null &&
    updatedAt !== null &&
    new Date(updatedAt) > new Date(reviewedAt)

  const signedOff = reviewedAt !== null && !stale

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      {signedOff ? (
        <span
          className="text-teal-400"
          title={state.note ? `“${state.note}”` : undefined}
        >
          checked by {state.reviewerName ?? 'the crew'} {when(reviewedAt!)}
          {state.note ? ' · note' : ''}
        </span>
      ) : stale ? (
        // The list moved after somebody read it, so what they read is not what
        // is on the page. Said plainly rather than left as a stale green tick.
        <span className="text-amber-400/90">changed since it was checked</span>
      ) : requestedAt ? (
        <span className="text-amber-400/90">waiting on a check · asked {when(requestedAt)}</span>
      ) : (
        <span className="text-zinc-600">not checked by anyone else</span>
      )}

      {canAsk && !signedOff && (
        <button
          onClick={() => run(async () => {
            const r = await requestGearReview(instanceId, listId)
            setSaid(r.emailProblem ?? `Asked ${r.sent === 1 ? '1 person' : `${r.sent} people`}`)
          })}
          disabled={busy}
          className="underline decoration-zinc-700 text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
        >
          {requestedAt ? 'ask again' : 'ask the crew'}
        </button>
      )}

      {canSignOff && !signedOff && !noting && (
        <button
          onClick={() => setNoting(true)}
          disabled={busy}
          className="underline decoration-zinc-700 text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
        >
          looks right
        </button>
      )}

      {canSignOff && signedOff && (
        <button
          onClick={() => run(() => reviewGearList(instanceId, listId, { clear: true }))}
          disabled={busy}
          className="underline decoration-zinc-800 text-zinc-600 hover:text-white transition-colors disabled:opacity-40"
        >
          undo
        </button>
      )}

      {noting && (
        // The note is the half worth having. "Fine, but we're short two rope
        // bags" is the answer people actually have, and a tick cannot carry it.
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setNoting(false); setNote('') } }}
            placeholder="Anything to flag? (optional)"
            className="w-56 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => run(async () => {
              await reviewGearList(instanceId, listId, { note })
              setNoting(false); setNote('')
            })}
            disabled={busy}
            className="px-2 py-0.5 rounded border border-teal-700 text-teal-300 hover:bg-teal-900/30 transition-colors disabled:opacity-40"
          >
            Sign off
          </button>
          <button
            onClick={() => { setNoting(false); setNote('') }}
            className="text-zinc-600 hover:text-white transition-colors"
          >
            cancel
          </button>
        </span>
      )}

      {said && <span className="text-teal-400">{said}</span>}
    </span>
  )
}
