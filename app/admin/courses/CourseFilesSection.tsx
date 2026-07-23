'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  createCourseDocUploadTargets,
  finalizeCourseDocs,
  deleteCourseDoc,
} from './document-actions'

export type CourseFile = {
  id: string
  filename: string
  url: string
  // Where the file came from: general course upload, a task, an expense report.
  source: 'course' | 'task' | 'expense'
  label: string | null
}

// Every file attached anywhere in the course, in one place — general uploads
// (added here), task attachments, and expense receipts. Only general uploads
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
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
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
        uploads.push({ path: targets[i].path, filename: picked[i].name })
      }
      await finalizeCourseDocs(instanceId, uploads)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
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
    <div className="mt-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-zinc-400">
          Files — everything attached to this course, including task attachments and expense receipts.
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : '+ Upload files'}
        </button>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-zinc-500">No files yet.</p>
      ) : (
        <div className="divide-y divide-zinc-800">
          {files.map((f) => (
            <div key={`${f.source}-${f.id}`} className="flex items-center gap-3 py-2">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-200 hover:text-white truncate max-w-64"
              >
                {f.filename}
              </a>
              <span className="text-xs text-zinc-500 truncate flex-1">
                {f.source === 'course' ? 'Course file' : f.source === 'task' ? `Task: ${f.label ?? '—'}` : `Expense receipt${f.label ? ` · ${f.label}` : ''}`}
              </span>
              {f.source === 'course' && (
                <button
                  onClick={() => remove(f)}
                  disabled={busyId === f.id}
                  className="text-xs text-zinc-600 hover:text-pr-red-light transition-colors shrink-0"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
