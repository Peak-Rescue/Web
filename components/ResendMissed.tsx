'use client'

import { useState } from 'react'

// The way out of "5 of 15 didn't go through": the same notice again, to only
// the people it missed. Sending the whole thing again was the only answer
// before, and it gave the ten who already had it a second copy.
//
// Shown only right after the send that missed — the list of who missed lives
// in that answer and nowhere else, so a reload ends the offer.
export default function ResendMissed<R extends { to: string[]; copy: boolean }>({
  retry,
  resend,
  onDone,
}: {
  retry: R | null
  /** Sends to retry.to (and the author's copy if retry.copy), and says how it
      went — with a fresh retry if some of it missed again. */
  resend: (retry: R) => Promise<{ message: string; retry: R | null }>
  onDone: (message: string, retry: R | null) => void
}) {
  const [busy, setBusy] = useState(false)
  if (!retry || (retry.to.length === 0 && !retry.copy)) return null

  const n = retry.to.length
  const label =
    n === 0 ? 'Send your copy again'
    : `Send to the ${n === 1 ? 'one' : n} who missed it${retry.copy ? ', and your copy' : ''}`

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const r = await resend(retry)
          onDone(r.message, r.retry)
        } catch (e) {
          onDone(e instanceof Error ? e.message : 'That didn’t send', retry)
        } finally {
          setBusy(false)
        }
      }}
      className="text-[11px] text-amber-400 hover:text-amber-200 underline underline-offset-2 transition-colors disabled:opacity-50"
    >
      {busy ? 'Sending…' : label}
    </button>
  )
}
