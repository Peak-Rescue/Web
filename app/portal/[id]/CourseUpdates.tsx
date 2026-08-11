'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { postCourseUpdate, deleteCourseUpdate } from './update-actions'

export type CourseUpdate = {
  id: string
  body: string
  created_at: string
  authorName: string | null
  sent_count: number
  recipient_count: number
  emailed_at: string | null
}

// Updates for the people on the course, posted by the team and emailed out.
//
// Students see the list. Staff also get the box — and a plain warning above
// the button, because the difference between this and editing the course info
// is that this one lands in people's inboxes and can't be taken back.
export default function CourseUpdates({
  instanceId,
  updates,
  canPost,
  enrolledCount,
}: {
  instanceId: string
  updates: CourseUpdate[]
  canPost: boolean
  enrolledCount: number
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  async function post() {
    const text = body.trim()
    if (!text) return
    const who = enrolledCount === 1 ? '1 student' : `${enrolledCount} students`
    if (!confirm(`Post this and email ${who}? The email can't be unsent.`)) return

    setBusy(true); setError(null); setResult(null)
    try {
      const r = await postCourseUpdate(instanceId, text)
      setBody('')
      setResult(
        r.emailProblem ??
        `Posted and emailed to ${r.sent} ${r.sent === 1 ? 'student' : 'students'}.`
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t post')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this update from the course page? The email already sent stays sent.')) return
    setBusy(true); setError(null)
    try {
      await deleteCourseUpdate(instanceId, id)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="e.g. Rain forecast Thursday — bring the drysuit, not the wetsuit."
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-zinc-500"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={post}
              disabled={busy || !body.trim()}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Sending…' : 'Post and email'}
            </button>
            <span className="text-xs text-zinc-500">
              {enrolledCount === 0
                ? 'Nobody is enrolled yet — this will post to the course page only.'
                : `Emails ${enrolledCount === 1 ? 'the 1 student' : `all ${enrolledCount} students`} enrolled, and stays on this page.`}
            </span>
          </div>
          {result && <p className="text-xs text-teal-300">{result}</p>}
          {error && <p className="text-xs text-pr-red">{error}</p>}
        </div>
      )}

      {updates.length === 0 ? (
        canPost && <p className="text-xs text-zinc-600">No updates posted yet.</p>
      ) : (
        <div className="space-y-2">
          {updates.map((u) => (
            <div key={u.id} className="px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-zinc-400">{u.authorName ?? 'Peak Rescue'}</span>
                <span className="text-[11px] text-zinc-600">{when(u.created_at)}</span>
                {canPost && (
                  <>
                    <span className="text-[11px] text-zinc-600">
                      {u.emailed_at
                        ? `emailed ${u.sent_count}/${u.recipient_count}`
                        : 'not emailed'}
                    </span>
                    <button
                      onClick={() => remove(u.id)}
                      disabled={busy}
                      className="ml-auto text-[11px] text-zinc-600 hover:text-pr-red transition-colors"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              <p className="text-sm text-zinc-200 whitespace-pre-line mt-1">{u.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
