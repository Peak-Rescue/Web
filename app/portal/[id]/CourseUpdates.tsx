'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { linkLabel } from '@/lib/course-links'
import {
  postCourseUpdate, editCourseUpdate, deleteCourseUpdate, renotifyCourseUpdate,
  createUpdateUploadTargets, type UpdateLink, type UpdateAttachment,
} from './update-actions'

export type CourseUpdate = {
  id: string
  body: string
  created_at: string
  updated_at: string | null
  authorName: string | null
  sent_count: number
  recipient_count: number
  notify_count: number
  emailed_at: string | null
  links: UpdateLink[]
  // Signed on the server — attachments live in a private bucket.
  attachments: (UpdateAttachment & { url: string })[]
}

// Updates for the people on the course. The email only points here, so this
// page is the one copy: editing an update corrects what everyone sees, and
// nothing needs unsending.
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

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
      {canPost && (
        <Composer
          key={updates.length}
          instanceId={instanceId}
          busy={busy}
          enrolledCount={enrolledCount}
          submitLabel="Post and notify"
          onSubmit={(draft) =>
            run(async () => {
              const who = enrolledCount === 1 ? '1 student' : `${enrolledCount} students`
              if (!confirm(`Post this and email ${who} a link to it?`)) return
              const r = await postCourseUpdate(instanceId, draft)
              return r.emailProblem ?? `Posted. ${r.sent} ${r.sent === 1 ? 'student' : 'students'} emailed a link to it.`
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
                    enrolledCount={enrolledCount}
                    submitLabel="Save changes"
                    initial={{ body: u.body, links: u.links, attachments: u.attachments }}
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
                <div key={u.id} className="px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs text-zinc-400">{u.authorName ?? 'Peak Rescue'}</span>
                    <span className="text-[11px] text-zinc-600">{when(u.created_at)}</span>
                    {u.updated_at && (
                      <span className="text-[11px] text-zinc-600" title={`Edited ${when(u.updated_at)}`}>· edited</span>
                    )}
                    {canPost && (
                      <span className="text-[11px] text-zinc-600">
                        {u.emailed_at ? `notified ${u.sent_count}/${u.recipient_count}` : 'not emailed'}
                        {u.notify_count > 1 && ` ×${u.notify_count}`}
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
                            return r.emailProblem ?? `${r.sent} ${r.sent === 1 ? 'student' : 'students'} emailed again.`
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

type Draft = { body: string; links: UpdateLink[]; attachments: UpdateAttachment[] }

// Writing an update: the message, plus links and files. Uploads go straight to
// the private bucket from the browser and only their paths reach the action.
function Composer({
  instanceId,
  busy,
  enrolledCount,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  instanceId: string
  busy: boolean
  enrolledCount: number
  submitLabel: string
  initial?: Draft
  onSubmit: (draft: Draft) => void
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial?.body ?? '')
  const [links, setLinks] = useState<UpdateLink[]>(initial?.links ?? [])
  const [attachments, setAttachments] = useState<UpdateAttachment[]>(initial?.attachments ?? [])
  const [addingLink, setAddingLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const empty = !body.trim() && links.length === 0 && attachments.length === 0
  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  // The label is left empty on purpose: the server derives it from the host,
  // so pasting a URL is the whole interaction.
  function addLink() {
    const url = linkUrl.trim()
    if (!url) return
    setLinks((p) => [...p, { url, label: '' }])
    setLinkUrl('')
    setAddingLink(false)
  }

  async function upload(files: FileList) {
    setUploading(true); setUploadError(null)
    try {
      const list = Array.from(files)
      const targets = await createUpdateUploadTargets(
        instanceId,
        list.map((f) => ({ name: f.name, size: f.size }))
      )
      const { createBrowserClient } = await import('@supabase/ssr')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const done: UpdateAttachment[] = []
      for (const [i, file] of list.entries()) {
        const t = targets[i]
        const { error } = await supabase.storage
          .from('task-documents')
          .uploadToSignedUrl(t.path, t.token, file)
        if (error) throw new Error(`"${file.name}" didn’t upload`)
        done.push({ path: t.path, filename: file.name })
      }
      setAttachments((prev) => [...prev, ...done])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="e.g. Rain forecast Thursday — bring the drysuit, not the wetsuit."
        className={`w-full resize-y ${input}`}
      />

      {(links.length > 0 || attachments.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l, i) => (
            <span key={`l${i}`} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">
              {/* Named after its host until someone says otherwise —
                  "docs.google.com" is a poor label, so clicking renames it. */}
              <button
                onClick={() => {
                  const next = prompt('Call this link:', linkLabel(l))
                  if (next !== null) {
                    setLinks((p) => p.map((x, j) => (j === i ? { ...x, label: next.trim() } : x)))
                  }
                }}
                title={`${l.url} — click to rename`}
                className="hover:text-white transition-colors"
              >
                {linkLabel(l)}
              </button>
              <button
                onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}
                className="text-zinc-600 hover:text-pr-red transition-colors"
              >
                ×
              </button>
            </span>
          ))}
          {attachments.map((a, i) => (
            <span key={`a${i}`} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">
              {a.filename}
              <button
                onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                className="text-zinc-600 hover:text-pr-red transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Two icons rather than three fields. A link needs a URL and nothing
          else — its name is taken from the address, and the pill can be
          renamed after the fact if the host makes a poor label. */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => setAddingLink((v) => !v)}
          title="Add a link"
          aria-label="Add a link"
          className={`p-1.5 rounded transition-colors ${
            addingLink ? 'text-white bg-zinc-800' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>

        <label
          title="Attach files"
          aria-label="Attach files"
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            uploading ? 'text-white bg-zinc-800' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <input
            type="file"
            multiple
            hidden
            disabled={uploading}
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }}
          />
        </label>

        {uploading && <span className="text-[11px] text-zinc-500 ml-1">Uploading…</span>}
      </div>

      {addingLink && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); if (e.key === 'Escape') setAddingLink(false) }}
            placeholder="Paste a link"
            className={`flex-1 min-w-40 text-xs ${input}`}
          />
          <button
            onClick={addLink}
            disabled={!linkUrl.trim()}
            className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {uploadError && <p className="text-xs text-pr-red">{uploadError}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onSubmit({ body, links, attachments })}
          disabled={busy || uploading || empty}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Working…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={busy} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        )}
        {!onCancel && (
          <span className="text-xs text-zinc-500">
            {enrolledCount === 0
              ? 'Nobody is enrolled yet — this will post to the course page only.'
              : `Emails ${enrolledCount === 1 ? 'the 1 student' : `all ${enrolledCount} students`} a link to this page. You can edit it afterwards.`}
          </span>
        )}
      </div>
    </div>
  )
}
