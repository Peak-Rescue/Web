'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Composer, { type Draft } from './UpdateComposer'
import AttachmentFields from './AttachmentFields'
import { linkLabel } from '@/lib/course-links'
import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'
import type { MeetingLink, MeetingFile } from '@/lib/meeting-details'
import type { UpdateLink, UpdateAttachment } from './update-actions'
import type { NotifyCounts } from '@/lib/course-notify'
import { postCourseUpdate } from './update-actions'
import { saveMeetingDetails, noteMeetingAnnounced } from './logistics-actions'
import { meetingDayLabel } from '@/lib/meeting-details'

// Meeting point and time: read as two facts, edited in place, and announced
// with the same composer the Updates section uses.
//
// The micro plan, not the venue — the schedule already says which crag. This
// is the lot and the tree and the hour, decided late and sometimes changed the
// morning of, which is why it is editable here rather than only from admin.
export default function MeetingDetails({
  instanceId,
  meetingDate,
  courseStart,
  meetingPoint,
  meetingTime,
  links,
  files,
  canEdit,
  notifyCounts,
  started,
}: {
  instanceId: string
  /** Null means day one, which courseStart answers. */
  meetingDate: string | null
  courseStart: string | null
  meetingPoint: string | null
  meetingTime: string | null
  /** The pin, the gate-code page. Kept with the meeting point rather than on
      the announcement about it — a day later the announcement is somewhere
      down the updates feed. */
  links: MeetingLink[]
  /** Signed on the server: the bucket is private. */
  files: MeetingFile[]
  canEdit: boolean
  notifyCounts: NotifyCounts
  /** Day one has been and gone: everyone has met, and the block folds away to
      a single line rather than heading the page for the rest of the week. */
  started: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(!started)
  // The field opens on day one rather than empty: it is the answer nearly
  // every time, and an empty date box invites the question of whether leaving
  // it blank means today.
  const [date, setDate] = useState(meetingDate ?? courseStart ?? '')
  const [point, setPoint] = useState(meetingPoint ?? '')
  const [time, setTime] = useState(meetingTime ?? '')
  const [draftLinks, setDraftLinks] = useState<UpdateLink[]>(links)
  const [draftFiles, setDraftFiles] = useState<UpdateAttachment[]>(
    files.map(({ path, filename }) => ({ path, filename }))
  )
  // Set once the fields are saved and it's time to say so — holds the wording
  // the announcement starts from, which differs for a plan that moved.
  const [telling, setTelling] = useState<{ moved: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const isSet = Boolean(meetingPoint || meetingTime || links.length || files.length)
  const day = meetingDayLabel(meetingDate, courseStart)

  // Never quotes the point or the time. Quoting it would put a second copy on
  // the same page — one in the field, one in the feed — and when the lot
  // changes again it's the copy in the feed nobody thinks to edit. It's a
  // starting draft, though: it's yours to rewrite before it goes.
  // `moved` means this day has been announced before, so anyone reading has an
  // earlier version of it — not that the fields differ from whatever they last
  // held. Setting tomorrow's plan every evening is a run of first
  // announcements about different days, and none of them is a correction.
  //
  // Naming the day is the detail worth repeating out here: it tells someone
  // enrolled on two courses which one this is about, and it is the difference
  // between "the plan is set" and a plan they can act on without opening
  // anything.
  const draftBody = (moved: boolean) => {
    const when = day ? ` for ${day}` : ''
    return moved
      ? `The meeting point or time${when} has changed — the current plan is under Course info on this page. Please check it before you set off.`
      : `Where and when to meet${when} is now set — it’s under Course info on this page.`
  }

  async function save(thenTell: boolean) {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await saveMeetingDetails(instanceId, {
        meetingDate: date,
        meetingPoint: point,
        meetingTime: time,
        links: draftLinks,
        attachments: draftFiles,
      })
      setEditing(false)
      if (thenTell) setTelling({ moved: r.announced })
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
      const posted = await postCourseUpdate(instanceId, {
        ...draft,
        // Says what kind of news it is without saying what the news is.
        subjectNote: (() => {
          const short = meetingDayLabel(meetingDate, courseStart, 'short')
          const what = short ? `meeting details for ${short}` : 'meeting details'
          return moved ? `${what} changed` : what
        })(),
      })
      // Only now is this day one the course has been told about, which is
      // what makes the next announcement for it a correction rather than the
      // plan arriving.
      await noteMeetingAnnounced(instanceId, date)
      setTelling(null)
      setResult(posted.emailProblem ?? `Posted to Updates. ${posted.sent} ${posted.sent === 1 ? 'person' : 'people'} emailed a link.`)
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
        <label className="block sm:col-span-2">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </label>
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
      <AttachmentFields
        instanceId={instanceId}
        links={draftLinks}
        setLinks={setDraftLinks}
        attachments={draftFiles}
        setAttachments={setDraftFiles}
        disabled={busy}
      />

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
            setDate(meetingDate ?? courseStart ?? '')
            setPoint(meetingPoint ?? ''); setTime(meetingTime ?? '')
            setDraftLinks(links)
            setDraftFiles(files.map(({ path, filename }) => ({ path, filename })))
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

  // The pin sits under the two boxes, not inside the prose: a URL typed into
  // the meeting point is unclickable text, and on a phone at 0855 what you
  // want is something to tap.
  const pins = (links.length > 0 || files.length > 0) && (
    <div className="flex flex-wrap gap-2">
      {links.map((l, i) => (
        <a
          key={`l${i}`}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:border-teal-400 hover:text-teal-100 text-sm transition-colors"
        >
          <LinkIcon />
          <span className="truncate">{linkLabel(l)}</span>
          <span className="text-teal-400/70 shrink-0">↗</span>
        </a>
      ))}
      {files.map((f, i) => (
        <a
          key={`f${i}`}
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white text-sm transition-colors"
        >
          <span className="shrink-0"><PaperclipIcon /></span>
          <span className="truncate">{f.filename}</span>
        </a>
      ))}
    </div>
  )

  const readout = isSet ? (
    <div className="space-y-3">
    <dl className="grid sm:grid-cols-2 gap-3">
      {meetingPoint && (
        <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Where</dt>
          <dd className="text-sm text-zinc-200 mt-0.5">{meetingPoint}</dd>
        </div>
      )}
      {(meetingTime || day) && (
        <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">When</dt>
          {/* Day above hour: on a course that runs five days, which morning
              this is about is the part that cannot be guessed from the hour. */}
          <dd className="text-sm text-zinc-200 mt-0.5">
            {day && <span className="block">{day}</span>}
            {meetingTime}
          </dd>
        </div>
      )}
    </dl>
    {pins}
    </div>
  ) : (
    canEdit && (
      <p className="text-xs text-zinc-600">
        Where and when to meet isn’t set yet — nobody on this course knows where to go.
      </p>
    )
  )

  // Once everyone has met, one line — the plan is still here to check, it just
  // stops being the first thing on the page for the rest of the week.
  if (!open && !editing && !telling) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-left text-xs text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
      >
        <span aria-hidden className="text-zinc-600 shrink-0">▸</span>
        <span className="font-medium text-zinc-400 shrink-0 whitespace-nowrap">Meeting point</span>
        {isSet ? (
          <span className="truncate">
            {[meetingTime, meetingPoint].filter(Boolean).join(' · ')}
          </span>
        ) : (
          <span>not set</span>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {!editing && !telling && (
        <button
          onClick={() => setOpen(false)}
          aria-expanded
          className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <span aria-hidden className="text-zinc-600 rotate-90">▸</span>
          <span className="font-medium text-zinc-400">Meeting point</span>
        </button>
      )}
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
