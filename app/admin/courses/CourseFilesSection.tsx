'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  createCourseDocUploadTargets,
  finalizeCourseDocs,
  addCourseDocLink,
  renameCourseDoc,
  deleteCourseDoc,
} from './document-actions'
import { LinkIcon, PencilIcon } from '@/components/TaskIcons'
import UploadNameDialog from '@/components/UploadNameDialog'
import AddLinkDialog from '@/components/AddLinkDialog'

export type CourseFile = {
  id: string
  filename: string
  url: string
  // Where the file came from: a general course upload or a task attachment.
  source: 'course' | 'task'
  label: string | null
  // External link (Google Drive, Dropbox…) rather than an uploaded file.
  isLink?: boolean
}

// Every file attached anywhere in the course, in one place — general uploads
// (added here) and task attachments. Expense receipts deliberately aren't
// gathered here — they're financial records about a named person, and the
// expenses console already lists them with a per-course rollup. Only general
// uploads
// can be deleted here; the others belong to their task/report.
export default function CourseFilesSection({
  instanceId,
  files,
}: {
  instanceId: string
  files: CourseFile[]
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const renameCancelled = useRef(false)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (picked.length === 0) return
    setError(null)
    setPending(picked)
  }

  async function uploadNamed(names: string[]) {
    const picked = pending
    if (picked.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const targets = await createCourseDocUploadTargets(
        instanceId,
        picked.map((f) => ({ name: f.name, size: f.size }))
      )
      const supabase = createClient()
      const uploads: { path: string; filename: string }[] = []
      for (let i = 0; i < picked.length; i++) {
        const { error: upErr } = await supabase.storage
          .from('task-documents')
          .uploadToSignedUrl(targets[i].path, targets[i].token, picked[i], { contentType: picked[i].type })
        if (upErr) throw new Error(`Upload failed for "${picked[i].name}": ${upErr.message}`)
        uploads.push({ path: targets[i].path, filename: names[i]?.trim() || picked[i].name })
      }
      await finalizeCourseDocs(instanceId, uploads)
      setPending([])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function addLink(name: string, url: string) {
    setLinkBusy(true)
    setError(null)
    try {
      await addCourseDocLink(instanceId, url, name)
      setLinkOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add link')
    } finally {
      setLinkBusy(false)
    }
  }

  async function rename(f: CourseFile) {
    const skip = renameCancelled.current
    renameCancelled.current = false
    setRenamingId(null)
    const name = renameDraft.trim()
    if (skip || !name || name === f.filename) return
    setBusyId(f.id)
    setError(null)
    try {
      await renameCourseDoc(instanceId, f.id, name)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(f: CourseFile) {
    if (!confirm(`Delete "${f.filename}"?`)) return
    setBusyId(f.id)
    setError(null)
    try {
      await deleteCourseDoc(instanceId, f.id)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 pt-5 border-t border-zinc-800">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-1">Files</h3>
          {/* Said out loud because the rest of this tab is audience-switched
              and these aren't: there's no Shared option here, and a file
              students need reaches them attached to a course update. */}
          <p className="text-xs text-zinc-500">
            Course documents and task attachments — the course team only, never students.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => setLinkOpen(true)}
            disabled={linkBusy}
            title="Add a link"
            aria-label="Add a link"
            className="inline-flex items-center justify-center w-8 h-8 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={uploading ? 'Uploading…' : 'Upload files'}
            aria-label="Upload files"
            className="inline-flex items-center justify-center w-8 h-8 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-[10px]">…</span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {files.length === 0 ? (
          <p className="text-xs text-zinc-600 px-4 py-4">No files on this course yet.</p>
        ) : (
          files.map((f) => (
            <div key={`${f.source}-${f.id}`} className="flex items-center gap-3 px-4 py-3">
              {renamingId === f.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') {
                      renameCancelled.current = true
                      e.currentTarget.blur()
                    }
                  }}
                  onBlur={() => rename(f)}
                  className="max-w-64 flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                />
              ) : f.isLink ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Opens external link"
                  className="inline-flex items-center gap-1.5 max-w-64 px-2.5 py-1 bg-teal-500/10 border border-teal-500/30 hover:border-teal-400 rounded-full text-sm text-teal-300 hover:text-teal-100 transition-colors"
                >
                  <LinkIcon />
                  <span className="truncate">{f.filename}</span>
                  <span className="text-teal-400/70 shrink-0">↗</span>
                </a>
              ) : (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-zinc-200 hover:text-white truncate max-w-64"
                >
                  {f.filename}
                </a>
              )}
              <span className="text-xs text-zinc-500 truncate flex-1">
                {f.source === 'course' ? (f.isLink ? 'Link' : 'Course file') : f.source === 'task' ? `Task: ${f.label ?? '—'}` : `Expense receipt${f.label ? ` · ${f.label}` : ''}`}
              </span>
              {f.source === 'course' && (
                <>
                  <button
                    onClick={() => {
                      setRenameDraft(f.filename)
                      setRenamingId(f.id)
                    }}
                    disabled={busyId === f.id}
                    title="Rename"
                    className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={() => remove(f)}
                    disabled={busyId === f.id}
                    className="text-xs text-zinc-600 hover:text-pr-red-light transition-colors shrink-0"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}

      <UploadNameDialog
        files={pending}
        uploading={uploading}
        onSubmit={uploadNamed}
        onCancel={() => !uploading && setPending([])}
      />
      <AddLinkDialog
        open={linkOpen}
        busy={linkBusy}
        onSubmit={addLink}
        onCancel={() => !linkBusy && setLinkOpen(false)}
      />
    </div>
  )
}
