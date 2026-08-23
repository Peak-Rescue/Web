'use client'

import { useState } from 'react'
import { generateWaiverQr, revokeWaiverQr } from '@/app/portal/[id]/waiver-actions'

export type WaiverQr = { url: string; svg: string; expiresAt: string | null }

// The code an instructor holds up for somebody who can't sign in.
//
// Folded away by default wherever it appears: it is the exception, and a QR
// sitting open on the page invites use of the weaker path when the better one
// is available. What comes off it is an unverified waiver — a name typed by
// whoever was holding the phone — and that is worth having when the
// alternative is no waiver, and not otherwise.

export default function WaiverQrPanel({
  instanceId,
  qr,
  /** Nothing to sign yet, so there is nothing to point a code at. */
  hasWaiver,
}: {
  instanceId: string
  qr: WaiverQr | null
  hasWaiver: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        {open ? '▾' : '▸'} Signing without a login{qr ? ' · code active' : ''}
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500 mb-3">
            For someone added at the last minute, or who can’t get into the portal. They sign the
            same waiver — but it records that nobody was logged in, and it has to be matched to a
            person afterwards.
          </p>

          {error && <p className="text-xs text-pr-red-light mb-2">{error}</p>}

          {!hasWaiver ? (
            <p className="text-xs text-amber-400">
              This course has no waiver set yet, so a code would open an empty page. An admin picks
              one on the course’s admin page.
            </p>
          ) : qr ? (
            <div className="flex flex-wrap items-start gap-4">
              <div
                className="bg-white p-2 rounded shrink-0"
                // Rendered on the server by the qrcode library; nothing but a
                // token we generated ourselves reaches it.
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-zinc-400 break-all">{qr.url}</p>
                <p className="text-[11px] text-zinc-500">
                  {qr.expiresAt
                    ? `Stops working ${new Date(qr.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : 'Never expires'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(qr.url)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => run(() => generateWaiverQr(instanceId))}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors"
                  >
                    Replace
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => run(() => revokeWaiverQr(instanceId))}
                    className="px-3 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-pr-red-light disabled:opacity-50 transition-colors"
                  >
                    Turn off
                  </button>
                </div>
                <p className="text-[11px] text-zinc-600">Replacing kills the old code straight away.</p>
              </div>
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={() => run(() => generateWaiverQr(instanceId))}
              className="px-4 py-2 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50 transition-colors"
            >
              Create a QR code
            </button>
          )}
        </div>
      )}
    </div>
  )
}
