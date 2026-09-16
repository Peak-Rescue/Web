'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/expenses'
import type { InvoiceRequest } from '@/lib/billing'
import { markInvoiced, markPaid } from './actions'

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const btnCls =
  'px-3 py-2 text-sm rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50'
const primaryCls =
  'px-3 py-2 text-sm rounded bg-pr-red/90 hover:bg-pr-red text-white transition-colors disabled:opacity-50'

// Who to bill, as a block you can copy out of rather than a line to squint at.
function BillTo({ r }: { r: InvoiceRequest }) {
  const has = r.bill_to_name || r.bill_to_email || r.bill_to_phone || r.bill_to_org
  if (!has) return <p className="text-sm text-zinc-500">No billing contact was supplied.</p>
  return (
    <div className="text-sm min-w-0">
      {r.bill_to_name && <p className="text-zinc-200">{r.bill_to_name}</p>}
      {r.bill_to_org && <p className="text-zinc-400">{r.bill_to_org}</p>}
      {r.bill_to_email && (
        <a href={`mailto:${r.bill_to_email}`} className="block text-zinc-400 hover:text-white transition-colors truncate">
          {r.bill_to_email}
        </a>
      )}
      {r.bill_to_phone && (
        <a href={`tel:${r.bill_to_phone}`} className="block text-zinc-400 hover:text-white transition-colors">
          {r.bill_to_phone}
        </a>
      )}
      {r.bill_to_note && <p className="text-zinc-500 mt-1 whitespace-pre-wrap">{r.bill_to_note}</p>}
    </div>
  )
}

function Row({ r, token }: { r: InvoiceRequest; token: string }) {
  // One row opens at a time and only on purpose: the queue is meant to be
  // readable at a glance, and four inline forms stacked is not a glance.
  const [openForm, setOpenForm] = useState<null | 'invoiced' | 'paid'>(null)
  const [invoiceNumber, setInvoiceNumber] = useState(r.invoice_number ?? '')
  const [amount, setAmount] = useState(r.amount_received != null ? String(r.amount_received) : String(r.amount))
  const [note, setNote] = useState(r.biller_note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) {
        setOpenForm(null)
        router.refresh()
      } else setError(res.error)
    })
  }

  return (
    <li className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-zinc-100 font-medium min-w-0">{r.description ?? 'Course'}</p>
        <p className="text-lg tabular-nums text-zinc-100">{fmtMoney(r.amount)}</p>
      </div>
      {/* Said as "our quote" because the row carries two numbers that look
          alike — ours and hers — and an unlabelled one is the one that ends
          up on the wrong line of an invoice. */}
      {r.quote_number && (
        <p className="text-xs text-zinc-500 mt-0.5">Our quote {r.quote_number}</p>
      )}

      {r.status === 'invoiced' && (
        <p className="text-xs text-teal-400 mt-1">
          Invoiced{r.invoice_number ? ` · ${r.invoice_number}` : ''} — waiting on payment
        </p>
      )}
      {r.status === 'paid' && (
        <p className="text-xs text-teal-400 mt-1">
          Paid{r.amount_received != null ? ` · ${fmtMoney(r.amount_received)}` : ''}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Bill to</p>
          <BillTo r={r} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} onClick={() => setOpenForm(openForm === 'invoiced' ? null : 'invoiced')}>
            {r.status === 'invoiced' ? 'Edit invoice no.' : 'Mark invoiced'}
          </button>
          <button type="button" className={primaryCls} onClick={() => setOpenForm(openForm === 'paid' ? null : 'paid')}>
            Payment received
          </button>
        </div>
      </div>

      {r.admin_note && (
        <p className="text-sm text-zinc-400 mt-3 whitespace-pre-wrap border-l-2 border-zinc-700 pl-3">{r.admin_note}</p>
      )}

      {openForm === 'invoiced' && (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Your invoice number</label>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              className={primaryCls}
              onClick={() => run(() => markInvoiced(token, r.id, { invoiceNumber, note }))}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}

      {openForm === 'paid' && (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            {/* Prefilled with what was billed, because it usually matches —
                and editable, because a short payment is the one thing this
                field exists to be able to say. */}
            <label className="block text-xs text-zinc-400 mb-1">Amount received</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              className={primaryCls}
              onClick={() => run(() => markPaid(token, r.id, { amountReceived: amount, note }))}
            >
              {pending ? 'Saving…' : 'Record payment'}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </li>
  )
}

export default function BillingQueue({
  token,
  open,
  paid,
}: {
  token: string
  open: InvoiceRequest[]
  paid: InvoiceRequest[]
}) {
  const [showPaid, setShowPaid] = useState(false)
  const outstanding = open.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="mt-8">
      {open.length === 0 ? (
        <p className="text-sm text-zinc-500 border border-zinc-800 rounded-lg p-6 text-center">
          Nothing to bill right now.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              {open.length} to bill
            </p>
            <p className="text-sm text-zinc-400 tabular-nums">{fmtMoney(outstanding)} outstanding</p>
          </div>
          <ul className="space-y-3">
            {open.map((r) => (
              <Row key={r.id} r={r} token={token} />
            ))}
          </ul>
        </>
      )}

      {/* History, folded. It only grows, and the question it answers is
          always about something recent. */}
      {paid.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowPaid((s) => !s)}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showPaid ? 'Hide' : 'Show'} paid ({paid.length})
          </button>
          {showPaid && (
            <ul className="mt-3 space-y-2">
              {paid.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm border-b border-zinc-900 pb-2">
                  <span className="text-zinc-400 min-w-0">
                    {r.description ?? 'Course'}
                    {r.quote_number ? <span className="text-zinc-600"> · {r.quote_number}</span> : null}
                  </span>
                  <span className="text-zinc-500 tabular-nums">
                    {r.invoice_number ? `${r.invoice_number} · ` : ''}
                    {fmtMoney(r.amount_received ?? r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
