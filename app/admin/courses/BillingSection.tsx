'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/expenses'
import { INVOICE_STATUS_LABEL, type InvoiceRequest } from '@/lib/billing'
import { sendInvoiceRequest, cancelInvoiceRequest, recordInvoiced, recordPaid } from './billing-actions'

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
  /** Who the invoice goes to: the POC tagged billing in Details, or the
      course's own contact when nobody is tagged. `tagged` says which, so the
      screen can name the fallback rather than quietly billing whoever is
      first on the list. */
  billTo: { name: string; email: string | null; tagged: boolean } | null
  /** The accepted quote's total, or null if nothing has been accepted. */
  acceptedTotal: number | null
  recipientNames: string[]
}) {
  const [note, setNote] = useState('')
  // Which request is being recorded against, and which of the two milestones.
  // One at a time: this is a correction to a record, not data entry, and two
  // open boxes on one list is how the wrong row gets the number.
  const [recording, setRecording] = useState<{ id: string; kind: 'invoiced' | 'paid' } | null>(null)
  const [entry, setEntry] = useState('')
  // The agreed figure, typed, for a course with no accepted quote behind it.
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  // What actually stops a request going out: nobody to bill, or nobody to
  // send it to. A missing accepted quote is not one of them — plenty of
  // courses are booked against a PO or agreed on a call, and a course that
  // has already run cannot be held hostage to paperwork that took a different
  // route. It asks for the number instead.
  const blocker = !billTo
    ? 'Add a point of contact in Details before handing this to Harken.'
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
      const res = await sendInvoiceRequest(instanceId, note, amount)
      if (res.ok) {
        setNote('')
        setAmount('')
        router.refresh()
      } else setError(res.error)
    })
  }

  function record(r: InvoiceRequest) {
    if (!recording) return
    const kind = recording.kind
    setError(null)
    start(async () => {
      const res =
        kind === 'invoiced'
          ? await recordInvoiced(r.id, { invoiceNumber: entry, note: '' })
          : await recordPaid(r.id, { amountReceived: entry.trim() || String(r.amount), note: '' })
      if (res.ok) {
        setRecording(null)
        setEntry('')
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
              {(r.invoiced_by_admin || r.paid_by_admin) && (
                <p className="text-xs text-zinc-600 mt-1">Recorded here, not by Harken.</p>
              )}

              {/* The biller marks her own work on her own page, and that stays
                  the ordinary route. These are for when it happens anywhere
                  else — a number confirmed in a reply, a payment mentioned on
                  a call — because otherwise this says "with Harken" about a
                  course that was invoiced and paid months ago. */}
              {r.status !== 'cancelled' && (
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {r.status !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => setRecording(recording?.id === r.id && recording.kind === 'invoiced' ? null : { id: r.id, kind: 'invoiced' })}
                      className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                      {r.invoiced_at ? 'Invoice number' : 'Mark invoiced'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRecording(recording?.id === r.id && recording.kind === 'paid' ? null : { id: r.id, kind: 'paid' })}
                    className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    {r.status === 'paid' ? 'Correct the payment' : 'Record payment'}
                  </button>
                  {r.status !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => cancel(r.id)}
                      disabled={pending}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              )}

              {recording?.id === r.id && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <input
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    placeholder={recording.kind === 'invoiced' ? 'Their invoice number' : `Amount received (${fmtMoney(r.amount)})`}
                    inputMode={recording.kind === 'paid' ? 'decimal' : 'text'}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500 w-44"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => record(r)}
                    className="px-2.5 py-1 text-xs rounded bg-zinc-100 text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
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
            Sends {acceptedTotal === null ? 'the amount below' : fmtMoney(acceptedTotal)} and {billTo!.name}
            {billTo!.email ? ` (${billTo!.email})` : ''} to {recipientNames.join(', ')}. What goes out is a copy —
            later edits to the contact or the quote will not change it.
            {/* Said out loud, because billing the person who booked the course
                is right nearly every time and wrong in a way nobody would
                catch: the invoice simply arrives at the wrong desk. */}
            {!billTo!.tagged && (
              <> The bill goes to the course contact — mark someone the billing contact in Details if it should not.</>
            )}
          </p>
          {/* No quote went out through the portal, so the number has to come
              from the person who knows it. Asked for here rather than by
              sending them off to invent a quote nobody will ever look at. */}
          {acceptedTotal === null && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-zinc-500 text-sm">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-right focus:outline-none focus:border-zinc-500"
              />
              <span className="text-xs text-zinc-500">
                No accepted quote on this course — the agreed amount.
              </span>
            </div>
          )}
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
              disabled={pending || (acceptedTotal === null && amount.trim() === '')}
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
