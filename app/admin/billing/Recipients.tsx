'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingRecipient } from '@/lib/billing'
import PencilIcon from '@/components/PencilIcon'
import TrashIcon from '@/components/TrashIcon'
import NewTabIcon from '@/components/NewTabIcon'
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
// Same button at the width of its mark. Six words in a row read as a sentence
// to skim rather than controls to use, so the three that the site already has
// a mark for — open, edit, delete — are shown as marks, and only the two that
// cut somebody's access off are still spelled out.
const iconBtn = `${smallBtn} inline-flex items-center justify-center w-7 h-[26px] px-0`

// The outside people this portal writes to, and what each is here for.
//
// Two jobs on one list rather than two lists: whoever raises our invoices,
// and whoever gets a course's numbers when we send them. They overlap
// sometimes and not always, and a second list would be one more thing to keep
// in step and a person who does both entered twice.
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
      <ul className="space-y-2">
        {active.map((r) => (
          <li key={r.id} className="border border-zinc-800 rounded p-3">
            {/* Editable in place. Fixing a surname or following an address
                change used to mean deactivating somebody and building them
                again, which is a lot of ceremony for a typo — and left a
                retired row behind that nobody could explain a year later. */}
            {editing === r.id ? (
              <div className="space-y-3">
                <form
                  action={(fd) => run(() => updateBillingRecipient(r.id, fd))}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input name="name" defaultValue={r.name} className={`${inputCls} w-44`} />
                  <input name="email" type="email" defaultValue={r.email} className={`${inputCls} w-64`} />
                  {/* What they are here for. Two ticks rather than two lists:
                      billing and the numbers overlap on some people and not
                      others, and the numbers carry pay and margin, so that
                      one is never assumed. */}
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" name="bills" defaultChecked={r.bills} className="accent-pr-red" />
                    Invoices
                  </label>
                  <label
                    title="Gets a course's numbers when we send them — costs, pay, margin, net"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer"
                  >
                    <input type="checkbox" name="reads_pnl" defaultChecked={r.reads_pnl} className="accent-pr-red" />
                    Course numbers
                  </label>
                  <button type="submit" disabled={pending} className={smallBtn}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className={smallBtn}>
                    Cancel
                  </button>
                </form>
                {/* The three that change what somebody can still reach, kept
                    behind the pencil rather than a hover away on a row you
                    were only reading. Opening this row is already deliberate
                    and only one opens at a time, so this is where they can be
                    spelled out — and read next to the address they act on. */}
                <div className="border-t border-zinc-800 pt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-600 mr-1">Their access</span>
                  {r.bills && (
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={pending}
                    title="Give them a new address and cut the old one"
                    onClick={() => {
                      if (confirm(`Rotate ${r.name}'s link? The old one stops working immediately.`)) {
                        run(() => rotateBillingToken(r.id))
                      }
                    }}
                  >
                    Rotate link
                  </button>
                  )}
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
                  {/* Offered to everyone and refused by the server for anyone
                      who has marked an invoice: their name is on those
                      invoices, and a request that says somebody raised it with
                      nobody able to say who is worse than a row nobody uses.
                      The refusal names Deactivate, so it is a question rather
                      than a trap. */}
                  <button
                    type="button"
                    className={`${iconBtn} hover:text-red-400 hover:border-red-900`}
                    disabled={pending}
                    aria-label={`Remove ${r.name}`}
                    title={`Remove ${r.name} completely — only possible while they have never marked an invoice`}
                    onClick={() => {
                      if (confirm(`Remove ${r.name} completely? Only possible while they have never marked an invoice.`)) {
                        run(() => deleteBillingRecipient(r.id))
                      }
                    }}
                  >
                    <TrashIcon />
                  </button>
                  <span className="text-xs text-zinc-600">Saving a name or address leaves their link alone.</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">
                    {r.name} <span className="text-zinc-500">· {r.org}</span>
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{r.email}</p>
                  {/* What they are here for, on the row. Without it the only
                      way to know whether somebody is sent a course's pay and
                      margin was to open the edit form and look. */}
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {[r.bills ? 'Invoices' : null, r.reads_pnl ? 'Course numbers' : null]
                      .filter(Boolean)
                      .join(' · ') || 'Nothing yet'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* The queue and its link belong to whoever raises invoices.
                      Somebody here only for a course's numbers has no queue to
                      open — they are sent a link per course, from that
                      course. */}
                  {r.bills && (
                  <button type="button" className={smallBtn} onClick={() => copy(r.token)}>
                    {copied === r.token ? 'Copied' : 'Copy link'}
                  </button>
                  )}
                  {/* Their page, exactly as they see it. Worth being able to
                      look at before handing the address over — but the link is
                      the credential, so anything done there is recorded as
                      them. The same two milestones are on the course's own
                      Billing section, where they are recorded as us. */}
                  {r.bills && (
                  <a
                    href={`${siteUrl}/billing/${r.token}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${r.name}'s page`}
                    title={`Open ${r.name}'s page as they see it. Marking anything there records it as them — use the course's Billing section to record it as you.`}
                    className={iconBtn}
                  >
                    <NewTabIcon />
                  </a>
                  )}
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={`Edit ${r.name}`}
                    title={`Edit ${r.name}'s name or email, or change what they can reach`}
                    onClick={() => setEditing(r.id)}
                  >
                    <PencilIcon />
                  </button>
                </div>
              </div>
            )}
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
          Add
        </button>
        <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" name="bills" defaultChecked className="accent-pr-red" />
            Raises our invoices
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" name="reads_pnl" className="accent-pr-red" />
            Gets a course&rsquo;s numbers
          </label>
          <span className="text-xs text-zinc-600">The numbers carry pay and margin, so that one is never assumed.</span>
        </div>
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
                    className={`${iconBtn} hover:text-red-400 hover:border-red-900`}
                    disabled={pending}
                    aria-label={`Remove ${r.name}`}
                    title={`Remove ${r.name} completely — only possible while they have never marked an invoice`}
                    onClick={() => {
                      if (confirm(`Remove ${r.name} completely? Only possible while they have never marked an invoice.`)) {
                        run(() => deleteBillingRecipient(r.id))
                      }
                    }}
                  >
                    <TrashIcon />
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
