'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  addTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  applyTaskTemplate,
  updateTaskNotes,
  createTaskDocUploadTargets,
  finalizeTaskDocs,
  deleteTaskDoc,
} from '@/app/admin/courses/task-actions'

export type CourseTask = {
  id: string
  title: string
  notes: string | null
  assigned_to: string | null
  assigned_by: string | null
  status: 'open' | 'done'
  documents: { id: string; filename: string; url: string }[]
}

export type TaskPerson = { id: string; name: string }

export type TaskSuggestion = { id: string; title: string }

// Checklist for one course instance. `canManage` (admin or lead instructor)
// unlocks assignment, add/delete, and the template button;
// everyone on the course can see it, and assignees can check off their own.
export default function CourseTasksPanel({
  instanceId,
  tasks,
  people,
  canManage,
  currentUserId,
  suggestions = [],
}: {
  instanceId: string
  tasks: CourseTask[]
  people: TaskPerson[]
  canManage: boolean
  currentUserId: string
  suggestions?: TaskSuggestion[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null)
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
  const [uploadingDocsFor, setUploadingDocsFor] = useState<string | null>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const docTaskRef = useRef<string | null>(null)

  const personName = (id: string | null) => people.find((p) => p.id === id)?.name ?? null

  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')

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

  async function handleDocFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const taskId = docTaskRef.current
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!taskId || files.length === 0) return
    setUploadingDocsFor(taskId)
    setError(null)
    try {
      const targets = await createTaskDocUploadTargets(
        instanceId,
        taskId,
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
      await finalizeTaskDocs(instanceId, taskId, uploads)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed')
    } finally {
      setUploadingDocsFor(null)
    }
  }

  function toggleDetails(t: CourseTask) {
    if (openDetailsId === t.id) {
      setOpenDetailsId(null)
    } else {
      setOpenDetailsId(t.id)
      setNotesDraft(t.notes ?? '')
    }
  }

  function TaskRow({ t }: { t: CourseTask }) {
    const isDone = t.status === 'done'
    const canToggle = canManage || t.assigned_to === currentUserId
    const canEditNotes = canManage || t.assigned_to === currentUserId
    const detailsOpen = openDetailsId === t.id
    return (
      <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isDone}
          disabled={!canToggle || busyId === t.id}
          onChange={(e) => run(() => setTaskStatus(instanceId, t.id, e.target.checked), t.id)}
          className="accent-teal-600 size-4 shrink-0 disabled:opacity-40"
        />
        <button onClick={() => toggleDetails(t)} className="min-w-0 flex-1 text-left group">
          <p className={`text-sm group-hover:text-pr-red-light transition-colors ${isDone ? 'text-zinc-500 line-through' : ''}`}>
            {t.title}
            {t.notes && !detailsOpen && <span className="ml-1.5 text-zinc-500">📝</span>}
            {t.documents.length > 0 && !detailsOpen && (
              <span className="ml-1.5 text-xs text-zinc-500">📎{t.documents.length}</span>
            )}
          </p>
        </button>
        {canManage ? (
          <>
            <select
              value={t.assigned_to ?? ''}
              disabled={busyId === t.id}
              onChange={(e) =>
                run(() => updateTask(instanceId, t.id, { assigned_to: e.target.value || null }), t.id)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 shrink-0 max-w-32"
            >
              <option value="">unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (confirm(`Delete task "${t.title}"?`)) run(() => deleteTask(instanceId, t.id), t.id)
              }}
              disabled={busyId === t.id}
              className="text-xs text-zinc-600 hover:text-pr-red-light transition-colors shrink-0"
            >
              ×
            </button>
          </>
        ) : (
          <span className="text-xs text-zinc-500 shrink-0">
            {personName(t.assigned_to) ?? 'unassigned'}
          </span>
        )}
      </div>

      {detailsOpen && (
        <div className="mt-2 ml-7 mr-1">
          <p className="text-xs text-zinc-500 mb-2">
            {t.assigned_to
              ? `Assigned to ${personName(t.assigned_to) ?? 'someone'}${t.assigned_by ? ` by ${personName(t.assigned_by)}` : ''}`
              : 'Unassigned'}
          </p>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            {t.documents.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white max-w-44 truncate">
                  {d.filename}
                </a>
                {canEditNotes && (
                  <button
                    onClick={() => run(() => deleteTaskDoc(instanceId, t.id, d.id), t.id)}
                    className="text-zinc-500 hover:text-pr-red-light"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {canEditNotes && (
              <button
                onClick={() => {
                  docTaskRef.current = t.id
                  docInputRef.current?.click()
                }}
                disabled={uploadingDocsFor === t.id}
                className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
              >
                {uploadingDocsFor === t.id ? 'Uploading…' : '+ Attach document'}
              </button>
            )}
          </div>
          {canEditNotes ? (
            <div>
              <textarea
                value={notesDraft}
                onChange={(e) => scheduleNotes(instanceId, t.id, e.target.value)}
                rows={2}
                placeholder="Notes — status, phone numbers, confirmation codes…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-y"
              />
              <div className="flex items-center gap-3 mt-1.5">
                <span className={`text-xs ${notesStatus === 'error' ? 'text-pr-red-light' : notesStatus === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
                  {notesStatus === 'saving' ? 'Saving…' : notesStatus === 'saved' ? 'Saved ✓' : notesStatus === 'error' ? 'Save failed' : notesStatus === 'pending' ? '…' : ''}
                </span>
                <button onClick={() => setOpenDetailsId(null)} className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400 whitespace-pre-wrap">{t.notes || 'No notes.'}</p>
          )}
        </div>
      )}
      </div>
    )
  }

  return (
    <div>
      <input ref={docInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handleDocFiles} />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
        {open.map((t) => <TaskRow key={t.id} t={t} />)}
        {open.length === 0 && (
          <p className="px-4 py-3 text-sm text-zinc-500">
            {tasks.length === 0 ? 'No tasks yet.' : 'All tasks done ✓'}
          </p>
        )}
        {done.length > 0 && (
          <details>
            <summary className="px-4 py-2 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
              {done.length} completed
            </summary>
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {done.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          </details>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}

      {canManage && (
        <div className="mt-3">
          {adding ? (
            <div className="flex items-end gap-2 flex-wrap p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-zinc-500 mb-1">Task</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Confirm range access with client"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Assign to</label>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
                >
                  <option value="">unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-full">
                <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
                <input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any context the assignee needs"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              <button
                onClick={() => {
                  if (!newTitle.trim()) return
                  run(() => addTask(instanceId, { title: newTitle, assigned_to: newAssignee || null, notes: newNotes || null }))
                  setNewTitle('')
                  setNewAssignee('')
                  setNewNotes('')
                  setAdding(false)
                }}
                disabled={isPending || !newTitle.trim()}
                className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                Add
              </button>
              <button onClick={() => setAdding(false)} className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-4 items-center flex-wrap">
              <button onClick={() => setAdding(true)} className="text-sm text-zinc-400 hover:text-white transition-colors">
                + Add task
              </button>
              {(() => {
                const have = new Set(tasks.map((t) => t.title))
                const available = suggestions.filter((s) => !have.has(s.title))
                if (available.length === 0) return null
                return (
                  <select
                    value=""
                    disabled={isPending}
                    onChange={(e) => {
                      const pick = available.find((s) => s.id === e.target.value)
                      if (pick) run(() => addTask(instanceId, { title: pick.title, assigned_to: null, notes: null }))
                    }}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-400"
                  >
                    <option value="">+ Add from suggestions…</option>
                    {available.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                )
              })()}
              {tasks.length === 0 && (
                <button
                  onClick={() => run(() => applyTaskTemplate(instanceId))}
                  disabled={isPending}
                  className="text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  Add standard checklist
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
