'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  addTask,
  addTasks,
  setTaskAssignees,
  setTaskStatus,
  deleteTask,
  updateTaskNotes,
  createTaskDocUploadTargets,
  finalizeTaskDocs,
  addTaskDocLink,
  renameTaskDoc,
  deleteTaskDoc,
  fileTaskAsSuggestion,
} from '@/app/admin/courses/task-actions'

import { NotesIcon, PaperclipIcon, taskIconClass } from '@/components/TaskIcons'
import { TaskNotesField, TaskNotesView } from '@/components/TaskNotes'
import TaskDocChip from '@/components/TaskDocChip'
import UploadNameDialog from '@/components/UploadNameDialog'
import AddLinkDialog from '@/components/AddLinkDialog'
import { useUnsavedGuard, withSaveTimeout } from '@/components/useUnsavedGuard'
import TrashIcon from '@/components/TrashIcon'

export type CourseTask = {
  id: string
  title: string
  notes: string | null
  /** Everyone it is on, each with who put them there. Shared: any one of
   *  them ticking it closes it for all. */
  assignees: { id: string; by: string | null }[]
  status: 'open' | 'done'
  completed_by: string | null
  documents: { id: string; filename: string; url: string; external?: boolean }[]
}

// onCourse: admins and instructors staffed on this course — the default
// assignee list; everyone else appears only after "Show all instructors…".
export type TaskPerson = { id: string; name: string; onCourse: boolean }

export type TaskSuggestion = { id: string; title: string; default_line: boolean; sort_order: number }

// Checklist for one course instance. `canManage` (admin or lead instructor)
// unlocks assignment, add/delete, and the suggestions dropdown;
// everyone on the course can see it, and assignees can check off their own.
// With a null instanceId it is the general list — tasks on no course, which
// only admins manage (/admin/tasks).
// `canFileToLibrary` (real admins only) lets a task typed by hand be saved
// into the suggestions every course picks from — the library has no other
// way to grow from what courses actually needed.
export default function CourseTasksPanel({
  instanceId,
  tasks,
  people,
  canManage,
  currentUserId,
  suggestions = [],
  completedOpen = false,
  canFileToLibrary = false,
}: {
  instanceId: string | null
  tasks: CourseTask[]
  people: TaskPerson[]
  canManage: boolean
  currentUserId: string
  suggestions?: TaskSuggestion[]
  completedOpen?: boolean
  canFileToLibrary?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)
  // Suggestion id -> assignee profile id ('' = checked but nobody picked yet)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [newTitle, setNewTitle] = useState('')
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [newNotes, setNewNotes] = useState('')
  // Attachments chosen on the creation form, held until there is a task id.
  const [newDocs, setNewDocs] = useState<{ file: File; name: string }[]>([])
  const [newLinks, setNewLinks] = useState<{ url: string; name: string }[]>([])
  const [creatingTask, setCreatingTask] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesStatus, setNotesStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [notesHighlight, setNotesHighlight] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest unconfirmed edit; seq lets a slow save recognise it's been
  // superseded so it neither clears the dirty flag nor clobbers the status.
  const notesSeq = useRef(0)
  const dirtyNotes = useRef<{ taskId: string; value: string } | null>(null)

  function scheduleNotes(instId: string | null, taskId: string, value: string) {
    setNotesDraft(value)
    setNotesStatus('pending')
    notesSeq.current++
    dirtyNotes.current = { taskId, value }
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => void flushNotes(instId, taskId, value), 800)
  }

  async function flushNotes(instId: string | null, taskId: string, value: string) {
    const seq = notesSeq.current
    setNotesStatus('saving')
    try {
      await withSaveTimeout(updateTaskNotes(instId, taskId, value))
      if (seq === notesSeq.current) {
        dirtyNotes.current = null
        setNotesStatus('saved')
        router.refresh()
      }
    } catch {
      if (seq === notesSeq.current) setNotesStatus('error')
    }
  }

  function flushDirtyNotes() {
    const d = dirtyNotes.current
    if (!d) return
    if (notesTimer.current) {
      clearTimeout(notesTimer.current)
      notesTimer.current = null
    }
    void flushNotes(instanceId, d.taskId, d.value)
  }

  const notesDirty = notesStatus === 'pending' || notesStatus === 'saving' || notesStatus === 'error'
  useUnsavedGuard({
    dirty: notesDirty,
    message:
      notesStatus === 'error'
        ? 'Your task notes failed to save. Leave anyway and lose them?'
        : 'Your task notes are still saving. Leave anyway? They may be lost.',
    onLeaveAttempt: () => {
      if (notesStatus === 'pending' || notesStatus === 'error') flushDirtyNotes()
    },
    onBlocked: () => {
      const d = dirtyNotes.current
      if (d) {
        setOpenDetailsId(d.taskId)
        setNotesDraft(d.value)
      }
      setNotesHighlight(true)
      setTimeout(() => setNotesHighlight(false), 2500)
      requestAnimationFrame(() => {
        notesFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        notesFieldRef.current?.focus({ preventScroll: true })
      })
    },
  })
  const [uploadingDocsFor, setUploadingDocsFor] = useState<string | null>(null)
  const [pendingDocs, setPendingDocs] = useState<{ taskId: string; files: File[] } | null>(null)
  const [linkTaskId, setLinkTaskId] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)
  const docTaskRef = useRef<string | null>(null)
  const notesFieldRef = useRef<HTMLTextAreaElement>(null)

  const personName = (id: string | null) => people.find((p) => p.id === id)?.name ?? null

  // Assignee dropdowns default to the course team; picking the sentinel
  // expands every dropdown in the panel to the full instructor list.
  const SHOW_ALL = '__show_all__'
  // Stands in for the task id while the creation form is open.
  const NEW_TASK = '__new__'
  const [showAllPeople, setShowAllPeople] = useState(false)
  const hasMorePeople = people.some((p) => !p.onCourse)
  const assigneeOptions = (currentId?: string | null, exclude: string[] = []) => {
    const shown = (showAllPeople ? people : people.filter((p) => p.onCourse || p.id === currentId))
      .filter((p) => !exclude.includes(p.id))
    return (
      <>
        {shown.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        {!showAllPeople && hasMorePeople && <option value={SHOW_ALL}>Show all instructors…</option>}
      </>
    )
  }

  // Matched on title, loosely, because that is all a picked suggestion leaves
  // on the task — and a case-only difference is the same line to the picker.
  const libraryTitles = new Set(suggestions.map((s) => s.title.trim().toLowerCase()))
  const inLibrary = (t: CourseTask) => libraryTitles.has(t.title.trim().toLowerCase())

  const isOn = (t: CourseTask) => t.assignees.some((a) => a.id === currentUserId)
  const namesOf = (t: CourseTask) =>
    t.assignees.map((a) => personName(a.id)).filter(Boolean).join(', ') || 'unassigned'

  // Chips for the people a task is on, × to take one off, and a dropdown to
  // put another on. Used both on a saved task and on the creation form.
  const assigneeEditor = (ids: string[], onChange: (next: string[]) => void, disabled = false) => (
    <div className="flex items-center flex-wrap gap-1.5">
      {ids.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
          {personName(id) ?? 'Unknown'}
          <button
            onClick={() => onChange(ids.filter((x) => x !== id))}
            disabled={disabled}
            title="Take off this task"
            className="px-1 text-zinc-500 hover:text-pr-red-light disabled:opacity-40"
          >
            ×
          </button>
        </span>
      ))}
      <select
        value=""
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === SHOW_ALL) return setShowAllPeople(true)
          if (e.target.value) onChange([...ids, e.target.value])
        }}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 max-w-40"
      >
        <option value="">{ids.length === 0 ? 'Assign to…' : '+ Add person…'}</option>
        {assigneeOptions(null, ids)}
      </select>
    </div>
  )

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

  function handleDocFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const taskId = docTaskRef.current
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!taskId || files.length === 0) return
    setError(null)
    setPendingDocs({ taskId, files })
  }

  async function uploadDocs(taskId: string, items: { file: File; name: string }[]) {
    const targets = await createTaskDocUploadTargets(
      instanceId,
      taskId,
      items.map((i) => ({ name: i.file.name, size: i.file.size }))
    )
    const supabase = createClient()
    const uploads: { path: string; filename: string }[] = []
    for (let i = 0; i < items.length; i++) {
      const { error: upErr } = await supabase.storage
        .from('task-documents')
        .uploadToSignedUrl(targets[i].path, targets[i].token, items[i].file, { contentType: items[i].file.type })
      if (upErr) throw new Error(`Upload failed for "${items[i].file.name}": ${upErr.message}`)
      uploads.push({ path: targets[i].path, filename: items[i].name.trim() || items[i].file.name })
    }
    await finalizeTaskDocs(instanceId, taskId, uploads)
  }

  async function uploadNamedDocs(names: string[]) {
    if (!pendingDocs) return
    const { taskId, files } = pendingDocs
    const items = files.map((file, i) => ({ file, name: names[i] ?? file.name }))
    // Files picked while writing a new task have nowhere to go yet — they
    // wait on the form and upload the moment the task exists.
    if (taskId === NEW_TASK) {
      setNewDocs((prev) => [...prev, ...items])
      setPendingDocs(null)
      return
    }
    setUploadingDocsFor(taskId)
    setError(null)
    try {
      await uploadDocs(taskId, items)
      setPendingDocs(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed')
    } finally {
      setUploadingDocsFor(null)
    }
  }

  async function addLink(name: string, url: string) {
    const taskId = linkTaskId
    if (!taskId) return
    if (taskId === NEW_TASK) {
      setNewLinks((prev) => [...prev, { url, name }])
      setLinkTaskId(null)
      return
    }
    setLinkBusy(true)
    setError(null)
    try {
      await addTaskDocLink(instanceId, taskId, url, name)
      setLinkTaskId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add link')
    } finally {
      setLinkBusy(false)
    }
  }

  // Create, then file what was chosen alongside it. The task is saved before
  // the attachments, so a failed upload leaves the task rather than losing it.
  async function createTask() {
    const title = newTitle.trim()
    if (!title) return
    setCreatingTask(true)
    setError(null)
    try {
      const taskId = await addTask(instanceId, {
        title,
        assignees: newAssignees,
        notes: newNotes || null,
      })
      if (newDocs.length > 0) await uploadDocs(taskId, newDocs)
      for (const l of newLinks) await addTaskDocLink(instanceId, taskId, l.url, l.name)
      setNewTitle('')
      setNewAssignees([])
      setNewNotes('')
      setNewDocs([])
      setNewLinks([])
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the task')
    } finally {
      setCreatingTask(false)
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

  function openDetails(t: CourseTask) {
    if (openDetailsId !== t.id) {
      setOpenDetailsId(t.id)
      setNotesDraft(t.notes ?? '')
    }
  }

  function openNotes(t: CourseTask) {
    openDetails(t)
    requestAnimationFrame(() => notesFieldRef.current?.focus())
  }

  function openAttachments(t: CourseTask) {
    openDetails(t)
    const canEdit = canManage || isOn(t)
    if (t.documents.length === 0 && canEdit) {
      docTaskRef.current = t.id
      docInputRef.current?.click()
    }
  }

  function renderTaskRow(t: CourseTask) {
    const isDone = t.status === 'done'
    const canToggle = canManage || isOn(t)
    const canEditNotes = canManage || isOn(t)
    const detailsOpen = openDetailsId === t.id
    return (
      <div key={t.id} className="px-4 py-2.5">
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
          </p>
        </button>
        {/* Always-visible affordances: dimmed when empty, lit when the task
            has notes/attachments. Notes jumps to the notes box; the paperclip
            opens the file picker when nothing is attached yet. */}
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
        {/* Names on the row; who is on it is changed inside, where there is
            room for more than one. */}
        <button
          onClick={() => toggleDetails(t)}
          title={namesOf(t)}
          className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0 max-w-40 truncate"
        >
          {namesOf(t)}
        </button>
        {canManage && (
          <button
            onClick={() => {
              if (confirm(`Delete task "${t.title}"?`)) run(() => deleteTask(instanceId, t.id), t.id)
            }}
            disabled={busyId === t.id}
            className="text-xs text-zinc-600 hover:text-pr-red-light transition-colors shrink-0"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {detailsOpen && (
        <div className="mt-2 ml-7 mr-1">
          {canManage ? (
            <div className="mb-2">
              {assigneeEditor(
                t.assignees.map((a) => a.id),
                (next) => run(() => setTaskAssignees(instanceId, t.id, next), t.id),
                busyId === t.id
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 mb-2">
              {t.assignees.length > 0 ? `Assigned to ${namesOf(t)}` : 'Unassigned'}
              {(() => {
                // Who handed it out, when it was one person for everybody.
                const by = [...new Set(t.assignees.map((a) => a.by))]
                return by.length === 1 && by[0] ? ` by ${personName(by[0])}` : ''
              })()}
            </p>
          )}
          {isDone && t.completed_by && (
            <p className="text-xs text-zinc-500 mb-2">Ticked by {personName(t.completed_by) ?? 'someone'}</p>
          )}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            {t.documents.map((d) => (
              <TaskDocChip
                key={d.id}
                doc={d}
                canEdit={canEditNotes}
                onRename={(name) => run(() => renameTaskDoc(instanceId, t.id, d.id, name), t.id)}
                onDelete={() => run(() => deleteTaskDoc(instanceId, t.id, d.id), t.id)}
              />
            ))}
            {canEditNotes && (
              <>
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
                <button
                  onClick={() => setLinkTaskId(t.id)}
                  disabled={linkBusy}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
                >
                  + Add link
                </button>
              </>
            )}
          </div>
          {canEditNotes ? (
            <div>
              <TaskNotesField
                ref={notesFieldRef}
                value={notesDraft}
                onChange={(next) => scheduleNotes(instanceId, t.id, next)}
                rows={3}
                highlight={notesHighlight}
                placeholder="Notes — status, phone numbers, confirmation codes…"
              />
              <div className="flex items-center gap-3 mt-1.5">
                <span className={`text-xs ${notesStatus === 'error' ? 'text-pr-red-light' : notesStatus === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
                  {notesStatus === 'saving' ? 'Saving…' : notesStatus === 'saved' ? 'Saved ✓' : notesStatus === 'error' ? 'Save failed — notes not saved' : notesStatus === 'pending' ? '…' : ''}
                </span>
                {notesStatus === 'error' && (
                  <button onClick={flushDirtyNotes} className="text-xs text-zinc-300 underline hover:text-white">
                    Retry
                  </button>
                )}
                {canFileToLibrary && !inLibrary(t) && (
                  <button
                    onClick={() => run(() => fileTaskAsSuggestion(t.id), t.id)}
                    disabled={busyId === t.id}
                    className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    Save as suggestion
                  </button>
                )}
                <button onClick={() => setOpenDetailsId(null)} className={`${canFileToLibrary && !inLibrary(t) ? '' : 'ml-auto '}text-xs text-zinc-600 hover:text-zinc-400 transition-colors`}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            t.notes ? <TaskNotesView text={t.notes} /> : <p className="text-sm text-zinc-500">No notes.</p>
          )}
        </div>
      )}
      </div>
    )
  }

  return (
    <div>
      <input ref={docInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={handleDocFiles} />
      <UploadNameDialog
        files={pendingDocs?.files ?? []}
        uploading={uploadingDocsFor !== null}
        onSubmit={uploadNamedDocs}
        onCancel={() => uploadingDocsFor === null && setPendingDocs(null)}
      />
      <AddLinkDialog
        open={linkTaskId !== null}
        busy={linkBusy}
        onSubmit={addLink}
        onCancel={() => !linkBusy && setLinkTaskId(null)}
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
        {open.map((t) => renderTaskRow(t))}
        {open.length === 0 && (
          <p className="px-4 py-3 text-sm text-zinc-500">
            {tasks.length === 0 ? 'No tasks yet.' : 'All tasks done ✓'}
          </p>
        )}
        {done.length > 0 && (
          <details open={completedOpen}>
            <summary className="px-4 py-2 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
              {done.length} completed
            </summary>
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {done.map((t) => renderTaskRow(t))}
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
                  placeholder={instanceId ? 'e.g. Confirm range access with client' : 'e.g. Renew the liability policy'}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="w-full">
                <label className="block text-xs text-zinc-500 mb-1">Assign to</label>
                {assigneeEditor(newAssignees, setNewAssignees, creatingTask)}
              </div>
              <div className="w-full">
                <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
                <TaskNotesField
                  value={newNotes}
                  onChange={setNewNotes}
                  rows={3}
                  placeholder="Any context the assignee needs"
                />
              </div>
              {/* Attachments belong to the moment you are writing the task —
                  the contract you are looking at right now is the reason the
                  task exists. They upload as soon as the task is saved. */}
              <div className="w-full flex items-center flex-wrap gap-2">
                {newDocs.map((d, i) => (
                  <span key={`f${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                    {d.name}
                    <button
                      onClick={() => setNewDocs((prev) => prev.filter((_, j) => j !== i))}
                      className="text-zinc-500 hover:text-pr-red-light"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {newLinks.map((l, i) => (
                  <span key={`l${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-teal-300">
                    {l.name || l.url}
                    <button
                      onClick={() => setNewLinks((prev) => prev.filter((_, j) => j !== i))}
                      className="text-zinc-500 hover:text-pr-red-light"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => {
                    docTaskRef.current = NEW_TASK
                    docInputRef.current?.click()
                  }}
                  disabled={creatingTask}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
                >
                  + Attach document
                </button>
                <button
                  onClick={() => setLinkTaskId(NEW_TASK)}
                  disabled={creatingTask}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
                >
                  + Add link
                </button>
              </div>
              <button
                onClick={() => void createTask()}
                disabled={creatingTask || isPending || !newTitle.trim()}
                className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creatingTask ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  setNewDocs([])
                  setNewLinks([])
                }}
                disabled={creatingTask}
                className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : picking ? (
            (() => {
              const have = new Set(tasks.map((t) => t.title))
              const available = suggestions.filter((s) => !have.has(s.title))
              const standard = available.filter((s) => s.default_line)
              const other = available.filter((s) => !s.default_line)
              const checked = available.filter((s) => s.id in picks)
              const unassignedPicks = checked.filter((s) => !picks[s.id]).length
              const close = () => {
                setPicking(false)
                setPicks({})
              }
              const renderPickRow = (s: TaskSuggestion) => (
                <div key={s.id} className="flex items-center gap-3 py-1">
                  <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.id in picks}
                      onChange={(e) =>
                        setPicks((p) => {
                          const next = { ...p }
                          if (e.target.checked) next[s.id] = ''
                          else delete next[s.id]
                          return next
                        })
                      }
                      className="accent-teal-600 size-4 shrink-0"
                    />
                    <span className="text-sm truncate">{s.title}</span>
                  </label>
                  {s.id in picks && (
                    <select
                      value={picks[s.id]}
                      onChange={(e) => {
                        if (e.target.value === SHOW_ALL) return setShowAllPeople(true)
                        setPicks((p) => ({ ...p, [s.id]: e.target.value }))
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 shrink-0 max-w-36"
                    >
                      <option value="">assign to…</option>
                      {assigneeOptions(picks[s.id])}
                    </select>
                  )}
                </div>
              )
              return (
                <div className="p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-2">
                    Only assigned tasks show on the course.
                  </p>
                  {standard.length > 0 && (
                    <>
                      <p className="text-[11px] uppercase tracking-wide text-zinc-600">Common</p>
                      {standard.map(renderPickRow)}
                    </>
                  )}
                  {other.length > 0 && (
                    <>
                      <p className={`text-[11px] uppercase tracking-wide text-zinc-600 ${standard.length > 0 ? 'mt-2 pt-2 border-t border-zinc-800' : ''}`}>
                        Additional
                      </p>
                      {other.map(renderPickRow)}
                    </>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => {
                        run(() =>
                          addTasks(
                            instanceId,
                            checked.map((s) => ({
                              title: s.title,
                              assignees: picks[s.id] ? [picks[s.id]] : [],
                              sort_order: s.sort_order,
                            }))
                          )
                        )
                        close()
                      }}
                      disabled={isPending || checked.length === 0 || unassignedPicks > 0}
                      className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {checked.length === 0
                        ? 'Add tasks'
                        : `Add ${checked.length} task${checked.length === 1 ? '' : 's'}`}
                    </button>
                    {unassignedPicks > 0 && (
                      <span className="text-xs text-zinc-500">
                        {unassignedPicks === 1 ? '1 task still needs' : `${unassignedPicks} tasks still need`} an assignee
                      </span>
                    )}
                    <button onClick={close} className="ml-auto px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="flex gap-4 items-center flex-wrap">
              {suggestions.some((s) => !tasks.some((t) => t.title === s.title)) && (
                <button onClick={() => setPicking(true)} className="text-sm text-zinc-400 hover:text-white transition-colors">
                  + Add from checklist
                </button>
              )}
              <button onClick={() => setAdding(true)} className="text-sm text-zinc-400 hover:text-white transition-colors">
                {instanceId ? '+ Add custom task' : '+ Add task'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
