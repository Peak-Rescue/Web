'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateSchedule, addScheduleDay, updateScheduleDay, removeScheduleDay,
  addScheduleBlock, addScheduleBlocks, updateScheduleBlock, removeScheduleBlock,
  copySchedule,
} from './actions'

export type ScheduleBlock = {
  id: string
  parent_id: string | null
  title: string
  time_label: string | null
  location: string | null
  sort_order: number
}

export type ScheduleDay = {
  id: string
  title: string
  location: string | null
  notes: string | null
  sort_order: number
  schedule_blocks: ScheduleBlock[]
}

export type Schedule = {
  id: string
  name: string
  overview: string | null
  objectives: string[]
  instance_id: string | null
  is_template: boolean
  schedule_days: ScheduleDay[]
}

// Builds the running order the way the real outlines are written: an overview,
// optional learning objectives, then a day per day — each with its own
// location and notes, and topics that can carry sub-topics. Times are optional
// because half the schedules we run don't use them.
export default function ScheduleEditor({
  schedule,
  courseType,
}: {
  schedule: Schedule
  courseType?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteInto, setPasteInto] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')

  const days = useMemo(
    () => [...schedule.schedule_days].sort((a, b) => a.sort_order - b.sort_order),
    [schedule.schedule_days]
  )

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <textarea
        defaultValue={schedule.overview ?? ''}
        onBlur={(e) => e.target.value !== (schedule.overview ?? '') && run(() => updateSchedule(schedule.id, { overview: e.target.value }))}
        rows={3}
        placeholder="Course overview — who it's for, what they'll walk away able to do"
        className={`w-full resize-y ${input}`}
      />

      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Learning objectives — one per line, optional</label>
        <textarea
          defaultValue={schedule.objectives.join('\n')}
          onBlur={(e) => {
            const next = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
            if (next.join('\n') !== schedule.objectives.join('\n')) {
              run(() => updateSchedule(schedule.id, { objectives: next }))
            }
          }}
          rows={3}
          className={`w-full resize-y ${input}`}
        />
      </div>

      {days.map((day) => {
        const blocks = [...day.schedule_blocks].sort((a, b) => a.sort_order - b.sort_order)
        const topics = blocks.filter((b) => !b.parent_id)
        const childrenOf = (id: string) => blocks.filter((b) => b.parent_id === id)

        return (
          <div key={day.id} className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={day.title}
                  onBlur={(e) => e.target.value !== day.title && run(() => updateScheduleDay(day.id, { title: e.target.value }))}
                  placeholder="Day 1: Basic rope skills"
                  className={`flex-1 font-medium ${input}`}
                />
                <button
                  onClick={() => { if (confirm(`Remove "${day.title}"?`)) run(() => removeScheduleDay(day.id)) }}
                  disabled={busy}
                  className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                >
                  Remove day
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  defaultValue={day.location ?? ''}
                  onBlur={(e) => e.target.value !== (day.location ?? '') && run(() => updateScheduleDay(day.id, { location: e.target.value }))}
                  placeholder="Location"
                  className={`w-full ${input}`}
                />
                <input
                  defaultValue={day.notes ?? ''}
                  onBlur={(e) => e.target.value !== (day.notes ?? '') && run(() => updateScheduleDay(day.id, { notes: e.target.value }))}
                  placeholder="Notes — e.g. bring tactical gear"
                  className={`w-full ${input}`}
                />
              </div>
            </div>

            <div className="divide-y divide-zinc-800/70">
              {topics.map((t) => (
                <div key={t.id} className="px-3 py-2">
                  <BlockRow block={t} busy={busy} run={run} input={input} />
                  <div className="ml-5 mt-1 space-y-1">
                    {childrenOf(t.id).map((c) => (
                      <BlockRow key={c.id} block={c} busy={busy} run={run} input={input} sub />
                    ))}
                    <button
                      onClick={() => run(() => addScheduleBlock(day.id, { title: 'New sub-topic', parentId: t.id }))}
                      disabled={busy}
                      className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                      + sub-topic
                    </button>
                  </div>
                </div>
              ))}
              {topics.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-600">Nothing scheduled for this day yet.</p>
              )}
            </div>

            <div className="px-3 py-2 bg-zinc-900/50 flex flex-wrap items-center gap-2">
              {addingTo === day.id ? (
                <>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || !newTitle.trim()) return
                      run(async () => {
                        await addScheduleBlock(day.id, { title: newTitle, timeLabel: newTime || null })
                        setNewTitle(''); setNewTime('')
                      })
                    }}
                    placeholder="Topic"
                    className={`flex-1 min-w-40 ${input}`}
                  />
                  <input
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="Time (optional)"
                    className={`w-32 ${input}`}
                  />
                  <button
                    onClick={() => {
                      if (!newTitle.trim()) return
                      run(async () => {
                        await addScheduleBlock(day.id, { title: newTitle, timeLabel: newTime || null })
                        setNewTitle(''); setNewTime('')
                      })
                    }}
                    disabled={busy || !newTitle.trim()}
                    className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button onClick={() => setAddingTo(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Done</button>
                </>
              ) : pasteInto === day.id ? (
                <div className="w-full space-y-2">
                  <textarea
                    autoFocus
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={5}
                    placeholder={'Paste an outline — indented lines become sub-topics:\n\nRappel methods and practice\n  Prusik above device\n  Firefighter belay'}
                    className={`w-full resize-y ${input}`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => run(async () => {
                        await addScheduleBlocks(day.id, pasteText)
                        setPasteText(''); setPasteInto(null)
                      })}
                      disabled={busy || !pasteText.trim()}
                      className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      Add these
                    </button>
                    <button onClick={() => { setPasteInto(null); setPasteText('') }} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => setAddingTo(day.id)} className="text-xs text-zinc-400 hover:text-white transition-colors">
                    + Topic
                  </button>
                  <span className="text-zinc-700">·</span>
                  <button onClick={() => setPasteInto(day.id)} className="text-xs text-zinc-400 hover:text-white transition-colors">
                    Paste an outline
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => run(() => addScheduleDay(schedule.id))}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          + Day
        </button>
        {!schedule.is_template && (
          <button
            onClick={() => {
              const name = prompt('Save this schedule as a reusable template. Name it:', schedule.name)
              if (name) run(() => copySchedule(schedule.id, { isTemplate: true, name, courseType }))
            }}
            disabled={busy}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Save as a template
          </button>
        )}
      </div>
    </div>
  )
}

function BlockRow({
  block, busy, run, input, sub,
}: {
  block: ScheduleBlock
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  sub?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {!sub && (
        <input
          defaultValue={block.time_label ?? ''}
          onBlur={(e) => e.target.value !== (block.time_label ?? '') && run(() => updateScheduleBlock(block.id, { timeLabel: e.target.value }))}
          placeholder="time"
          className={`w-24 shrink-0 text-xs ${input}`}
        />
      )}
      <input
        defaultValue={block.title}
        onBlur={(e) => e.target.value !== block.title && run(() => updateScheduleBlock(block.id, { title: e.target.value }))}
        className={`flex-1 min-w-0 ${sub ? 'text-[13px] text-zinc-300' : 'text-sm'} ${input}`}
      />
      <button
        onClick={() => run(() => removeScheduleBlock(block.id))}
        disabled={busy}
        className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
      >
        ×
      </button>
    </div>
  )
}
