'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingRecipient } from '@/lib/billing'
import {
  addBillingRecipient,
  setBillingRecipientActive,
  rotateBillingToken,
  updateBillingRecipient,
  deleteBillingRecipient,
} from './actions'

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const smallBtn =
  'text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50'

// Who at Harken raises our invoices.
//
// Their link is shown here rather than mailed from here on purpose: handing it
// over is a conversation ("this is your page, bookmark it"), and a page that
// quietly emails a credential when a row is added is a page that has emailed
// it to the wrong address at least once.
export default function Recipients({
  recipients,
  siteUrl,
}: {
  recipients: BillingRecipient[]
  siteUrl: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // Which row is open for editing. One at a time: two open rows is how the
  // wrong person gets the new address.
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) {
        setEditing(null)
        router.refresh()
      } else setError(res.error)
    })
  }

  async function copy(token: string) {
    const url = `${siteUrl}/billing/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  const active = recipients.filter((r) => r.active)
  const inactive = recipients.filter((r) => !r.active)

  return (
    <div>
      {/* Said once, because "Copy link" does not say what the link is. It is
          an address rather than an account: no sign-in, unguessable, and the
          whole of what lets somebody at Harken work the queue. */}
      <p className="text-xs text-zinc-500 mb-3">
        Each biller has their own sign-in-free address into the queue — hand it over once and they bookmark it.
        The link is the credential, so what is done there is recorded as them.
      </p>
      <ul className="space-y-2">
        {active.map((r) => (
          <li key={r.id} className="border border-zinc-800 rounded p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Editable in place. Fixing a surname or following an address
                change used to mean deactivating somebody and building them
                again, which is a lot of ceremony for a typo — and left a
                retired row behind that nobody could explain a year later. */}
            {editing === r.id ? (
              <form
                action={(fd) => run(() => updateBillingRecipient(r.id, fd))}
                className="flex flex-wrap items-center gap-2 flex-1 min-w-0"
              >
                <input name="name" defaultValue={r.name} className={`${inputCls} w-44`} />
                <input name="email" type="email" defaultValue={r.email} className={`${inputCls} w-64`} />
                <button type="submit" disabled={pending} className={smallBtn}>
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} className={smallBtn}>
                  Cancel
                </button>
                <span className="text-xs text-zinc-600">Their link is unchanged — Rotate cuts the old one.</span>
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200">
                  {r.name} <span className="text-zinc-500">· {r.org}</span>
                </p>
                <p className="text-xs text-zinc-500 truncate">{r.email}</p>
              </div>
            )}
            <div className={`flex items-center gap-2 ${editing === r.id ? 'hidden' : ''}`}>
              <button type="button" className={smallBtn} onClick={() => copy(r.token)}>
                {copied === r.token ? 'Copied' : 'Copy link'}
              </button>
              {/* Their page, exactly as they see it. Worth being able to look
                  at before handing the address over — but the link is the
                  credential, so anything done there is recorded as them. The
                  same two milestones are on the course's own Billing section,
                  where they are recorded as us. */}
              <a
                href={`${siteUrl}/billing/${r.token}`}
                target="_blank"
                rel="noreferrer"
                title={`Open ${r.name}'s page as they see it. Marking anything there records it as them — use the course's Billing section to record it as you.`}
                className={smallBtn}
              >
                View
              </a>
              <button type="button" className={smallBtn} onClick={() => setEditing(r.id)}>
                Edit
              </button>
              <button
                type="button"
                className={smallBtn}
                disabled={pending}
                onClick={() => {
                  if (confirm(`Rotate ${r.name}'s link? The old one stops working immediately.`)) {
                    run(() => rotateBillingToken(r.id))
                  }
                }}
              >
                Rotate
              </button>
              <button
                type="button"
                className={smallBtn}
                disabled={pending}
                onClick={() => {
                  if (confirm(`Deactivate ${r.name}? Their link stops working; their history stays.`)) {
                    run(() => setBillingRecipientActive(r.id, false))
                  }
                }}
              >
                Deactivate
              </button>
              {/* Offered to everyone and refused by the server for anyone who
                  has marked an invoice: their name is on those invoices, and
                  a request that says somebody raised it with nobody able to
                  say who is worse than a row nobody uses. The refusal names
                  Deactivate, so the button is a question rather than a trap. */}
              <button
                type="button"
                className={smallBtn}
                disabled={pending}
                onClick={() => {
                  if (confirm(`Remove ${r.name} completely? Only possible while they have never marked an invoice.`)) {
                    run(() => deleteBillingRecipient(r.id))
                  }
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {active.length === 0 && (
        <p className="text-sm text-amber-400/90 border border-amber-900/50 bg-amber-950/20 rounded p-3">
          Nobody active — courses cannot be handed to Harken until someone is here.
        </p>
      )}

      <form
        action={(fd) => run(() => addBillingRecipient(fd))}
        className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
      >
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Name</label>
          <input name="name" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Email</label>
          <input name="email" type="email" className={inputCls} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-2 text-sm rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50"
        >
          Add biller
        </button>
      </form>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

      {/* Deactivated people, with the way back. It was a sentence naming them
          and explaining that re-adding their email would restore them, which
          is a workaround written down rather than a control. */}
      {inactive.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-wide text-zinc-600 mb-2">Inactive</h3>
          <ul className="space-y-2">
            {inactive.map((r) => (
              <li key={r.id} className="border border-zinc-900 rounded px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-500">{r.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{r.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={pending}
                    onClick={() => run(() => setBillingRecipientActive(r.id, true))}
                  >
                    Reactivate
                  </button>
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Remove ${r.name} completely? Only possible while they have never marked an invoice.`)) {
                        run(() => deleteBillingRecipient(r.id))
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
