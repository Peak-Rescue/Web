'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/expenses'
import { INVOICE_STATUS_LABEL, type ChainLink, type InvoiceRequest } from '@/lib/billing'
import InfoHint from '@/components/InfoHint'
import { sendInvoiceRequest, cancelInvoiceRequest, recordInvoiced, recordPaid } from './billing-actions'

// Handing this course to Harken, and what came back.
//
// The button is guarded rather than hopeful: without a billing contact or an
// accepted quote it says which one is missing instead of sending a request the
// biller would only have to chase us about.

// One row of the send form: a label narrow enough to read down, and whatever
// the field is beside it. Wraps rather than truncating on a phone, because
// every one of these is a thing somebody has to be able to correct.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-500 w-16 shrink-0">{label}</span>
      {children}
    </div>
  )
}

const box = 'bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500'

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function BillingSection({
  instanceId,
  requests,
  billTo,
  suggested,
  forWhat,
  recipients,
}: {
  instanceId: string
  requests: InvoiceRequest[]
  /** Who the invoice goes to: the POC tagged billing in Details, or the
      course's own contact when nobody is tagged. `tagged` says which, so the
      screen can name the fallback rather than quietly billing whoever is
      first on the list. */
  billTo: { name: string; email: string | null; tagged: boolean } | null
  /** The number the chain has reached so far — what the client accepted,
      else what was quoted, else what the COA prices this at — with the words
      that say which. Never an answer, always a starting point: it is the same
      figure the page is already showing one fold up, and retyping it by hand
      is how the two come to disagree. */
  suggested: ChainLink | null
  /** The course as a biller reads it — ref, name, client, dates. Offered as
      what the invoice is for, and editable, because the client's PO calls it
      something else often enough to matter. */
  forWhat: string
  /** The active billers, who the request is mailed to. More than one and the
      send says which of them — all of them unless somebody says otherwise. */
  recipients: { id: string; name: string }[]
}) {
  const [note, setNote] = useState('')
  // Which request is being recorded against, and which of the two milestones.
  // One at a time: this is a correction to a record, not data entry, and two
  // open boxes on one list is how the wrong row gets the number.
  const [recording, setRecording] = useState<{ id: string; kind: 'invoiced' | 'paid' } | null>(null)
  const [entry, setEntry] = useState('')
  // What is about to be sent, all of it editable. Seeded from the course and
  // then owned by this form: the request is a snapshot of what Harken was
  // told, so the moment to correct any of it is before it goes.
  const [amount, setAmount] = useState(suggested === null ? '' : String(suggested.total))
  const [name, setName] = useState(billTo?.name ?? '')
  const [email, setEmail] = useState(billTo?.email ?? '')
  const [description, setDescription] = useState(forWhat)
  // Everybody, until somebody is unticked. Two billers at Harken is two people
  // who can raise this invoice, not two people who both need telling every
  // time — but which of them is a judgment, so the default is to tell them all.
  const [sendTo, setSendTo] = useState<string[]>(() => recipients.map((r) => r.id))
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
    : recipients.length === 0
      ? 'No active billing recipient. Add one in Portal → Billing.'
      : null

  // A second request is a real thing (a cut day, a renegotiation) but never
  // an accident. Sending again asks first.
  const alreadySent = requests.some((r) => r.status !== 'cancelled')

  function send() {
    if (alreadySent && !confirm('This course has already been sent to Harken. Send a second request?')) return
    setError(null)
    start(async () => {
      const res = await sendInvoiceRequest(instanceId, {
        note,
        amount,
        billToName: name,
        billToEmail: email,
        description,
        recipientIds: sendTo,
      })
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
        /* Four facts and a button: how much, who it goes to, what it is for,
           and anything the biller needs to know. Every one of them editable,
           because every one of them is occasionally wrong — a deposit rather
           than the whole price, accounts payable rather than the person who
           booked, a course the client calls something else on their PO. What
           is sent is a copy, so correcting it here changes what Harken is
           told and nothing else about the course.

           It read as two paragraphs of prose with one box under them. The
           sentences were all true and none of them were the thing you came
           here to do. */
        <div className="space-y-2.5">
          <Field label="Amount">
            <span className="text-zinc-500 text-sm">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${box} w-32 text-right`}
            />
            {/* Where the figure came from, in words — and a way back to it
                once it has been typed over. An estimate offered as a bare
                number would read as an agreed price; saying "COA 1 prices
                this at" makes it the starting point it actually is. */}
            {suggested &&
              (Math.abs(Number(amount.replace(/[$,\s]/g, '')) - suggested.total) > 0.005 ? (
                <button
                  type="button"
                  onClick={() => setAmount(String(suggested.total))}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
                >
                  {suggested.text} {fmtMoney(suggested.total)}
                </button>
              ) : (
                <span className="text-xs text-zinc-600">{suggested.text} this</span>
              ))}
          </Field>

          <Field label="Bill to">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className={`${box} w-44`}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={`${box} w-56`}
            />
            {billTo!.tagged ? null : (
              <InfoHint text="Nobody is marked the billing contact in Details, so this is the course's point of contact. Change it here for this invoice, or mark someone in Details to change it for good." />
            )}
          </Field>

          <Field label="For">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${box} flex-1 min-w-64`}
            />
          </Field>

          <Field label="Notes">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="PO number, terms, where to submit"
              className={`${box} flex-1 min-w-64`}
            />
          </Field>

          <div className="flex items-center gap-3 pt-1 sm:pl-[4.5rem]">
            <button
              type="button"
              onClick={send}
              disabled={pending || amount.trim() === '' || name.trim() === '' || sendTo.length === 0}
              className="px-3 py-2 text-sm rounded bg-pr-red/90 hover:bg-pr-red text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {pending ? 'Sending…' : alreadySent ? 'Send again' : 'Send to Harken'}
            </button>
            {/* Who at Harken, named where the sending happens — and changeable
                from here, because realising it should go to somebody else is
                something that happens with a finger over the button, not on
                the settings page you would otherwise have to go hunting for. */}
            {/* Who at Harken, named where the sending happens. With one biller
                it is a sentence; with two it is a choice, because telling the
                wrong half of a firm is how an invoice gets raised twice or
                not at all. Ticked by default either way — the queue is shared
                regardless, so this decides who is told, not who can see it. */}
            {recipients.length === 1 ? (
              <span className="text-xs text-zinc-600">to {recipients[0].name}</span>
            ) : (
              <span className="flex items-center gap-3 flex-wrap text-xs text-zinc-600">
                to
                {recipients.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendTo.includes(r.id)}
                      onChange={(e) =>
                        setSendTo((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((i) => i !== r.id)))
                      }
                      className="accent-pr-red"
                    />
                    {r.name}
                  </label>
                ))}
              </span>
            )}
            <span className="text-xs text-zinc-600">
              <Link
                href="/admin/billing"
                className="underline underline-offset-2 decoration-zinc-700 hover:text-zinc-300 transition-colors"
              >
                change
              </Link>
            </span>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  )
}
