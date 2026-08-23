'use client'

import { useState } from 'react'
import { linkWaiverSignature } from '@/app/portal/[id]/waiver-actions'

export type UnmatchedWaiver = {
  id: string
  name: string
  email: string
  signedAt: string
  source: 'portal' | 'qr'
  suggestions: { enrollmentId: string; profileId: string; name: string; email: string | null }[]
}

// Waivers that are signed and valid but not attached to anybody.
//
// Shown wherever staff look at a course, never folded away, because a queue you
// have to remember to open is a queue that quietly loses waivers. Everything
// here is something the matcher refused to decide — two people fitting the same
// name, or a match who had already signed — so it is put in front of somebody
// who knows the course by sight rather than guessed at.

export default function UnmatchedWaivers({
  instanceId,
  unmatched,
}: {
  instanceId: string
  unmatched: UnmatchedWaiver[]
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (unmatched.length === 0) return null

  async function link(signatureId: string, enrollmentId: string) {
    setBusy(true)
    setError(null)
    try {
      await linkWaiverSignature(instanceId, signatureId, enrollmentId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-amber-400 mb-1">
        {unmatched.length} signed {unmatched.length === 1 ? 'waiver' : 'waivers'} not matched to anyone
      </p>
      <p className="text-xs text-zinc-500 mb-3">
        These are valid and signed. They just aren’t attached to a student yet.
      </p>

      {error && <p className="text-xs text-pr-red-light mb-2">{error}</p>}

      <div className="space-y-2">
        {unmatched.map((u) => (
          <div key={u.id} className="px-4 py-3 rounded-lg border border-amber-900/50 bg-amber-950/10">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm text-zinc-200">{u.name}</span>
              <span className="text-xs text-zinc-500">{u.email}</span>
              <a
                href={`/api/waivers/${u.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
              >
                PDF
              </a>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Signed {new Date(u.signedAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
              {u.source === 'qr' && ' · via QR code'}
            </p>
            {u.suggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[11px] text-zinc-500">Is this…</span>
                {u.suggestions.map((s) => (
                  <button
                    key={s.enrollmentId}
                    disabled={busy}
                    onClick={() => link(u.id, s.enrollmentId)}
                    className="px-2.5 py-1 rounded-full text-xs border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50 transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 mt-2">
                Nobody on this course resembles them — they may need enrolling first.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
