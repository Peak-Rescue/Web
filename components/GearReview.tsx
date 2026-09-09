'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestGearReview, reviewGearList, courseCrew } from '@/app/portal/[id]/update-actions'

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
/** Where the list stands, in words. Reads; does nothing. */
export function GearReviewStatus({ state }: { state: GearReviewState }) {
  const { signedOff, stale, reviewedAt, requestedAt } = read(state)
  if (signedOff) {
    return (
      <span className="text-[11px] text-teal-400" title={state.note ? `“${state.note}”` : undefined}>
        checked by {state.reviewerName ?? 'the crew'} {when(reviewedAt!)}
        {state.note ? ' · note' : ''}
      </span>
    )
  }
  if (stale) {
    // The list moved after somebody read it, so what they read is not what is
    // on the page. Said plainly rather than left as a stale green tick.
    return <span className="text-[11px] text-amber-400/90">changed since it was checked</span>
  }
  if (requestedAt) {
    return <span className="text-[11px] text-amber-400/90">waiting on a check · asked {when(requestedAt)}</span>
  }
  return <span className="text-[11px] text-zinc-600">not checked by anyone else</span>
}

// A missing field is not a sign-off.
//
// `reviewedAt` arrives undefined when a query forgets to ask for the column,
// and `undefined !== null` is true — so a list nobody had read announced
// itself as "checked by the crew Invalid Date", with the sign-off button
// hidden because it thought the job was done. Read it as absent.
function read(state: GearReviewState) {
  const reviewedAt = state.reviewedAt ?? null
  const updatedAt = state.updatedAt ?? null
  const requestedAt = state.requestedAt ?? null
  const stale =
    reviewedAt !== null && updatedAt !== null &&
    new Date(updatedAt) > new Date(reviewedAt)
  return { reviewedAt, updatedAt, requestedAt, stale, signedOff: reviewedAt !== null && !stale }
}

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
  // Who is on the course, loaded when the picker opens rather than with the
  // page: staffing can change between the two.
  const [crew, setCrew] = useState<{ name: string; email: string; role: string; isMe: boolean }[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  // Why the picker is empty, when it is. A rejected server action used to go
  // nowhere: the panel sat on "Reading the crew…" with the reason in a console
  // nobody had open.
  const [crewError, setCrewError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [said, setSaid] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try { await fn(); router.refresh() }
    catch (e) { setSaid(e instanceof Error ? e.message : 'That didn’t send') }
    finally { setBusy(false) }
  }

  const { signedOff, requestedAt } = read(state)

  // Asking for a check is a thing you do to a finished list, the same as
  // printing it or saving it to the shelf — so it is a button among those
  // rather than a word underlined at the end of a status line, which is where
  // it was and where nobody would look for it.
  const VERB = 'text-xs px-2 py-1 rounded transition-colors disabled:opacity-40'

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      {canAsk && !signedOff && (
        // Who to ask is asked, not assumed. It used to mail the whole crew the
        // moment it was pressed — which is right for a list everyone packs
        // from and wrong when you want one person's eyes, and either way it
        // was a send with no confirmation step and no way to see who it went
        // to until afterwards.
        <span className="relative">
          <button
            onClick={async () => {
              if (picking) return setPicking(false)
              setPicking(true)
              if (!crew) {
                setCrewError(null)
                try {
                  const list = await courseCrew(instanceId)
                  setCrew(list)
                  setPicked(list.filter((c) => !c.isMe).map((c) => c.email))
                } catch (e) {
                  setCrewError(e instanceof Error ? e.message : 'Could not read the crew')
                }
              }
            }}
            disabled={busy}
            className={`${VERB} ${requestedAt
              ? 'text-amber-400/90 hover:text-amber-200'
              : 'text-zinc-500 hover:text-white'}`}
          >
            {busy ? 'Asking…' : requestedAt ? 'Ask again' : 'Ask for a check'}
          </button>

          {picking && (
            <span className="absolute right-0 top-[calc(100%+4px)] z-30 w-64 p-2 rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl block">
              {crewError ? (
                <span className="block px-1 py-1 text-[11px] text-pr-red">{crewError}</span>
              ) : crew === null ? (
                <span className="block px-1 py-1 text-[11px] text-zinc-500">Reading the crew…</span>
              ) : crew.filter((c) => !c.isMe).length === 0 ? (
                <span className="block px-1 py-1 text-[11px] text-zinc-500">
                  Nobody else is on this course yet — add crew on the Staffing tab.
                </span>
              ) : (
                <>
                  <span className="block px-1 pb-1 text-[10px] uppercase tracking-widest text-zinc-600">Ask</span>
                  {crew.filter((c) => !c.isMe).map((c) => (
                    <label key={c.email} className="flex items-center gap-2 px-1 py-0.5 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={picked.includes(c.email)}
                        onChange={() => setPicked((p) =>
                          p.includes(c.email) ? p.filter((e) => e !== c.email) : [...p, c.email]
                        )}
                        className="accent-teal-600"
                      />
                      {c.name}
                      <span className="ml-auto text-[10px] text-zinc-600">{c.role}</span>
                    </label>
                  ))}
                  <span className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800">
                    <button
                      onClick={() => run(async () => {
                        const r = await requestGearReview(instanceId, listId, { to: picked })
                        setSaid(r.emailProblem ?? `Asked ${r.sent === 1 ? '1 person' : `${r.sent} people`}`)
                        setPicking(false)
                      })}
                      disabled={busy || picked.length === 0}
                      className="text-xs px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => setPicking(false)}
                      className="text-[11px] text-zinc-500 hover:text-white transition-colors"
                    >
                      cancel
                    </button>
                  </span>
                </>
              )}
            </span>
          )}
        </span>
      )}

      {canSignOff && !signedOff && !noting && (
        <button
          onClick={() => setNoting(true)}
          disabled={busy}
          className={`${VERB} border border-teal-800 text-teal-300 hover:bg-teal-900/30`}
        >
          Looks right
        </button>
      )}

      {canSignOff && signedOff && (
        <button
          onClick={() => run(() => reviewGearList(instanceId, listId, { clear: true }))}
          disabled={busy}
          className={`${VERB} text-zinc-600 hover:text-white`}
        >
          Undo check
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
