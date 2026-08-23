'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Composer, { type Draft } from './UpdateComposer'
import type { NotifyCounts } from '@/lib/course-notify'
import { postCourseUpdate } from './update-actions'
import { saveMeetingDetails } from './logistics-actions'

// Meeting point and time: read as two facts, edited in place, and announced
// with the same composer the Updates section uses.
//
// The micro plan, not the venue — the schedule already says which crag. This
// is the lot and the tree and the hour, decided late and sometimes changed the
// morning of, which is why it is editable here rather than only from admin.
export default function MeetingDetails({
  instanceId,
  meetingPoint,
  meetingTime,
  canEdit,
  notifyCounts,
}: {
  instanceId: string
  meetingPoint: string | null
  meetingTime: string | null
  canEdit: boolean
  notifyCounts: NotifyCounts
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [point, setPoint] = useState(meetingPoint ?? '')
  const [time, setTime] = useState(meetingTime ?? '')
  // Set once the fields are saved and it's time to say so — holds the wording
  // the announcement starts from, which differs for a plan that moved.
  const [telling, setTelling] = useState<{ moved: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const isSet = Boolean(meetingPoint || meetingTime)

  // Never quotes the point or the time. Quoting it would put a second copy on
  // the same page — one in the field, one in the feed — and when the lot
  // changes again it's the copy in the feed nobody thinks to edit. It's a
  // starting draft, though: it's yours to rewrite before it goes.
  const draftBody = (moved: boolean) =>
    moved
      ? 'The meeting point or time for this course has changed — the current plan is under Course info on this page. Please check it before you set off.'
      : 'Where and when to meet is now set — it’s under Course info on this page.'

  async function save(thenTell: boolean) {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await saveMeetingDetails(instanceId, { meetingPoint: point, meetingTime: time })
      setEditing(false)
      if (thenTell) setTelling({ moved: r.had && r.changed })
      else setResult('Saved. Nobody was emailed.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    } finally {
      setBusy(false)
    }
  }

  async function send(draft: Draft, moved: boolean) {
    const n = notifyCounts[draft.audience]
    if (!confirm(`Post this and email ${n === 1 ? '1 person' : `${n} people`} a link to it?`)) return
    setBusy(true); setError(null)
    try {
      const r = await postCourseUpdate(instanceId, {
        ...draft,
        // Says what kind of news it is without saying what the news is.
        subjectNote: moved ? 'meeting details changed' : 'meeting details',
      })
      setTelling(null)
      setResult(r.emailProblem ?? `Posted to Updates. ${r.sent} ${r.sent === 1 ? 'person' : 'people'} emailed a link.`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t send')
    } finally {
      setBusy(false)
    }
  }

  const fields = (
    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Meeting point</span>
          <input
            autoFocus
            value={point}
            onChange={(e) => setPoint(e.target.value)}
            placeholder="lower lot, by the big cedar"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Meeting time</span>
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="0700, ready to walk"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </label>
      </div>
      {error && <p className="text-xs text-pr-red">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => save(true)}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save and tell the course…'}
        </button>
        <button
          onClick={() => save(false)}
          disabled={busy}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          Save without telling anyone
        </button>
        <button
          onClick={() => {
            setPoint(meetingPoint ?? ''); setTime(meetingTime ?? '')
            setError(null); setEditing(false)
          }}
          disabled={busy}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )

  const readout = isSet ? (
    <dl className="grid sm:grid-cols-2 gap-3">
      {meetingPoint && (
        <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Meeting point</dt>
          <dd className="text-sm text-zinc-200 mt-0.5">{meetingPoint}</dd>
        </div>
      )}
      {meetingTime && (
        <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Meeting time</dt>
          <dd className="text-sm text-zinc-200 mt-0.5">{meetingTime}</dd>
        </div>
      )}
    </dl>
  ) : (
    canEdit && (
      <p className="text-xs text-zinc-600">
        Where and when to meet isn’t set yet — nobody on this course knows where to go.
      </p>
    )
  )

  return (
    <div className="space-y-2">
      {editing ? fields : readout}

      {canEdit && telling && (
        <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-2">
          <p className="text-[11px] text-zinc-500">
            Saved. Say so — add a map pin or a photo of the spot if it helps, and pick who needs it.
          </p>
          <Composer
            instanceId={instanceId}
            busy={busy}
            notifyCounts={notifyCounts}
            submitLabel="Post and notify"
            initial={{ body: draftBody(telling.moved), links: [], attachments: [], audience: 'everyone' }}
            onCancel={() => setTelling(null)}
            onSubmit={(draft) => { void send(draft, telling.moved) }}
          />
        </div>
      )}

      {canEdit && !editing && !telling && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setResult(null); setEditing(true) }}
            className="text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            {isSet ? 'Edit meeting details' : 'Add meeting details'}
          </button>
          {/* For details set some other time and never announced — filled in on
              the admin screen, or saved here without telling anyone. */}
          {isSet && (
            <button
              onClick={() => { setResult(null); setTelling({ moved: false }) }}
              className="text-[11px] text-zinc-500 hover:text-white transition-colors"
            >
              Tell the course
            </button>
          )}
          {result && <span className="text-[11px] text-zinc-500">{result}</span>}
          {error && <span className="text-[11px] text-pr-red">{error}</span>}
        </div>
      )}
    </div>
  )
}
