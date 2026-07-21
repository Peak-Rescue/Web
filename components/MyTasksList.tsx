'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  setTaskStatus,
  updateTaskNotes,
  createTaskDocUploadTargets,
  finalizeTaskDocs,
  deleteTaskDoc,
} from '@/app/admin/courses/task-actions'
import { type MyOpenTask } from '@/lib/course-tasks'

// "Your open tasks" on the portal home — same task rows as the course pages,
// with the same notes and attachments (shared data, so edits show both places).
export default function MyTasksList({ tasks }: { tasks: MyOpenTask[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTaskRef = useRef<MyOpenTask | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const fmtDue = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  function run(fn: () => Promise<void>, id?: string) {
    setError(null)
    if (id) setBusyId(id)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setBusyId(null)
      }
    })
  }

  function toggle(t: MyOpenTask) {
    if (openId === t.id) {
      setOpenId(null)
    } else {
      setOpenId(t.id)
      setNotesDraft(t.notes ?? '')
    }
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const task = uploadTaskRef.current
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!task || files.length === 0) return
    setUploadingFor(task.id)
    setError(null)
    try {
      const targets = await createTaskDocUploadTargets(
        task.instance_id,
        task.id,
        files.map((f) => ({ name: f.name, size: f.size }))
      )
      const supabase = createClient()
      const uploads: { path: string; filename: string }[] = []
      for (let i = 0; i < files.length; i++) {
        const { error: upErr } = await supabase.storage
          .from('task-documents')
          .uploadToSignedUrl(targets[i].path, targets[i].token, files[i], { contentType: files[i].type })
        if (upErr) throw new Error(`Upload failed for "${files[i].name}": ${upErr.message}`)
        uploads.push({ path: targets[i].path, filename: files[i].name })
      }
      await finalizeTaskDocs(task.instance_id, task.id, uploads)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingFor(null)
    }
  }

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handleFiles} />
      {tasks.map((t) => (
        <div key={t.id} className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={false}
              disabled={busyId === t.id}
              onChange={() => run(() => setTaskStatus(t.instance_id, t.id, true), t.id)}
              className="accent-teal-600 size-4 shrink-0 disabled:opacity-40"
            />
            <button onClick={() => toggle(t)} className="min-w-0 flex-1 text-left group">
              <p className="text-sm group-hover:text-pr-red-light transition-colors truncate">
                {t.title}
                {t.notes && openId !== t.id && <span className="ml-1.5 text-zinc-500">📝</span>}
                {t.documents.length > 0 && openId !== t.id && (
                  <span className="ml-1.5 text-xs text-zinc-500">📎{t.documents.length}</span>
                )}
              </p>
              {t.courseName && <p className="text-xs text-zinc-500 truncate">{t.courseName}</p>}
            </button>
            {t.due_date && (
              <span className={`text-xs shrink-0 ${t.due_date < today ? 'text-red-400' : 'text-zinc-500'}`}>
                {t.due_date < today ? 'overdue · ' : ''}{fmtDue(t.due_date)}
              </span>
            )}
          </div>

          {openId === t.id && (
            <div className="mt-2 ml-7 mr-1">
              <div className="flex items-center flex-wrap gap-2 mb-2">
                {t.documents.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs">
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white max-w-44 truncate">
                      {d.filename}
                    </a>
                    <button
                      onClick={() => run(() => deleteTaskDoc(t.instance_id, t.id, d.id), t.id)}
                      className="text-zinc-500 hover:text-pr-red-light"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => {
                    uploadTaskRef.current = t
                    fileRef.current?.click()
                  }}
                  disabled={uploadingFor === t.id}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
                >
                  {uploadingFor === t.id ? 'Uploading…' : '+ Attach document'}
                </button>
                <Link href={`/portal/${t.instance_id}`} className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-300">
                  Open course →
                </Link>
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={2}
                placeholder="Notes — status, phone numbers, confirmation codes…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-y"
              />
              <div className="flex gap-3 mt-1.5">
                <button
                  onClick={() => run(() => updateTaskNotes(t.instance_id, t.id, notesDraft), t.id)}
                  disabled={busyId === t.id || notesDraft === (t.notes ?? '')}
                  className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  {busyId === t.id ? 'Saving…' : 'Save notes'}
                </button>
                <button onClick={() => setOpenId(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {error && <p className="px-4 py-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
