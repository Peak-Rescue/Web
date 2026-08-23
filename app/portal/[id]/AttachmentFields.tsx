'use client'

import { useState } from 'react'
import { linkLabel } from '@/lib/course-links'
import { createUpdateUploadTargets, type UpdateLink, type UpdateAttachment } from './update-actions'

// The links-and-files half of writing something onto a course: the chips, the
// two icons that add to them, and the upload itself.
//
// Shared because an update and a meeting point want exactly the same thing —
// a map pin, a photo of the trailhead — and a second copy of an uploader is a
// second place for the private-bucket handling to go quietly wrong.
export default function AttachmentFields({
  instanceId,
  links,
  setLinks,
  attachments,
  setAttachments,
  disabled,
  trailing,
}: {
  instanceId: string
  links: UpdateLink[]
  setLinks: (fn: (prev: UpdateLink[]) => UpdateLink[]) => void
  attachments: UpdateAttachment[]
  setAttachments: (fn: (prev: UpdateAttachment[]) => UpdateAttachment[]) => void
  disabled?: boolean
  /** Sits at the far end of the icon row — the audience ticks, where an update
      needs them. Addressing a note is part of the same row as attaching to it. */
  trailing?: React.ReactNode
}) {
  const [addingLink, setAddingLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <>
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
          disabled={disabled}
          className={`p-1.5 rounded transition-colors disabled:opacity-40 ${
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
            disabled={uploading || disabled}
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }}
          />
        </label>

        {uploading && <span className="text-[11px] text-zinc-500 ml-1">Uploading…</span>}
        {trailing}
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
    </>
  )
}
