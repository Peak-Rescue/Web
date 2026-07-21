import SaveButton from '@/components/SaveButton'
import { createQuote, updateQuote, setQuoteStatus, deleteQuote, sendQuote } from './finance-actions'
import { quoteNumber } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'

export type QuoteRow = {
  id: string
  accept_token: string
  quote_seq: number
  status: string
  issue_date: string
  valid_until: string | null
  total: number
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
// has a PDF, and status moves via explicit buttons (send/accept automation
// comes with the acceptance-page slice).
export default function QuotesSection({
  instanceId,
  refNumber,
  quotes,
  contactEmail,
}: {
  instanceId: string
  refNumber: number
  quotes: QuoteRow[]
  contactEmail: string | null
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
                <span className="text-sm font-medium">{fmtMoney(q.total)}</span>
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
                <a
                  href={`/quote/${q.accept_token}?print=1`}
                  target="_blank"
                  className="text-xs text-zinc-500 underline hover:text-white transition-colors"
                  title="Opens the quote page and the print dialog — save as PDF from there"
                >
                  Print / PDF
                </a>
                {q.status === 'draft' && (
                  <>
                    {contactEmail ? (
                      <form action={sendQuote.bind(null, instanceId, q.id)}>
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
                    <form action={setQuoteStatus.bind(null, instanceId, q.id, 'accepted')}>
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
                <div>
                  <label className={labelCls}>Total price (USD)</label>
                  <input name="total" type="number" step="0.01" min="0" defaultValue={q.total} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Valid through</label>
                  <input name="valid_until" type="date" defaultValue={q.valid_until ?? ''} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unit rate note (optional)</label>
                  <input name="unit_rate_note" defaultValue={q.unit_rate_note ?? ''} placeholder="e.g. $440 per student per day" className={inputCls} />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Scope bullets (one per line — shown under the price)</label>
                  <textarea name="scope_bullets" rows={3} defaultValue={(q.scope_bullets ?? []).join('\n')} className={`${inputCls} resize-y`} />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Course overview (page 2 of the PDF; leave empty to skip the page)</label>
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

      <form action={createQuote.bind(null, instanceId)} className="mt-3">
        <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors">
          New quote from estimate
        </button>
      </form>
    </div>
  )
}
