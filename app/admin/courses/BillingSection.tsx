'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/expenses'
import { INVOICE_STATUS_LABEL, type InvoiceRequest } from '@/lib/billing'
import { sendInvoiceRequest, cancelInvoiceRequest } from './billing-actions'

// Handing this course to Harken, and what came back.
//
// The button is guarded rather than hopeful: without a billing contact or an
// accepted quote it says which one is missing instead of sending a request the
// biller would only have to chase us about.

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function BillingSection({
  instanceId,
  requests,
  billTo,
  acceptedTotal,
  recipientNames,
}: {
  instanceId: string
  requests: InvoiceRequest[]
  /** The POC tagged billing in Details, or null. */
  billTo: { name: string; email: string | null } | null
  /** The accepted quote's total, or null if nothing has been accepted. */
  acceptedTotal: number | null
  recipientNames: string[]
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const blocker = !billTo
    ? 'Add a billing contact in Details before handing this to Harken.'
    : acceptedTotal === null
      ? 'No accepted quote yet — there is no agreed number to bill.'
      : recipientNames.length === 0
        ? 'No active billing recipient. Add one in Portal → Billing.'
        : null

  // A second request is a real thing (a cut day, a renegotiation) but never
  // an accident. Sending again asks first.
  const alreadySent = requests.some((r) => r.status !== 'cancelled')

  function send() {
    if (alreadySent && !confirm('This course has already been sent to Harken. Send a second request?')) return
    setError(null)
    start(async () => {
      const res = await sendInvoiceRequest(instanceId, note)
      if (res.ok) {
        setNote('')
        router.refresh()
      } else setError(res.error)
    })
  }

  function cancel(id: string) {
    if (!confirm('Withdraw this request? Harken will still see it until you tell them.')) return
    start(async () => {
      const res = await cancelInvoiceRequest(id)
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  return (
    <div>
      {requests.length > 0 && (
        <ul className="space-y-2 mb-4">
          {requests.map((r) => (
            <li key={r.id} className="border border-zinc-800 rounded p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm text-zinc-200 tabular-nums">
                  {fmtMoney(r.amount)}
                  {r.quote_number ? <span className="text-zinc-500 font-normal"> · {r.quote_number}</span> : null}
                </span>
                <span className="text-xs text-zinc-400">
                  {INVOICE_STATUS_LABEL[r.status]}
                  {r.status === 'invoiced' && r.invoice_number ? ` · ${r.invoice_number}` : ''}
                  {r.status === 'paid' && r.amount_received != null && r.amount_received !== r.amount
                    ? ` · ${fmtMoney(r.amount_received)} received`
                    : ''}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {[
                  r.sent_at ? `Sent ${shortDate(r.sent_at)}` : null,
                  r.invoiced_at ? `invoiced ${shortDate(r.invoiced_at)}` : null,
                  r.paid_at ? `paid ${shortDate(r.paid_at)}` : null,
                  r.bill_to_name ? `to ${r.bill_to_name}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {r.biller_note && <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">{r.biller_note}</p>}
              {r.status !== 'paid' && r.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  disabled={pending}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors mt-2"
                >
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {blocker ? (
        <p className="text-sm text-zinc-500">{blocker}</p>
      ) : (
        <>
          <p className="text-xs text-zinc-500 mb-3">
            Sends {fmtMoney(acceptedTotal!)} and {billTo!.name}
            {billTo!.email ? ` (${billTo!.email})` : ''} to {recipientNames.join(', ')}. What goes out is a copy —
            later edits to the contact or the quote will not change it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the biller needs — PO number, terms, where to submit"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={send}
              disabled={pending}
              className="px-3 py-2 text-sm rounded bg-pr-red/90 hover:bg-pr-red text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {pending ? 'Sending…' : alreadySent ? 'Send again' : 'Send to Harken'}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  )
}
