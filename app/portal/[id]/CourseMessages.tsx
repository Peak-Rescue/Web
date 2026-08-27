'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendCourseMessage, deleteCourseMessage, type MessageAudience } from './message-actions'

export type CourseMessage = {
  id: string
  subject: string
  body: string
  audience: MessageAudience
  created_at: string
  authorName: string | null
  recipient_count: number
  sent_count: number
}

const AUDIENCE_LABEL: Record<MessageAudience, string> = {
  students: 'Students',
  instructors: 'The instructors',
  everyone: 'Everyone',
}

// Group email to the course, and the record of what's been sent.
//
// The counterpart to Updates: this one is the email, not a pointer to a page,
// so it reaches people who won't log in — and it can't be taken back, which
// the compose box says plainly rather than discovering afterwards.
export default function CourseMessages({
  instanceId,
  messages,
  studentCount,
  instructorCount,
}: {
  instanceId: string
  messages: CourseMessage[]
  studentCount: number
  instructorCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<MessageAudience>('students')
  // On by default: the copy is how you know it left, rather than wondering
  // whether you pressed the button.
  const [copyMe, setCopyMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const countFor = (a: MessageAudience) =>
    a === 'students' ? studentCount : a === 'instructors' ? instructorCount : studentCount + instructorCount

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
  const count = countFor(audience)

  async function send() {
    if (!subject.trim() || !body.trim()) return
    if (!confirm(`Send this to ${count} ${count === 1 ? 'person' : 'people'}? It can't be unsent.`)) return

    setBusy(true); setError(null); setResult(null)
    try {
      const r = await sendCourseMessage(instanceId, { subject, body, audience, copyMe })
      setSubject(''); setBody(''); setOpen(false)
      setResult(r.problem ?? `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t send')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this from the sent record? The email itself is already gone.')) return
    setBusy(true); setError(null)
    try {
      await deleteCourseMessage(instanceId, id)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {open ? (
        <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-zinc-500">To</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as MessageAudience)}
              className={`text-xs ${input}`}
            >
              {(['students', 'instructors', 'everyone'] as const).map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]} ({countFor(a)})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={copyMe}
                onChange={(e) => setCopyMe(e.target.checked)}
                className="accent-pr-red size-3.5"
              />
              Copy me
            </label>
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={`w-full ${input}`}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="The message. This is what lands in their inbox, word for word — it can't be edited afterwards."
            className={`w-full resize-y ${input}`}
          />

          <p className="text-[11px] text-zinc-600">
            Your name and a link to the course page are added at the bottom. Replies come to you. Everyone is sent
            their own copy, so nobody sees anyone else’s address.
            {copyMe ? ' You get the same email, so you can see exactly what landed.' : ''}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={send}
              disabled={busy || !subject.trim() || !body.trim() || count === 0}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Sending…' : `Send to ${count}`}
            </button>
            <button
              onClick={() => { setOpen(false); setError(null) }}
              disabled={busy}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
            {count === 0 && <span className="text-xs text-zinc-500">Nobody in that group yet.</span>}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setOpen(true); setResult(null) }}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Write a message
          </button>
          <span className="text-xs text-zinc-500">
            Can’t be corrected once sent — post an update instead.
          </span>
        </div>
      )}

      {result && <p className="text-xs text-teal-300">{result}</p>}
      {error && <p className="text-xs text-pr-red">{error}</p>}

      {messages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Sent</p>
          {messages.map((m) => (
            <div key={m.id} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-baseline gap-2 flex-wrap">
                <button
                  onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  className="text-sm text-zinc-200 hover:text-white text-left"
                >
                  {m.subject}
                </button>
                <span className="text-[11px] text-zinc-600">
                  {AUDIENCE_LABEL[m.audience].toLowerCase()} · {m.sent_count}/{m.recipient_count} · {when(m.created_at)}
                  {m.authorName && ` · ${m.authorName}`}
                </span>
                <button
                  onClick={() => remove(m.id)}
                  disabled={busy}
                  className="ml-auto text-[11px] text-zinc-700 hover:text-pr-red transition-colors"
                >
                  Remove
                </button>
              </div>
              {expanded === m.id && (
                <p className="text-sm text-zinc-400 whitespace-pre-line mt-2 pt-2 border-t border-zinc-800">{m.body}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
