'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTask, updateTask, setTaskStatus, deleteTask, applyTaskTemplate, updateTaskNotes } from '@/app/admin/courses/task-actions'

export type CourseTask = {
  id: string
  title: string
  notes: string | null
  assigned_to: string | null
  assigned_by: string | null
  due_date: string | null
  status: 'open' | 'done'
}

export type TaskPerson = { id: string; name: string }

function fmtDue(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Checklist for one course instance. `canManage` (admin or lead instructor)
// unlocks assignment, due dates, add/delete, and the template button;
// everyone on the course can see it, and assignees can check off their own.
export default function CourseTasksPanel({
  instanceId,
  tasks,
  people,
  canManage,
  currentUserId,
}: {
  instanceId: string
  tasks: CourseTask[]
  people: TaskPerson[]
  canManage: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  const personName = (id: string | null) => people.find((p) => p.id === id)?.name ?? null
  const today = new Date().toISOString().slice(0, 10)

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
    const overdue = !isDone && t.due_date && t.due_date < today
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
          </p>
        </button>
        {overdue && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-900/60 text-red-300 shrink-0">
            overdue
          </span>
        )}
        {canManage ? (
          <>
            <select
              value={t.assigned_to ?? ''}
              disabled={busyId === t.id}
              onChange={(e) =>
                run(() => updateTask(instanceId, t.id, { assigned_to: e.target.value || null, due_date: t.due_date }), t.id)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 shrink-0 max-w-32"
            >
              <option value="">unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={t.due_date ?? ''}
              disabled={busyId === t.id}
              onChange={(e) =>
                run(() => updateTask(instanceId, t.id, { assigned_to: t.assigned_to, due_date: e.target.value || null }), t.id)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 shrink-0 w-32"
            />
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
            {t.due_date ? ` · ${fmtDue(t.due_date)}` : ''}
          </span>
        )}
      </div>

      {detailsOpen && (
        <div className="mt-2 ml-7 mr-1">
          <p className="text-xs text-zinc-500 mb-2">
            {t.assigned_to
              ? `Assigned to ${personName(t.assigned_to) ?? 'someone'}${t.assigned_by ? ` by ${personName(t.assigned_by)}` : ''}`
              : 'Unassigned'}
            {t.due_date ? ` · due ${fmtDue(t.due_date)}` : ''}
          </p>
          {canEditNotes ? (
            <div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={2}
                placeholder="Notes — status, phone numbers, confirmation codes…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-y"
              />
              <div className="flex gap-3 mt-1.5">
                <button
                  onClick={() => run(() => updateTaskNotes(instanceId, t.id, notesDraft), t.id)}
                  disabled={busyId === t.id || notesDraft === (t.notes ?? '')}
                  className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  {busyId === t.id ? 'Saving…' : 'Save notes'}
                </button>
                <button onClick={() => setOpenDetailsId(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
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
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Due</label>
                <input
                  type="date"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
                />
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
                  run(() => addTask(instanceId, { title: newTitle, assigned_to: newAssignee || null, due_date: newDue || null, notes: newNotes || null }))
                  setNewTitle('')
                  setNewAssignee('')
                  setNewDue('')
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
            <div className="flex gap-4">
              <button onClick={() => setAdding(true)} className="text-sm text-zinc-400 hover:text-white transition-colors">
                + Add task
              </button>
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
