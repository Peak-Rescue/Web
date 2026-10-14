'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveMyTeaching } from '@/app/portal/[id]/meeting-actions'

export type SheetWeek = {
  id: string
  date: string
  time: string | null
  past: boolean
  teachers: { name: string; topic: string | null; mine: boolean }[]
}

const FIELD =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Everyone's names down the weeks, and the viewer's own column to fill in:
 *  tick the weeks you will teach, say what, and save them all at once — the
 *  batch the spreadsheet allowed. Unticking a week you had takes you off it.
 *  Weeks already past are shown for the record and cannot be changed. */
export default function TeachingSheet({
  seriesId,
  weeks,
  canSignUp,
}: {
  seriesId: string
  weeks: SheetWeek[]
  /** Only someone on the instructor roster can teach a week. */
  canSignUp: boolean
}) {
  const initial = () =>
    new Map(
      weeks
        .filter((w) => !w.past)
        .map((w) => {
          const mine = w.teachers.find((t) => t.mine)
          return [w.id, { on: Boolean(mine), topic: mine?.topic ?? '' }]
        })
    )
  const [mine, setMine] = useState(initial)
  const [saving, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const changed = weeks.some((w) => {
    if (w.past) return false
    const was = w.teachers.find((t) => t.mine)
    const now = mine.get(w.id)!
    return Boolean(was) !== now.on || (now.on && (was?.topic ?? '') !== now.topic.trim())
  })

  const set = (id: string, patch: Partial<{ on: boolean; topic: string }>) =>
    setMine((prev) => new Map(prev).set(id, { ...prev.get(id)!, ...patch }))

  function save() {
    setMessage(null)
    const entries = [...mine].filter(([, v]) => v.on).map(([instanceId, v]) => ({ instanceId, topic: v.topic }))
    start(async () => {
      try {
        await saveMyTeaching(seriesId, entries)
        setMessage('Saved')
        router.refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Not saved — try again')
      }
    })
  }

  const upcoming = weeks.filter((w) => !w.past)
  // Newest first: the week just gone is the one anybody looks back for.
  const earlier = weeks.filter((w) => w.past).reverse()

  const row = (w: SheetWeek) => {
    const others = w.teachers.filter((t) => !t.mine)
    const me = mine.get(w.id)
    return (
      <div key={w.id} className={`px-4 py-3 bg-zinc-900 ${w.past ? 'text-zinc-500' : ''}`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link href={`/portal/${w.id}`} className={`font-medium text-sm hover:underline w-28 shrink-0 ${w.past ? 'text-zinc-400' : 'text-white'}`}>
            {fmt(w.date)}
          </Link>
          <div className="flex-1 min-w-0 text-sm">
            {w.teachers.length === 0 && !me?.on ? (
              <span className={w.past ? 'text-zinc-600' : 'text-amber-300'}>{w.past ? 'No class' : 'No class yet'}</span>
            ) : (
              (w.past ? w.teachers : others).map((t, i) => (
                <span key={i} className={`block ${w.past ? 'text-zinc-400' : 'text-zinc-300'}`}>
                  {t.name}
                  {t.topic && <span className="text-zinc-500"> — {t.topic}</span>}
                </span>
              ))
            )}
          </div>
        </div>
        {!w.past && canSignUp && me && (
          <div className="mt-2 flex items-center gap-2.5 sm:pl-[7.75rem]">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={me.on}
                onChange={(e) => set(w.id, { on: e.target.checked })}
                className="accent-red-600"
              />
              I’ll teach
            </label>
            {me.on && (
              <input
                value={me.topic}
                onChange={(e) => set(w.id, { topic: e.target.value })}
                placeholder="What you’ll teach"
                maxLength={200}
                className={FIELD}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-6">
      {upcoming.length > 0 ? (
        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
          {upcoming.map(row)}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Every week of this series has happened.</p>
      )}
      {canSignUp && upcoming.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !changed}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save my sign-ups'}
          </button>
          {message && <span className={`text-sm ${message === 'Saved' ? 'text-teal-300' : 'text-red-400'}`}>{message}</span>}
        </div>
      )}
      {/* The record, which the spreadsheet kept too: who taught what. Folded,
          because nobody signs up from it. */}
      {earlier.length > 0 && (
        <details className="mt-8 group">
          <summary className="cursor-pointer list-none text-sm text-zinc-500 hover:text-zinc-300 select-none">
            <span className="inline-block text-xs mr-1.5 transition-transform group-open:rotate-90">▶</span>
            Earlier weeks ({earlier.length})
          </summary>
          <div className="mt-3 divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
            {earlier.map(row)}
          </div>
        </details>
      )}
    </div>
  )
}
