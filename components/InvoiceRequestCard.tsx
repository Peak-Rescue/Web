'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { fmtMoney } from '@/lib/expenses'
import { INVOICE_STATUS_LABEL, type InvoiceRequest } from '@/lib/billing'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import { btn } from '@/lib/ui'
import {
  recordInvoiced,
  recordPaid,
  cancelInvoiceRequest,
  deleteInvoiceRequest,
} from '@/app/admin/courses/billing-actions'

const REQUEST_TONE: Record<string, ChipTone> = {
  pending: 'idle',
  sent: 'waiting',
  invoiced: 'agreed',
  paid: 'paid',
  cancelled: 'gone',
}

// One request to Harken, wherever it is being looked at.
//
// The same card on the course and on the billing page, because it is the same
// question in both places — where has this got to, and what do I do about it.
// Two renderings drifted the moment one of them grew a button: the course
// could record a payment and the page that exists to watch payments could not.
//
// It reads top down: the money, then where it has got to, then the two facts
// people actually ask for (who we billed, who at Harken has it), then what can
// be done. The doing is buttons, not underlined grey words — a row of small
// grey text reads as a footnote, and these are the whole point of the card.

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function InvoiceRequestCard({
  request: r,
  courseHref,
  onChanged,
}: {
  request: InvoiceRequest
  /** Shown as a link to the course, for the pages that list requests from
      several. Omitted on the course itself, where it would point at here. */
  courseHref?: string
  onChanged: () => void
}) {
  const [recording, setRecording] = useState<'invoiced' | 'paid' | null>(null)
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) {
        setRecording(null)
        setEntry('')
        onChanged()
      } else setError(res.error)
    })
  }

  const done = r.status === 'cancelled'

  return (
    <div className={`border rounded p-3 ${done ? 'border-zinc-900' : 'border-zinc-800'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className={`text-base font-semibold tabular-nums ${done ? 'text-zinc-600 line-through' : 'text-zinc-100'}`}>
            {fmtMoney(r.amount)}
          </span>
          {r.quote_number && <span className="text-xs font-mono text-zinc-600">{r.quote_number}</span>}
          {courseHref && (
            <Link href={courseHref} className="text-sm text-zinc-400 hover:text-white transition-colors truncate">
              {r.description ?? 'Course'}
            </Link>
          )}
        </span>
        <StatusChip tone={REQUEST_TONE[r.status] ?? 'idle'}>
          {INVOICE_STATUS_LABEL[r.status]}
          {r.status === 'invoiced' && r.invoice_number ? ` · ${r.invoice_number}` : ''}
          {r.status === 'paid' && r.amount_received != null && r.amount_received !== r.amount
            ? ` · ${fmtMoney(r.amount_received)} in`
            : ''}
        </StatusChip>
      </div>

      {/* The two people a request is about, told apart in words. "to Bobbi
          Price" under a line about sending read as the client having been
          sent it, which is the one thing that never happens here. */}
      <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-0.5 text-xs">
        {r.bill_to_name && (
          <>
            <dt className="text-zinc-600">Bill to</dt>
            <dd className="text-zinc-400">
              {r.bill_to_name}
              {r.bill_to_org ? ` · ${r.bill_to_org}` : ''}
            </dd>
          </>
        )}
        <dt className="text-zinc-600">Sent</dt>
        <dd className="text-zinc-400">
          {r.sent_to && r.sent_to.length > 0 ? `to ${r.sent_to.join(' and ')} at Harken` : 'to Harken'}
          {r.sent_at ? ` · ${shortDate(r.sent_at)}` : ''}
        </dd>
        {r.invoiced_at && (
          <>
            <dt className="text-zinc-600">Invoiced</dt>
            <dd className="text-zinc-400">
              {r.invoice_number ? `${r.invoice_number} · ` : ''}
              {shortDate(r.invoiced_at)}
              {r.invoiced_by_admin ? ' · recorded here' : ''}
            </dd>
          </>
        )}
        {r.paid_at && (
          <>
            <dt className="text-zinc-600">Paid</dt>
            <dd className="text-zinc-400">
              {fmtMoney(r.amount_received ?? r.amount)} · {shortDate(r.paid_at)}
              {r.paid_by_admin ? ' · recorded here' : ''}
            </dd>
          </>
        )}
      </dl>

      {r.admin_note && <p className="mt-2 text-xs text-zinc-500 whitespace-pre-wrap">{r.admin_note}</p>}
      {r.biller_note && (
        <p className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap">
          <span className="text-zinc-600">Harken: </span>
          {r.biller_note}
        </p>
      )}

      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.status !== 'paid' && (
            <button type="button" className={btn.secondary} onClick={() => setRecording(recording === 'invoiced' ? null : 'invoiced')}>
              {r.invoiced_at ? 'Invoice number' : 'Mark invoiced'}
            </button>
          )}
          <button type="button" className={btn.secondary} onClick={() => setRecording(recording === 'paid' ? null : 'paid')}>
            {r.status === 'paid' ? 'Correct the payment' : 'Record payment'}
          </button>
          {r.status !== 'paid' && (
            <button
              type="button"
              disabled={pending}
              className={btn.danger}
              onClick={() => {
                if (confirm('Withdraw this request? Harken will still see it until you tell them.')) {
                  act(() => cancelInvoiceRequest(r.id))
                }
              }}
            >
              Withdraw
            </button>
          )}
        </div>
      )}

      {recording && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder={recording === 'invoiced' ? 'Their invoice number' : `Amount received (${fmtMoney(r.amount)})`}
            inputMode={recording === 'paid' ? 'decimal' : 'text'}
            className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500 w-48"
          />
          <button
            type="button"
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded bg-zinc-100 text-zinc-900 hover:bg-white transition-colors disabled:opacity-40"
            onClick={() =>
              act(() =>
                recording === 'invoiced'
                  ? recordInvoiced(r.id, { invoiceNumber: entry, note: '' })
                  : recordPaid(r.id, { amountReceived: entry.trim() || String(r.amount), note: '' })
              )
            }
          >
            Save
          </button>
          <button type="button" className={btn.secondary} onClick={() => setRecording(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* A withdrawn request is kept because "we asked and then said never
          mind" is worth knowing — but a test send is not a fact about the
          business, and leaving it struck through on the course forever is
          just noise. Only ever offered on a withdrawn one. */}
      {done && (
        <div className="mt-3">
          <button
            type="button"
            disabled={pending}
            className={btn.danger}
            onClick={() => {
              if (confirm('Throw this withdrawn request away? Nothing about it is kept.')) {
                act(() => deleteInvoiceRequest(r.id))
              }
            }}
          >
            Delete
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
