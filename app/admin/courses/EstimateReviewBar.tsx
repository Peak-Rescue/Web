import { requestEstimateReview, respondEstimateReview } from './finance-actions'

// Server-rendered pieces of the estimate review loop: a banner the assigned
// reviewer answers from, and the request form + history for everyone else.

export type ReviewSubject = 'estimate' | 'gear'

export type EstimateReviewRow = {
  id: string
  created_at: string
  subject?: ReviewSubject | null
  requested_by: string
  reviewer_id: string
  note: string | null
  responded_at: string | null
  approved: boolean | null
  response_note: string | null
}

export type ReviewAdmin = { id: string; name: string }

// The estimate and the gear list run the same review loop; only the noun
// changes. Rows written before gear existed have no subject, so they read as
// estimate — which is what they were.
const SUBJECT_NOUN: Record<ReviewSubject, string> = { estimate: 'estimate', gear: 'gear list' }
const subjectOf = (r: EstimateReviewRow): ReviewSubject => (r.subject === 'gear' ? 'gear' : 'estimate')

const inputCls = 'bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function nameOf(admins: ReviewAdmin[], id: string) {
  return admins.find((a) => a.id === id)?.name ?? 'Former admin'
}

// Pending requests assigned to the current viewer — answer right here.
export function EstimateReviewBanner({
  reviews,
  admins,
  currentUserId,
  subject = 'estimate',
}: {
  reviews: EstimateReviewRow[]
  admins: ReviewAdmin[]
  currentUserId: string
  subject?: ReviewSubject
}) {
  const mine = reviews.filter((r) => r.reviewer_id === currentUserId && !r.responded_at && subjectOf(r) === subject)
  if (mine.length === 0) return null
  return (
    <div className="space-y-3 mb-5">
      {mine.map((r) => (
        <div key={r.id} className="bg-teal-950/40 border border-teal-800 rounded-lg p-4">
          <p className="text-sm font-medium text-teal-200">
            {nameOf(admins, r.requested_by)} asked you to review this {SUBJECT_NOUN[subject]} · {fmtDay(r.created_at)}
          </p>
          {r.note && <p className="text-sm text-zinc-300 mt-1">&ldquo;{r.note}&rdquo;</p>}
          <p className="text-xs text-zinc-400 mt-2">
            Edit anything above — it autosaves — then sign off or send notes back.
          </p>
          <form action={respondEstimateReview.bind(null, r.id)} className="mt-3 flex items-start gap-2 flex-wrap">
            <textarea
              name="response_note"
              rows={2}
              placeholder="Notes back (optional when approving)"
              className={`${inputCls} flex-1 min-w-60 resize-y`}
            />
            <button
              name="approved"
              value="true"
              className="px-4 py-2 bg-teal-800 hover:bg-teal-700 text-white rounded text-sm font-medium transition-colors"
            >
              Looks good ✓
            </button>
            <button
              name="approved"
              value="false"
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium transition-colors"
            >
              Send notes
            </button>
          </form>
        </div>
      ))}
    </div>
  )
}

// Ask another admin to look, plus how past asks went.
export function EstimateReviewRequest({
  instanceId,
  reviews,
  admins,
  currentUserId,
  subject = 'estimate',
}: {
  instanceId: string
  reviews: EstimateReviewRow[]
  admins: ReviewAdmin[]
  currentUserId: string
  subject?: ReviewSubject
}) {
  const others = admins.filter((a) => a.id !== currentUserId)
  const history = reviews
    .filter((r) => subjectOf(r) === subject)
    .filter((r) => r.responded_at || r.reviewer_id !== currentUserId)
    .slice(0, 4)
  return (
    <div className="mt-5 pt-4 border-t border-zinc-800/60">
      {history.length > 0 && (
        <div className="space-y-1 mb-3">
          {history.map((r) => (
            <p key={r.id} className="text-xs text-zinc-500">
              {r.responded_at ? (
                r.approved ? (
                  <>
                    <span className="text-teal-400">✓</span> {nameOf(admins, r.reviewer_id)} approved · {fmtDay(r.responded_at)}
                    {r.response_note && <span className="text-zinc-400"> — &ldquo;{r.response_note}&rdquo;</span>}
                  </>
                ) : (
                  <>
                    {nameOf(admins, r.reviewer_id)} left notes · {fmtDay(r.responded_at)}
                    {r.response_note && <span className="text-zinc-400"> — &ldquo;{r.response_note}&rdquo;</span>}
                  </>
                )
              ) : (
                <>
                  Review requested from {nameOf(admins, r.reviewer_id)} · {fmtDay(r.created_at)} · awaiting reply
                </>
              )}
            </p>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <form action={requestEstimateReview.bind(null, instanceId)} className="group flex items-center gap-2 flex-wrap">
          <input type="hidden" name="subject" value={subject} />
          <select name="reviewer_id" required defaultValue="" className={`${inputCls} text-zinc-300`}>
            <option value="" disabled>Select admin</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input name="note" placeholder="Note for them (optional)" className={`${inputCls} flex-1 min-w-48`} />
          <button
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors group-has-[select:invalid]:opacity-40 group-has-[select:invalid]:pointer-events-none"
            title="Emails them a link straight to this section"
          >
            Request {SUBJECT_NOUN[subject]} review
          </button>
        </form>
      )}
    </div>
  )
}
