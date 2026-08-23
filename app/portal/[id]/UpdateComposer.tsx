'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import { linkLabel } from '@/lib/course-links'
import { createUpdateUploadTargets, type UpdateLink, type UpdateAttachment, type UpdateAudience } from './update-actions'
import type { NotifyCounts } from './CourseUpdates'

const AUDIENCE_LABEL: Record<UpdateAudience, string> = {
  students: 'the students',
  instructors: 'the instructors',
  everyone: 'the course',
}

export type Draft = { body: string; links: UpdateLink[]; attachments: UpdateAttachment[]; audience: UpdateAudience }

// Writing an update: the message, plus links and files. Uploads go straight to
// the private bucket from the browser and only their paths reach the action.
export default function Composer({
  instanceId,
  busy,
  notifyCounts,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  instanceId: string
  busy: boolean
  notifyCounts: NotifyCounts
  submitLabel: string
  initial?: Draft
  onSubmit: (draft: Draft) => void
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial?.body ?? '')
  const [links, setLinks] = useState<UpdateLink[]>(initial?.links ?? [])
  const [attachments, setAttachments] = useState<UpdateAttachment[]>(initial?.attachments ?? [])
  // Held as two ticks rather than one three-way choice: "who is this for" is
  // two independent yes/nos in the writer's head, and both unticked is simply
  // not offered — the Post button goes dead instead.
  const [toStudents, setToStudents] = useState(initial ? initial.audience !== 'instructors' : true)
  const [toInstructors, setToInstructors] = useState(initial ? initial.audience !== 'students' : true)
  const audience: UpdateAudience =
    toStudents && toInstructors ? 'everyone' : toInstructors ? 'instructors' : 'students'
  const reach = toStudents || toInstructors ? notifyCounts[audience] : 0
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

        {/* Who it's for, beside the link and file icons rather than above the
            box — it's part of addressing the note, not a setting you go
            looking for. An instructors-only update is hidden from the students as well
            as unsent to them, which is why it says "sees" and not "gets". */}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="text-zinc-600">Who sees it</span>
          <Tick label="Students" on={toStudents} set={setToStudents} />
          <Tick label="Instructors" on={toInstructors} set={setToInstructors} />
        </span>
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
          onClick={() => onSubmit({ body, links, attachments, audience })}
          disabled={busy || uploading || empty || (!toStudents && !toInstructors)}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Working…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={busy} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        )}
        {/* The line says what happens; the icon holds why you'd want it. The
            count is live state, not explanation, so it stays on screen. */}
        {!onCancel && (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            {!toStudents && !toInstructors
              ? 'Tick who this is for.'
              : reach === 0
                ? `Nobody in ${AUDIENCE_LABEL[audience]} to email yet — posts to this page only.`
                : `Emails ${reach === 1 ? '1 person' : `${reach} people`} a link to this page.`}
            <InfoHint text="The email only points here, so editing this later corrects what everyone sees. If it has to reach them tonight even without logging in, send an email instead." />
          </span>
        )}
      </div>
    </div>
  )
}

// One audience checkbox. No number beside it: the only count worth showing is
// how many inboxes the post reaches, and that already sits under the button as
// a sentence. A number here read as "how many people see it", which it wasn't —
// your own address is excluded, so it never matched the list of instructors
// further up the page.
function Tick({
  label, on, set,
}: {
  label: string
  on: boolean
  set: (v: boolean) => void
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${on ? 'text-zinc-300' : 'hover:text-zinc-300'}`}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="accent-pr-red w-3 h-3"
      />
      {label}
    </label>
  )
}
