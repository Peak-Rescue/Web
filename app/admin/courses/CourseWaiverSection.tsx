'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import InfoHint from '@/components/InfoHint'
import {
  generateWaiverQr, linkWaiverSignature, revokeWaiverQr, setCourseWaiver, unlinkWaiverSignature,
  type WaiverTemplateOption,
} from './waiver-actions'

export type UnmatchedWaiver = {
  id: string
  name: string
  email: string
  signedAt: string
  source: 'portal' | 'qr'
  suggestions: { enrollmentId: string; profileId: string; name: string; email: string | null }[]
}

export type WaiverRosterRow = {
  enrollmentId: string
  name: string
  email: string | null
  /** Null until they sign. */
  signature: {
    id: string
    signedAt: string
    identity: 'authenticated' | 'unverified'
    source: 'portal' | 'qr'
    signerName: string | null
  } | null
}

// Which waiver this course uses, and who has signed it.
//
// The two belong together: choosing a waiver is the thing that starts asking
// people to sign, so the answer to "did that work" should be in the same
// place. A course with no waiver set shows no roster at all, because nobody
// was ever asked.

export default function CourseWaiverSection({
  instanceId,
  templates,
  selectedId,
  roster,
  qr,
  unmatched,
}: {
  instanceId: string
  templates: WaiverTemplateOption[]
  selectedId: string | null
  roster: WaiverRosterRow[]
  /** The course code, once one exists: its link, the rendered QR, and when it dies. */
  qr: { url: string; svg: string; expiresAt: string | null } | null
  unmatched: UnmatchedWaiver[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const signed = roster.filter((r) => r.signature)
  const outstanding = roster.length - signed.length

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 pt-5 border-t border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-1">Waiver</h3>
      <p className="text-xs text-zinc-500 mb-3">
        Students sign it on their course page. Nobody is asked until one is chosen here.
      </p>

      {error && <p className="text-xs text-pr-red mb-2">{error}</p>}

      <select
        value={selectedId ?? ''}
        disabled={busy}
        onChange={(e) => run(() => setCourseWaiver(instanceId, e.target.value || null))}
        className="w-full sm:w-auto bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
      >
        <option value="">No waiver on this course</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}{t.version ? ` (v${t.version})` : ''}
          </option>
        ))}
      </select>

      {selectedId && (
        <div className="mt-4">
          <div className="flex items-baseline gap-2 mb-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Signed {signed.length} of {roster.length}
            </p>
            {outstanding > 0 && (
              <span className="text-xs text-amber-400">{outstanding} outstanding</span>
            )}
          </div>

          {roster.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Nobody is enrolled yet — the waiver appears on each student’s course page as they join.
            </p>
          ) : (
            <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              {roster.map((r) => (
                <div key={r.enrollmentId} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    aria-hidden
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      r.signature ? 'bg-teal-400' : 'bg-amber-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{r.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {r.signature ? (
                        <>
                          {new Date(r.signature.signedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                          {r.signature.signerName && ` · signed by ${r.signature.signerName}`}
                          {/* Said out loud, not left to a colour. A waiver typed
                              on a public page is worth less than one signed
                              from an account, and the roster is where somebody
                              would notice. */}
                          {r.signature.identity === 'unverified' && (
                            <span className="text-amber-400"> · self-entered via QR</span>
                          )}
                        </>
                      ) : (
                        'Not signed'
                      )}
                    </div>
                  </div>
                  <div className="ml-auto shrink-0 flex items-center gap-3">
                  {r.signature && r.signature.identity === 'unverified' && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => unlinkWaiverSignature(r.signature!.id, instanceId))}
                      title="Detach this waiver — it stays valid, just unattached"
                      className="text-xs text-zinc-500 hover:text-pr-red-light disabled:opacity-50 transition-colors"
                    >
                      Not them
                    </button>
                  )}
                  {r.signature && (
                    <a
                      href={`/api/waivers/${r.signature.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
                    >
                      PDF
                    </a>
                  )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* The code for whoever turns up without a login. Folded away by
              default: it is the exception, and a QR sitting open on the page
              invites use of the weaker path when the better one is available. */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <button
              onClick={() => setShowQr((v) => !v)}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {showQr ? '▾' : '▸'} Signing without a login {qr ? '· code active' : ''}
            </button>

            {showQr && (
              <div className="mt-3">
                <p className="text-xs text-zinc-500 mb-3">
                  For someone added at the last minute, or who can’t get into the portal. They still
                  sign the same waiver — but it records that nobody was logged in, and it has to be
                  matched to a person afterwards.
                </p>

                {qr ? (
                  <div className="flex flex-wrap items-start gap-4">
                    <div
                      className="bg-white p-2 rounded shrink-0"
                      // Rendered on the server by the qrcode library; no user
                      // input reaches it, only a token we generated.
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
                      <p className="text-[11px] text-zinc-600">
                        Replacing kills the old code straight away.
                      </p>
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

          {/* Anything the matcher wouldn't decide. Always shown when it isn't
              empty — a queue you have to remember to open is a queue that
              quietly loses waivers. */}
          {unmatched.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-amber-400 mb-1">
                {unmatched.length} signed {unmatched.length === 1 ? 'waiver' : 'waivers'} not matched to anyone
              </p>
              <p className="text-xs text-zinc-500 mb-3">
                These are valid and signed. They just aren’t attached to a student yet.
              </p>
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
                      Signed {new Date(u.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {u.source === 'qr' && ' · via QR code'}
                    </p>
                    {u.suggestions.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[11px] text-zinc-500">Is this…</span>
                        {u.suggestions.map((sug) => (
                          <button
                            key={sug.enrollmentId}
                            disabled={busy}
                            onClick={() => run(() => linkWaiverSignature(u.id, sug.enrollmentId))}
                            className="px-2.5 py-1 rounded-full text-xs border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50 transition-colors"
                          >
                            {sug.name}
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
          )}

          <p className="flex items-center gap-1.5 text-[11px] text-zinc-600 mt-2">
            Changing the waiver doesn’t affect anyone who has already signed
            <InfoHint text="Every signature records the exact version of the text it was shown, so an old one keeps rendering the old wording however many times the waiver is changed afterwards." />
          </p>
        </div>
      )}
    </div>
  )
}
