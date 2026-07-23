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
  renameTaskDoc,
  deleteTaskDoc,
} from '@/app/admin/courses/task-actions'
import { type MyOpenTask } from '@/lib/course-tasks'
import { NotesIcon, PaperclipIcon, taskIconClass } from '@/components/TaskIcons'
import TaskDocChip from '@/components/TaskDocChip'
import UploadNameDialog from '@/components/UploadNameDialog'

// "Your open tasks" on the portal home — same task rows as the course pages,
// with the same notes and attachments (shared data, so edits show both places).
export default function MyTasksList({ tasks }: { tasks: MyOpenTask[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesStatus, setNotesStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleNotes(instId: string, taskId: string, value: string) {
    setNotesDraft(value)
    setNotesStatus('pending')
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => void flushNotes(instId, taskId, value), 800)
  }

  async function flushNotes(instId: string, taskId: string, value: string) {
    setNotesStatus('saving')
    try {
      await updateTaskNotes(instId, taskId, value)
      setNotesStatus('saved')
      router.refresh()
    } catch {
      setNotesStatus('error')
    }
  }
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [pending, setPending] = useState<{ task: MyOpenTask; files: File[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTaskRef = useRef<MyOpenTask | null>(null)
  const notesFieldRef = useRef<HTMLTextAreaElement>(null)

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

  function openDetails(t: MyOpenTask) {
    if (openId !== t.id) {
      setOpenId(t.id)
      setNotesDraft(t.notes ?? '')
    }
  }

  function openNotes(t: MyOpenTask) {
    openDetails(t)
    requestAnimationFrame(() => notesFieldRef.current?.focus())
  }

  function openAttachments(t: MyOpenTask) {
    openDetails(t)
    if (t.documents.length === 0) {
      uploadTaskRef.current = t
      fileRef.current?.click()
    }
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const task = uploadTaskRef.current
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!task || files.length === 0) return
    setError(null)
    setPending({ task, files })
  }

  async function uploadNamed(names: string[]) {
    if (!pending) return
    const { task, files } = pending
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
        uploads.push({ path: targets[i].path, filename: names[i]?.trim() || files[i].name })
      }
      await finalizeTaskDocs(task.instance_id, task.id, uploads)
      setPending(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingFor(null)
    }
  }

  // Tasks arrive sorted by course start date, so consecutive rows for the
  // same course collapse into one header group.
  const groups: { instanceId: string; first: MyOpenTask; items: MyOpenTask[] }[] = []
  for (const t of tasks) {
    const last = groups[groups.length - 1]
    if (last && last.instanceId === t.instance_id) last.items.push(t)
    else groups.push({ instanceId: t.instance_id, first: t, items: [t] })
  }

  const fmtRange = (t: MyOpenTask) => {
    const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!t.startsAt) return 'dates TBD'
    return t.endsAt && t.endsAt !== t.startsAt ? `${f(t.startsAt)} – ${f(t.endsAt)}` : f(t.startsAt)
  }

  const renderTask = (t: MyOpenTask) => (
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
              </p>
            </button>
            <button
              onClick={() => openNotes(t)}
              title={t.notes ? 'View notes' : 'Add notes'}
              className={taskIconClass(!!t.notes)}
            >
              <NotesIcon />
            </button>
            <button
              onClick={() => openAttachments(t)}
              title={t.documents.length > 0 ? `${t.documents.length} attached` : 'Attach documents'}
              className={`inline-flex items-center gap-0.5 ${taskIconClass(t.documents.length > 0)}`}
            >
              <PaperclipIcon />
              {t.documents.length > 0 && <span className="text-[10px]">{t.documents.length}</span>}
            </button>
          </div>

          {openId === t.id && (
            <div className="mt-2 ml-7 mr-1">
              <div className="flex items-center flex-wrap gap-2 mb-2">
                {t.documents.map((d) => (
                  <TaskDocChip
                    key={d.id}
                    doc={d}
                    canEdit
                    onRename={(name) => run(() => renameTaskDoc(t.instance_id, t.id, d.id, name), t.id)}
                    onDelete={() => run(() => deleteTaskDoc(t.instance_id, t.id, d.id), t.id)}
                  />
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
                ref={notesFieldRef}
                value={notesDraft}
                onChange={(e) => scheduleNotes(t.instance_id, t.id, e.target.value)}
                rows={2}
                placeholder="Notes — status, phone numbers, confirmation codes…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-y"
              />
              <div className="flex items-center gap-3 mt-1.5">
                <span className={`text-xs ${notesStatus === 'error' ? 'text-pr-red-light' : notesStatus === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
                  {notesStatus === 'saving' ? 'Saving…' : notesStatus === 'saved' ? 'Saved ✓' : notesStatus === 'error' ? 'Save failed' : notesStatus === 'pending' ? '…' : ''}
                </span>
                <button onClick={() => setOpenId(null)} className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
  )

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handleFiles} />
      <UploadNameDialog
        files={pending?.files ?? []}
        uploading={uploadingFor !== null}
        onSubmit={uploadNamed}
        onCancel={() => uploadingFor === null && setPending(null)}
      />
      {groups.map((g) => (
        <div key={g.instanceId} className="divide-y divide-zinc-800">
          <div className="px-4 py-2 bg-zinc-950/50 flex items-baseline gap-x-2 flex-wrap">
            <Link
              href={`/portal/${g.instanceId}`}
              className="text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white transition-colors"
            >
              {g.first.courseName ?? 'Course'}
            </Link>
            <span className="text-xs text-zinc-500 truncate">
              {[g.first.clientName, g.first.location, fmtRange(g.first)].filter(Boolean).join(' · ')}
            </span>
          </div>
          {g.items.map(renderTask)}
        </div>
      ))}
      {error && <p className="px-4 py-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
