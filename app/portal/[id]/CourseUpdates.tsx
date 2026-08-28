'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { linkLabel } from '@/lib/course-links'
import Composer from './UpdateComposer'
import {
  postCourseUpdate, editCourseUpdate, deleteCourseUpdate, renotifyCourseUpdate,
  type UpdateLink, type UpdateAttachment, type UpdateAudience,
} from './update-actions'

export type CourseUpdate = {
  id: string
  body: string
  created_at: string
  updated_at: string | null
  created_by: string | null
  authorName: string | null
  sent_count: number
  recipient_count: number
  notify_count: number
  emailed_at: string | null
  audience: UpdateAudience
  links: UpdateLink[]
  // Signed on the server — attachments live in a private bucket.
  attachments: (UpdateAttachment & { url: string })[]
  /** Posted since this reader last opened the course. */
  isNew?: boolean
}

import type { NotifyCounts } from '@/lib/course-notify'
import ComposerTrigger, { SendIcon } from '@/components/ComposerTrigger'
export type { NotifyCounts }

// Updates for the people on the course. The email only points here, so this
// page is the one copy: editing an update corrects what everyone sees, and
// nothing needs unsending.
export default function CourseUpdates({
  instanceId,
  updates,
  canPost,
  notifyCounts,
}: {
  instanceId: string
  updates: CourseUpdate[]
  canPost: boolean
  /** Inboxes per group, you excepted — counted by address on the server, since
      the button promises a number before it sends anything. */
  notifyCounts: NotifyCounts
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // Closed until asked for, like the email composer beside it. A box standing
  // permanently open is a box the feed has to be read around.
  const [composing, setComposing] = useState(false)

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  async function run(fn: () => Promise<string | void>) {
    setBusy(true); setError(null); setResult(null)
    try {
      const message = await fn()
      if (message) setResult(message)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {canPost && !composing && (
        <ComposerTrigger label="Post an update" icon={<SendIcon />} onClick={() => { setResult(null); setComposing(true) }} />
      )}

      {canPost && composing && (
        <Composer
          key={updates.length}
          instanceId={instanceId}
          busy={busy}
          notifyCounts={notifyCounts}
          submitLabel="Post and notify"
          onCancel={() => setComposing(false)}
          onSubmit={(draft) =>
            run(async () => {
              const n = notifyCounts[draft.audience]
              const who = n === 1 ? '1 person' : `${n} people`
              if (!confirm(`Post this and email ${who} a link to it?`)) return
              const r = await postCourseUpdate(instanceId, draft)
              setComposing(false)
              return r.emailProblem ?? `Posted. ${r.sent} ${r.sent === 1 ? 'person' : 'people'} emailed a link to it.`
            })
          }
        />
      )}

      {result && <p className="text-xs text-teal-300">{result}</p>}
      {error && <p className="text-xs text-pr-red">{error}</p>}

      {updates.length === 0
        ? canPost && <p className="text-xs text-zinc-600">No updates posted yet.</p>
        : (
          <div className="space-y-2">
            {updates.map((u) =>
              editing === u.id ? (
                <div key={u.id} className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                  <p className="text-[11px] text-zinc-500 mb-2">
                    Editing. Everyone sees the change straight away — the email that went out just points here.
                  </p>
                  <Composer
                    instanceId={instanceId}
                    busy={busy}
                    notifyCounts={notifyCounts}
                    submitLabel="Save changes"
                    initial={{ body: u.body, links: u.links, attachments: u.attachments, audience: u.audience, copyMe: false }}
                    onCancel={() => setEditing(null)}
                    onSubmit={(draft) =>
                      run(async () => {
                        await editCourseUpdate(instanceId, u.id, draft)
                        setEditing(null)
                        return 'Saved. Everyone on the course sees the new version.'
                      })
                    }
                  />
                </div>
              ) : (
                <div
                  key={u.id}
                  className={`px-3 py-2.5 bg-zinc-900 border rounded-lg ${
                    u.isNew ? 'border-pr-red/45' : 'border-zinc-800'
                  }`}
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs text-zinc-400">{u.authorName ?? 'Peak Rescue'}</span>
                    <span className="text-[11px] text-zinc-600">{when(u.created_at)}</span>
                    {u.isNew && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-pr-red/55 bg-pr-red/15 text-pr-red-light">
                        New
                      </span>
                    )}
                    {u.updated_at && (
                      <span className="text-[11px] text-zinc-600" title={`Edited ${when(u.updated_at)}`}>· edited</span>
                    )}
                    {canPost && (
                      <span className="text-[11px] text-zinc-600">
                        {u.emailed_at ? `notified ${u.sent_count}/${u.recipient_count}` : 'not emailed'}
                        {u.notify_count > 1 && ` ×${u.notify_count}`}
                      </span>
                    )}
                    {/* Only worth saying when it isn't the default. A
                        instructors-only note sitting in a list the students also read
                        needs to look different from the ones they can see. */}
                    {canPost && u.audience !== 'everyone' && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300">
                        {u.audience === 'instructors' ? 'Instructors only' : 'Students only'}
                      </span>
                    )}
                  </div>

                  {u.body && <p className="text-sm text-zinc-200 whitespace-pre-line mt-1">{u.body}</p>}

                  {(u.links.length > 0 || u.attachments.length > 0) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {u.links.map((l, i) => (
                        <a
                          key={`l${i}`}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          {linkLabel(l)}
                        </a>
                      ))}
                      {u.attachments.map((a, i) => (
                        <a
                          key={`a${i}`}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                          {a.filename}
                        </a>
                      ))}
                    </div>
                  )}

                  {canPost && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => { setEditing(u.id); setResult(null); setError(null) }}
                        disabled={busy}
                        className="text-[11px] text-zinc-500 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          run(async () => {
                            if (!confirm('Email everyone again to say this changed?')) return
                            const r = await renotifyCourseUpdate(instanceId, u.id)
                            return r.emailProblem ?? `${r.sent} ${r.sent === 1 ? 'person' : 'people'} emailed again.`
                          })
                        }
                        disabled={busy}
                        title="For a change big enough that people need telling twice"
                        className="text-[11px] text-zinc-500 hover:text-white transition-colors"
                      >
                        Notify again
                      </button>
                      <button
                        onClick={() =>
                          run(async () => {
                            if (!confirm('Remove this update? The email already sent stays sent.')) return
                            await deleteCourseUpdate(instanceId, u.id)
                          })
                        }
                        disabled={busy}
                        className="ml-auto text-[11px] text-zinc-600 hover:text-pr-red transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
    </div>
  )
}
