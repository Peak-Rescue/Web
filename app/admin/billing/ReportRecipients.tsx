'use client'

import { useState, useTransition } from 'react'
import PencilIcon from '@/components/PencilIcon'
import TrashIcon from '@/components/TrashIcon'
import { useRouter } from 'next/navigation'
import type { ReportRecipient } from '@/lib/billing'
import {
  addReportRecipient,
  updateReportRecipient,
  setReportRecipientActive,
  deleteReportRecipient,
} from './report-actions'

// Who a course's numbers can be sent to.
//
// Its own list rather than a tick on the billers', because it is its own set
// of people: the billers are two at one firm working a queue, and these are
// whoever is asking that quarter. Nobody here holds anything — no token, no
// page of their own — so the row is shorter by exactly the controls that
// would have been about access.

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const smallBtn =
  'text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50'
const iconBtn = `${smallBtn} inline-flex items-center justify-center w-7 h-[26px] px-0`

export default function ReportRecipients({ recipients }: { recipients: ReportRecipient[] }) {
  const [error, setError] = useState<string | null>(null)
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

  const active = recipients.filter((r) => r.active)
  const inactive = recipients.filter((r) => !r.active)

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-3">
        Offered in the send on a course&rsquo;s actuals, one course at a time. Being here is not access to anything:
        the link goes out with the email, belongs to that course, and is revoked there.
      </p>

      <ul className="space-y-2">
        {active.map((r) => (
          <li key={r.id} className="border border-zinc-800 rounded p-3">
            {editing === r.id ? (
              <form
                action={(fd) => run(() => updateReportRecipient(r.id, fd))}
                className="flex flex-wrap items-center gap-2"
              >
                <input name="name" defaultValue={r.name} className={`${inputCls} w-44`} />
                <input name="email" type="email" defaultValue={r.email} className={`${inputCls} w-64`} />
                <input name="org" defaultValue={r.org ?? ''} placeholder="Where they are" className={`${inputCls} w-40`} />
                <button type="submit" disabled={pending} className={smallBtn}>
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} className={smallBtn}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={smallBtn}
                  disabled={pending}
                  onClick={() => run(() => setReportRecipientActive(r.id, false))}
                >
                  Stop sending
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">
                    {r.name}
                    {r.org && <span className="text-zinc-500"> · {r.org}</span>}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{r.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={`Edit ${r.name}`}
                    title={`Edit ${r.name}`}
                    onClick={() => setEditing(r.id)}
                  >
                    <PencilIcon />
                  </button>
                  {/* Deletable outright, unlike a biller: nothing records who
                      was sent a P&L, so removing a reader leaves no row with
                      an unexplained name on it. A wrong address should go. */}
                  <button
                    type="button"
                    className={`${iconBtn} hover:text-red-400 hover:border-red-900`}
                    disabled={pending}
                    aria-label={`Remove ${r.name}`}
                    title={`Remove ${r.name}`}
                    onClick={() => {
                      if (confirm(`Remove ${r.name}? They will no longer be offered when sending a course's numbers.`)) {
                        run(() => deleteReportRecipient(r.id))
                      }
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {active.length === 0 && (
        <p className="text-sm text-zinc-600">
          Nobody yet — a course&rsquo;s numbers can still be downloaded as a PDF, they just cannot be emailed from here.
        </p>
      )}

      <form
        action={(fd) => run(() => addReportRecipient(fd))}
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
          Add reader
        </button>
      </form>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

      {inactive.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-wide text-zinc-600 mb-2">No longer sent to</h3>
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
                    onClick={() => run(() => setReportRecipientActive(r.id, true))}
                  >
                    Send again
                  </button>
                  <button
                    type="button"
                    className={`${iconBtn} hover:text-red-400 hover:border-red-900`}
                    disabled={pending}
                    aria-label={`Remove ${r.name}`}
                    onClick={() => run(() => deleteReportRecipient(r.id))}
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
