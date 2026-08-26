'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tick } from './UpdateComposer'
import AttachmentFields from './AttachmentFields'
import { linkLabel } from '@/lib/course-links'
import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'
import type { MeetingLink, MeetingFile } from '@/lib/meeting-details'
import type { UpdateLink, UpdateAttachment, UpdateAudience } from './update-actions'
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
  announcedDates,
  passed,
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
  /** Days this course has already been told about — what makes a further
      announcement for one of them a correction rather than the plan arriving.
      Empty for anyone who can't post. */
  announcedDates: string[]
  /** The meeting day is behind us: everyone has met, and the block folds away
      to a single line rather than heading the page for the rest of the week. */
  passed: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(!passed)
  // Folding is a fact about the date, not a preference, so it is re-decided
  // whenever the date crosses that line: set the plan for a day still ahead
  // and the block opens itself back up rather than staying shut on the answer
  // that was just written. Between crossings the toggle is the reader's.
  const [foldedFor, setFoldedFor] = useState(passed)
  if (passed !== foldedFor) {
    setFoldedFor(passed)
    setOpen(!passed)
  }
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
  // Telling the course is part of saving, not a screen that follows it. On by
  // default: a meeting point nobody has been told about is the failure this
  // block exists to prevent, so the quiet save is the one you have to ask for.
  const [tell, setTell] = useState(true)
  // Null means "whatever the day and the history say" — so the sentence keeps
  // up with the date field until someone types over it, and stops the moment
  // they do.
  const [body, setBody] = useState<string | null>(null)
  const [toStudents, setToStudents] = useState(true)
  const [toInstructors, setToInstructors] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const isSet = Boolean(meetingPoint || meetingTime || links.length || files.length)
  const day = meetingDayLabel(meetingDate, courseStart)
  // The announcement is written the instant the save returns, before the page
  // has been round to the server for the new props — so it reads the field,
  // not the prop, or it names the day this plan was for before it was edited.
  const draftDay = (form: 'long' | 'short' = 'long') =>
    meetingDayLabel(date || null, courseStart, form)

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
    const named = draftDay()
    const when = named ? ` for ${named}` : ''
    return moved
      ? `The meeting point or time${when} has changed — the current plan is under Course info on this page. Please check it before you set off.`
      : `Where and when to meet${when} is now set — it’s under Course info on this page.`
  }

  // Which day the announcement is about, and whether these people have heard
  // about that day already — both answered from the field being edited, so the
  // sentence keeps up as the date is picked.
  const announceDay = date || courseStart || ''
  const moved = Boolean(announceDay) && announcedDates.includes(announceDay)
  const audience: UpdateAudience =
    toStudents && toInstructors ? 'everyone' : toInstructors ? 'instructors' : 'students'
  const reach = toStudents || toInstructors ? notifyCounts[audience] : 0
  const message = body ?? draftBody(moved)

  // Saving and saying so are one press. They were two, with the second box
  // arriving after the first had closed and looked like a receipt — so the
  // question "did that send?" had to be asked of a screen that had already
  // said "Saved".
  async function submit(thenTell: boolean) {
    setBusy(true); setError(null); setResult(null)
    try {
      await saveMeetingDetails(instanceId, {
        meetingDate: date,
        meetingPoint: point,
        meetingTime: time,
        links: draftLinks,
        attachments: draftFiles,
      })

      if (!thenTell) {
        setEditing(false)
        setResult('Saved. Nobody was emailed.')
        router.refresh()
        return
      }

      const posted = await postCourseUpdate(instanceId, {
        body: message,
        links: [],
        attachments: [],
        audience,
        // Says what kind of news it is without saying what the news is.
        subjectNote: (() => {
          const short = draftDay('short')
          const what = short ? `meeting details for ${short}` : 'meeting details'
          return moved ? `${what} changed` : what
        })(),
      })
      // Only now is this a day the course has been told about, which is what
      // makes the next announcement for it a correction rather than the plan
      // arriving.
      await noteMeetingAnnounced(instanceId, date)
      setEditing(false)
      setBody(null)
      setResult(
        posted.emailProblem ??
          `Posted to Updates. ${posted.sent} ${posted.sent === 1 ? 'person' : 'people'} emailed a link.`
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
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

      {/* The announcement, written here rather than in a box that arrives
          afterwards. It is a draft: the wording follows the day until it is
          typed over, and the ticks address it. */}
      <div className="pt-1 border-t border-zinc-800 space-y-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={tell}
            onChange={(e) => setTell(e.target.checked)}
            className="accent-pr-red w-3 h-3"
          />
          Tell the course
        </label>

        {tell && (
          <div className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full resize-y bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
              <span className="text-zinc-600">Who sees it</span>
              <Tick label="Students" on={toStudents} set={setToStudents} />
              <Tick label="Instructors" on={toInstructors} set={setToInstructors} />
              {/* The pins stay on the block rather than being copied onto the
                  post: a day later the post is somewhere down the feed, and the
                  block is still the first thing on the page. */}
              <span className="ml-auto">
                {links.length + files.length > 0 && 'Links and photos stay on the meeting point. '}
                {reach === 0
                  ? 'Nobody to email — posts to the course page only.'
                  : `Emails ${reach === 1 ? '1 person' : `${reach} people`} a link.`}
              </span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-pr-red">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => submit(tell)}
          disabled={busy || (tell && !message.trim()) || (tell && !toStudents && !toInstructors)}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy
            ? 'Working…'
            : !tell
              ? 'Save'
              : reach === 0
                ? 'Save and post'
                : `Save and notify ${reach === 1 ? '1 person' : `${reach} people`}`}
        </button>
        <button
          onClick={() => {
            setDate(meetingDate ?? courseStart ?? '')
            setPoint(meetingPoint ?? ''); setTime(meetingTime ?? '')
            setDraftLinks(links)
            setDraftFiles(files.map(({ path, filename }) => ({ path, filename })))
            setBody(null)
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
  if (!open && !editing) {
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
      {!editing && (
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

      {canEdit && !editing && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setResult(null); setEditing(true) }}
            className="text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            {isSet ? 'Edit meeting details' : 'Add meeting details'}
          </button>
          {/* For details set some other time and never announced — filled in
              on the admin screen, or saved here without telling anyone. Opens
              the same box: there is one screen for the plan and the message
              about it, whichever of the two you came for. */}
          {isSet && (
            <button
              onClick={() => { setResult(null); setBody(null); setTell(true); setEditing(true) }}
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
