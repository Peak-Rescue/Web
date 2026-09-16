'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingRecipient } from '@/lib/billing'
import { addBillingRecipient, setBillingRecipientActive, rotateBillingToken } from './actions'

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
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) router.refresh()
      else setError(res.error)
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
      <ul className="space-y-2">
        {active.map((r) => (
          <li key={r.id} className="border border-zinc-800 rounded p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">
                {r.name} <span className="text-zinc-500">· {r.org}</span>
              </p>
              <p className="text-xs text-zinc-500 truncate">{r.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={smallBtn} onClick={() => copy(r.token)}>
                {copied === r.token ? 'Copied' : 'Copy link'}
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

      {inactive.length > 0 && (
        <p className="text-xs text-zinc-600 mt-4">
          Inactive: {inactive.map((r) => r.name).join(', ')} — adding the same email again brings them back.
        </p>
      )}
    </div>
  )
}
