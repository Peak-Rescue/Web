import SaveButton from '@/components/SaveButton'
import { createQuote, updateQuote, setQuoteStatus, deleteQuote, sendQuote } from './finance-actions'
import { quoteNumber } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'

export type QuotePerson = { id: string; name: string; email: string | null }

export type QuoteOption = { title: string; total: number; chosen?: boolean }

export type QuoteRow = {
  id: string
  accept_token: string
  prepared_by: string | null
  prepared_by_name: string | null
  quote_seq: number
  status: string
  issue_date: string
  valid_until: string | null
  total: number
  options: QuoteOption[] | null
  unit_rate_note: string | null
  scope_bullets: string[] | null
  course_blurb: string | null
  sent_at: string | null
  accepted_at: string | null
  accepted_name: string | null
}

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

// Server-rendered quotes list: drafts are editable and deletable, every quote
// links to its client-facing page, and status moves via explicit buttons
// (send/accept automation comes with the acceptance-page slice).
export default function QuotesSection({
  instanceId,
  refNumber,
  quotes,
  contactEmail,
  ccOptions,
  people,
  estimates,
}: {
  instanceId: string
  refNumber: number
  quotes: QuoteRow[]
  contactEmail: string | null
  ccOptions: string[]
  people: QuotePerson[]
  estimates: { id: string; title: string }[]
}) {
  return (
    <div>
      <div className="space-y-3">
        {quotes.map((q) => (
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
                {q.status === 'draft' && (
                  <>
                    {contactEmail ? (
                      <form action={sendQuote.bind(null, instanceId, q.id)} className="flex items-center gap-2.5 flex-wrap">
                        {ccOptions.map((email) => (
                          <label key={email} className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer" title={`Also send a copy to ${email}`}>
                            <input type="checkbox" name="cc_extra" value={email} className="accent-pr-red size-3.5" />
                            cc {email}
                          </label>
                        ))}
                        <button className="text-xs px-2.5 py-1 bg-pr-red hover:bg-pr-red-dark text-white rounded transition-colors">
                          Send to {contactEmail}
                        </button>
                      </form>
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
                    <form action={deleteQuote.bind(null, instanceId, q.id)}>
                      <button className="text-xs text-zinc-500 hover:text-pr-red-light transition-colors">Delete</button>
                    </form>
                  </>
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
                {q.options ? (
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Options (client picks one or more when accepting)</label>
                    <div className="space-y-2">
                      {q.options.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input name={`opt_title_${i}`} defaultValue={o.title} className={`${inputCls} flex-1`} />
                          <span className="text-zinc-600 text-xs">$</span>
                          <input name={`opt_total_${i}`} type="number" step="0.01" min="0" defaultValue={o.total} className={`${inputCls} basis-32 shrink-0 text-right`} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Total price (USD)</label>
                    <input name="total" type="number" step="0.01" min="0" defaultValue={q.total} className={inputCls} />
                  </div>
                )}
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
          </div>
        ))}
        {quotes.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500 border border-zinc-800 rounded-lg">
            No quotes yet — create one from the estimate above.
          </p>
        )}
      </div>

      <form action={createQuote.bind(null, instanceId)} className="mt-3 flex items-center gap-2 flex-wrap">
        {estimates.length > 1 ? (
          <select name="estimate_id" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm">
            {estimates.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
            <option value="__all__">All COAs as options — client picks</option>
          </select>
        ) : (
          estimates[0] && <input type="hidden" name="estimate_id" value={estimates[0].id} />
        )}
        <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors">
          New quote from {estimates.length > 1 ? 'selection' : 'estimate'}
        </button>
      </form>
    </div>
  )
}
