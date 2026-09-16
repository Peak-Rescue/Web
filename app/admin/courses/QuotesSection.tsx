'use client'

import { useState, useTransition } from 'react'
import SaveButton from '@/components/SaveButton'
import QuoteSendForm from './QuoteSendForm'
import { createQuote, updateQuote, setQuoteStatus, deleteQuote, sendQuote } from './finance-actions'
import QuoteTotalFields from './QuoteTotalFields'
import { quoteNumber, type QuoteOption, type QuoteRow } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'

export type QuotePerson = { id: string; name: string; email: string | null }

export type { QuoteOption, QuoteRow }

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400',
  sent: 'bg-blue-900/60 text-blue-300',
  accepted: 'bg-teal-900/60 text-teal-300',
  declined: 'bg-red-900/50 text-red-300',
  expired: 'bg-yellow-900/50 text-yellow-300',
}

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
  heroPicker,
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
  heroPicker?: React.ReactNode
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
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {pending ? 'Working…' : `New quote from ${estimates.length > 1 ? 'selection' : 'estimate'}`}
        </button>
        {heroPicker && <div className="ml-auto">{heroPicker}</div>}
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {liveQuotes.map((q) => (
          <div key={q.id} className="bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{quoteNumber(refNumber, q.quote_seq)}</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${STATUS_BADGE[q.status] ?? STATUS_BADGE.draft}`}>
                  {q.status}
                </span>
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
                      <button className="text-xs px-2.5 py-1 bg-teal-800 hover:bg-teal-700 text-white rounded transition-colors">
                        Mark accepted
                      </button>
                    </form>
                    <form action={setQuoteStatus.bind(null, instanceId, q.id, 'declined')}>
                      <button className="text-xs text-zinc-500 hover:text-pr-red-light transition-colors">Declined</button>
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
                  <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                    Save quote
                  </SaveButton>
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
                  <button className="text-xs px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors">
                    Mark sent
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => removeQuote(q.id)}
                  disabled={pending}
                  className="ml-auto text-xs text-zinc-500 hover:text-pr-red-light transition-colors disabled:opacity-50"
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
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${STATUS_BADGE[q.status] ?? STATUS_BADGE.draft}`}>
                    {q.status}
                  </span>
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
