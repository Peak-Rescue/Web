'use client'

import { useState, useTransition } from 'react'
import SaveButton from '@/components/SaveButton'
import QuoteSendForm from './QuoteSendForm'
import { createQuote, updateQuote, setQuoteStatus, deleteQuote, sendQuote, reopenQuote } from './finance-actions'
import QuoteTotalFields from './QuoteTotalFields'
import { quoteNumber, type QuoteOption, type QuoteRow } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'
import StatusChip, { QUOTE_STATUS } from '@/components/StatusChip'
import InfoHint from '@/components/InfoHint'
import { btn, card } from '@/lib/ui'

export type QuotePerson = { id: string; name: string; email: string | null }

export type { QuoteOption, QuoteRow }

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const labelCls = 'block text-xs text-zinc-400 mb-1'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// The quotes list: drafts are editable and deletable, every quote links to
// its client-facing page, and status moves via explicit buttons.
//
// Adding and deleting a draft are done here in the browser rather than by
// revalidating: this list sits inside the course page, and a page-wide
// re-render to put one row on the end of a list took seconds. Everything that
// changes what the rest of the page says — marking sent, accepted, declined,
// saving edits — still goes through the server and still refreshes it.
export default function QuotesSection({
  instanceId,
  refNumber,
  quotes,
  contactEmail,
  ccOptions,
  adminCcOptions,
  people,
  estimates,
  coaTitles,
}: {
  instanceId: string
  refNumber: number
  quotes: QuoteRow[]
  contactEmail: string | null
  ccOptions: string[]
  /** Admins who can be copied on the client's email — the receipt that says
      the quote went out, without their having to check the portal. */
  adminCcOptions: { id: string; name: string; email: string }[]
  people: QuotePerson[]
  estimates: { id: string; title: string; price: number }[]
  /** Title of every COA on the course, set-aside ones included — a quiet quote
      still has to be able to say which option it priced. */
  coaTitles: Record<string, string>
  /** The photo the quote page will use. It sits on this row because that is
      the row that makes a quote — a picture chosen somewhere else is a setting
      you do not know applies until you have already sent one. */
}) {
  // Rows this browser has added or dropped since the page was rendered. They
  // are merged with the server's list rather than replacing it, so whenever
  // the page does re-render for its own reasons the server's copy wins: an
  // added row drops out of `added` the moment the real one arrives under the
  // same id, and a deleted one is already gone from what came back.
  const [added, setAdded] = useState<QuoteRow[]>([])
  const [deleted, setDeleted] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [source, setSource] = useState(estimates[0]?.id ?? '')

  const serverIds = new Set(quotes.map((q) => q.id))
  const allQuotes = [...added.filter((q) => !serverIds.has(q.id)), ...quotes].filter(
    (q) => !deleted.includes(q.id),
  )

  function addQuote() {
    setError(null)
    start(async () => {
      const res = await createQuote(instanceId, estimates.length > 1 ? source : estimates[0]?.id ?? '')
      if (res.ok) setAdded((rows) => [res.quote, ...rows])
      else setError(res.error)
    })
  }

  function reopen(id: string, status: string) {
    if (
      !confirm(
        status === 'accepted'
          ? 'Take back this acceptance? The course goes back to unconfirmed unless another quote is accepted.'
          : 'Reopen this declined quote?'
      )
    ) {
      return
    }
    setError(null)
    start(async () => {
      const res = await reopenQuote(instanceId, id)
      if (!res.ok) setError(res.error)
    })
  }

  function removeQuote(quoteId: string) {
    setError(null)
    start(async () => {
      const res = await deleteQuote(instanceId, quoteId)
      if (res.ok) setDeleted((ids) => [...ids, quoteId])
      else setError(res.error)
    })
  }

  // Current price of every COA on the course, for the "update from estimate"
  // buttons on draft quotes.
  const coaPrices = Object.fromEntries(estimates.map((e) => [e.id, e.price]))
  // Quotes whose every COA has been set aside. They keep their numbers, their
  // status and their client-facing page — they just stop competing for
  // attention with the quote that is actually in play.
  const liveQuotes = allQuotes.filter((q) => !q.archived_at)
  const asideQuotes = allQuotes.filter((q) => q.archived_at)
  const sourceTitles = (q: QuoteRow) =>
    [...new Set([q.estimate_id, ...(q.options ?? []).map((o) => o.estimate_id ?? null)])]
      .filter((id): id is string => Boolean(id))
      .map((id) => coaTitles[id])
      .filter(Boolean)
      .join(' + ')
  return (
    <div>
      {/* The way in sits above the list: with no quotes yet it's the only thing
          to do here, and the empty box shouldn't stand between you and it. */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {estimates.length > 1 && (
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
          >
            {estimates.map((e) => (
              <option key={e.id} value={e.id}>{e.title} — {fmtMoney(e.price)}</option>
            ))}
            <option value="__all__">All COAs as options — client picks</option>
          </select>
        )}
        <button
          type="button"
          onClick={addQuote}
          disabled={pending}
          className={btn.secondaryLg}
        >
          {pending ? 'Working…' : `New quote from ${estimates.length > 1 ? 'selection' : 'estimate'}`}
        </button>
        <InfoHint text="Marking a quote sent or accepted moves the course itself to Quoted or Confirmed." />
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {liveQuotes.map((q) => (
          <div key={q.id} className={card}>
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{quoteNumber(refNumber, q.quote_seq)}</span>
                <StatusChip tone={QUOTE_STATUS[q.status]?.tone ?? 'idle'}>
                  {QUOTE_STATUS[q.status]?.label ?? q.status}
                </StatusChip>
                {q.options ? (
                  q.options.some((o) => o.chosen) ? (
                    <span className="text-sm font-medium">
                      {fmtMoney(q.options.filter((o) => o.chosen).reduce((s, o) => s + Number(o.total), 0))}
                      <span className="ml-1.5 text-xs font-normal text-teal-300">
                        ✓ {q.options.filter((o) => o.chosen).map((o) => o.title).join(' + ')}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm font-medium" title={q.options.map((o) => `${o.title} — ${fmtMoney(o.total)}`).join(' · ')}>
                      {q.options.length} options
                    </span>
                  )
                ) : (
                  <span className="text-sm font-medium">{fmtMoney(q.total)}</span>
                )}
                <span className="text-xs text-zinc-500">
                  issued {fmtDate(q.issue_date)}
                  {q.valid_until ? ` · valid through ${fmtDate(q.valid_until)}` : ''}
                  {q.accepted_at ? ` · accepted${q.accepted_name ? ` by ${q.accepted_name}` : ''} ${fmtDate(q.accepted_at.slice(0, 10))}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/quote/${q.accept_token}`}
                  target="_blank"
                  className="text-xs text-zinc-300 underline hover:text-white transition-colors"
                >
                  View page
                </a>
                {/* The way back from a one-click outcome. Accepting is a
                    button on a row of buttons and everything downstream
                    believes it immediately — the course confirms, Billing
                    unlocks — so the click has to be undoable by the person
                    who made it rather than by a hand fix in the database.
                    The quote returns to sent if it ever went out, and to
                    draft if it never did. */}
                {(q.status === 'accepted' || q.status === 'declined') && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => reopen(q.id, q.status)}
                    className={btn.quiet}
                  >
                    Not {q.status}
                  </button>
                )}
                {q.status === 'sent' && (
                  <>
                    <form action={setQuoteStatus.bind(null, instanceId, q.id, 'accepted')} className="flex items-center gap-2.5 flex-wrap">
                      {/* Options quote accepted off-page (phone/email): record which
                          option(s) the client committed to. */}
                      {(q.options ?? []).map((o, i) => (
                        <label key={i} className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer" title={fmtMoney(Number(o.total))}>
                          <input type="checkbox" name="chosen_opt" value={i} className="accent-pr-red size-3.5" />
                          {o.title}
                        </label>
                      ))}
                      <button className={btn.agree}>Mark accepted</button>
                    </form>
                    <form action={setQuoteStatus.bind(null, instanceId, q.id, 'declined')}>
                      <button className={btn.danger}>Declined</button>
                    </form>
                  </>
                )}
              </div>
            </div>

            {q.status === 'draft' && (
              <form action={updateQuote.bind(null, instanceId, q.id)} className="px-4 pb-4 grid sm:grid-cols-3 gap-3 border-t border-zinc-800 pt-3">
                <QuoteTotalFields
                  total={q.total}
                  options={q.options}
                  estimateId={q.estimate_id}
                  coaPrices={coaPrices}
                />
                <div>
                  <label className={labelCls}>Valid through</label>
                  <input name="valid_until" type="date" defaultValue={q.valid_until ?? ''} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unit rate note (optional)</label>
                  <input name="unit_rate_note" defaultValue={q.unit_rate_note ?? ''} placeholder="e.g. $440 per student per day" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>From (contact &amp; signature on the quote)</label>
                  <select name="prepared_by" defaultValue={q.prepared_by ?? ''} className={inputCls}>
                    {!q.prepared_by && <option value="">— choose —</option>}
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.email ? ` (${p.email})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Scope bullets (one per line — shown under the price)</label>
                  <textarea name="scope_bullets" rows={3} defaultValue={(q.scope_bullets ?? []).join('\n')} className={`${inputCls} resize-y`} />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Course overview (shown above the price on the quote page; leave empty to skip it)</label>
                  <textarea name="course_blurb" rows={4} defaultValue={q.course_blurb ?? ''} className={`${inputCls} resize-y`} />
                </div>
                <div className="sm:col-span-3">
                  {/* Saving a draft changes nothing outside this page, so it
                      is ordinary work — the red belongs to the send below. */}
                  <SaveButton className={btn.secondaryLg}>Save quote</SaveButton>
                </div>
              </form>
            )}

            {/* Sending is the last thing you do to a draft, so it sits last:
                under the fields you just checked and the Save you just
                pressed, not up in the header where it was reachable before
                you had read a word of the quote. The addresses ride with it —
                who it goes to is part of the send, not of the title bar. */}
            {q.status === 'draft' && (
              <div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-3 flex-wrap">
                {contactEmail ? (
                  <QuoteSendForm
                    action={sendQuote.bind(null, instanceId, q.id)}
                    contactEmail={contactEmail}
                    ccOptions={ccOptions}
                    adminCcOptions={adminCcOptions}
                  />
                ) : (
                  <span className="text-xs text-zinc-600" title="Add a point-of-contact email in Details to send from here">
                    no POC email
                  </span>
                )}
                <form action={setQuoteStatus.bind(null, instanceId, q.id, 'sent')}>
                  <button className={btn.secondary}>Mark sent</button>
                </form>
                {/* Agreed without this quote ever leaving the portal — a price
                    settled on a call, a PO against a number given by email.
                    Marking it sent first to be allowed to mark it accepted
                    recorded a send that never happened, and it is the
                    accepted quote that everything downstream reads: the
                    course becomes confirmed by it and Billing draws its
                    number from it. Asks first, because nothing here takes an
                    acceptance back. */}
                <form
                  action={setQuoteStatus.bind(null, instanceId, q.id, 'accepted')}
                  onSubmit={(e) => {
                    if (!confirm('Mark this quote accepted without sending it from here? Use this when the client agreed to it some other way.')) {
                      e.preventDefault()
                    }
                  }}
                  className="flex items-center gap-2.5 flex-wrap"
                >
                  {(q.options ?? []).map((o, i) => (
                    <label key={i} className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer" title={fmtMoney(Number(o.total))}>
                      <input type="checkbox" name="chosen_opt" value={i} className="accent-pr-red size-3.5" />
                      {o.title}
                    </label>
                  ))}
                  <button title="They have already agreed to this price" className={btn.agree}>
                    Already accepted
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => removeQuote(q.id)}
                  disabled={pending}
                  className={`ml-auto ${btn.danger}`}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {allQuotes.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500 border border-zinc-800 rounded-lg">
            No quotes yet.
          </p>
        )}
        {liveQuotes.length === 0 && asideQuotes.length > 0 && (
          <p className="py-6 text-center text-sm text-zinc-500 border border-zinc-800 rounded-lg">
            Every quote on this course came from a COA that has been set aside.
          </p>
        )}
      </div>

      {asideQuotes.length > 0 && (
        <details className="mt-4 group">
          <summary className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer list-none">
            <span className="transition-transform group-open:rotate-90">›</span>
            {asideQuotes.length} set aside with {asideQuotes.length === 1 ? 'its' : 'their'} COA
            <span className="text-zinc-600 min-w-0 truncate group-open:hidden">
              {asideQuotes.map((q) => `${quoteNumber(refNumber, q.quote_seq)} (${q.status})`).join(', ')}
            </span>
          </summary>
          <ul className="mt-2 border-l border-zinc-800 pl-3 space-y-1.5">
            {asideQuotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex items-center gap-2.5">
                  <span className="font-mono text-xs text-zinc-400">{quoteNumber(refNumber, q.quote_seq)}</span>
                  <StatusChip tone={QUOTE_STATUS[q.status]?.tone ?? 'idle'}>
                    {QUOTE_STATUS[q.status]?.label ?? q.status}
                  </StatusChip>
                  <span className="text-xs text-zinc-600 min-w-0 truncate">{sourceTitles(q) || 'COA deleted'}</span>
                </span>
                <span className="shrink-0 flex items-center gap-3 text-xs">
                  <span className="text-zinc-500 [font-variant-numeric:tabular-nums]">
                    {q.options && q.total === 0 ? `${q.options.length} options` : fmtMoney(q.total)}
                  </span>
                  <a href={`/quote/${q.accept_token}`} target="_blank" className="text-zinc-500 underline hover:text-white transition-colors">
                    View page
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 pl-3 text-[11px] text-zinc-600">
            These come back on their own when their COA does.
          </p>
        </details>
      )}
    </div>
  )
}
