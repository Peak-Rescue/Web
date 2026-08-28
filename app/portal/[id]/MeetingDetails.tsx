'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tick } from './UpdateComposer'
import AttachmentFields from './AttachmentFields'
import { ChipRow } from '@/components/LinkChip'
import CloseButton from '@/components/CloseButton'
import type { MeetingLink, MeetingFile } from '@/lib/meeting-details'
import type { UpdateLink, UpdateAttachment, UpdateAudience } from './update-actions'
import type { NotifyCounts } from '@/lib/course-notify'
import { announceMeetingDetails } from './update-actions'
import { saveMeetingDetails, saveDayMeetingDetails } from './logistics-actions'
import { meetingDayLabel } from '@/lib/meeting-details'

// Meeting point and time: read as two facts, edited in place, and announced
// with the same composer the Updates section uses.
//
// The micro plan, not the venue — the schedule already says which crag. This
// is the lot and the tree and the hour, decided late and sometimes changed the
// morning of, which is why it is editable here rather than only from admin.
export default function MeetingDetails({
  instanceId,
  dayId,
  inheritedPoint = null,
  inheritedTime = null,
  meetingDate,
  courseStart,
  meetingPoint,
  meetingTime,
  links,
  files,
  canEdit,
  notifyCounts,
  announcedDates,
  folded,
}: {
  instanceId: string
  /** Set when this block belongs to a schedule day rather than to the course.
      A day has no date of its own — it is the Nth date the course runs — so
      the date field disappears and the save goes to the day's row. */
  dayId?: string
  /** What this morning falls back to when nothing is typed here: the meetup
      the site usually uses. Shown rather than copied, so correcting the meetup
      still reaches every day that inherits it. */
  inheritedPoint?: string | null
  /** What we usually do at this site. A placeholder only — the hour is never
      inherited silently, because a default that announces itself is a default
      nobody checked. */
  inheritedTime?: string | null
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
  /** Fold to a single line. Two reasons, one behaviour: the day is behind us
      and everyone has met, or it is a later day on a schedule where only the
      next morning is worth having open. The line still says what the plan is,
      so folding costs a click rather than the answer. */
  folded: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(!folded)
  // Folding is a fact about the date, not a preference, so it is re-decided
  // whenever the date crosses that line: set the plan for a day still ahead
  // and the block opens itself back up rather than staying shut on the answer
  // that was just written. Between crossings the toggle is the reader's.
  const [foldedFor, setFoldedFor] = useState(folded)
  if (folded !== foldedFor) {
    setFoldedFor(folded)
    setOpen(!folded)
  }
  // The field opens on day one rather than empty: it is the answer nearly
  // every time, and an empty date box invites the question of whether leaving
  // it blank means today.
  const [date, setDate] = useState(meetingDate ?? courseStart ?? '')
  const [point, setPoint] = useState(meetingPoint ?? '')
  const pointRef = useRef<HTMLTextAreaElement>(null)

  // Height follows the content rather than the other way round. Reset first:
  // scrollHeight only ever reports growth, so without it the box can grow and
  // never shrink back when text is deleted.
  useEffect(() => {
    const el = pointRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [point, editing])
  const [time, setTime] = useState(meetingTime ?? '')
  const [draftLinks, setDraftLinks] = useState<UpdateLink[]>(links)
  const [draftFiles, setDraftFiles] = useState<UpdateAttachment[]>(
    files.map(({ path, filename }) => ({ path, filename }))
  )
  // Telling the course is part of saving, not a screen that follows it. On by
  // default: a meeting point nobody has been told about is the failure this
  // block exists to prevent, so the quiet save is the one you have to ask for.
  const [tell, setTell] = useState(true)
  const [toStudents, setToStudents] = useState(true)
  const [toInstructors, setToInstructors] = useState(true)
  // Same default as the update composer: the copy is the receipt that it went.
  const [copyMe, setCopyMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  // The meetup stands in for a day that hasn't overridden it, so a day
  // pointing at a known place does not read as "nobody knows where to go".
  const shownPoint = meetingPoint || inheritedPoint || null
  const inherited = !meetingPoint && Boolean(inheritedPoint)
  const isSet = Boolean(shownPoint || meetingTime || links.length || files.length)
  const day = meetingDayLabel(meetingDate, courseStart)
  // Which day the announcement will be about, and whether these people have
  // heard about that day already — read from the field being edited, so the
  // line under the button keeps up as the date is picked. The email is written
  // from the same two facts, server-side, where they cannot be stale.
  const announceDay = date || courseStart || ''
  const draftDay = meetingDayLabel(date || null, courseStart)
  const moved = Boolean(announceDay) && announcedDates.includes(announceDay)
  const audience: UpdateAudience =
    toStudents && toInstructors ? 'everyone' : toInstructors ? 'instructors' : 'students'
  const reach = toStudents || toInstructors ? notifyCounts[audience] : 0

  // Saving and saying so are one press. They were two, with the second box
  // arriving after the first had closed and looked like a receipt — so the
  // question "did that send?" had to be asked of a screen that had already
  // said "Saved".
  async function submit(thenTell: boolean) {
    setBusy(true); setError(null); setResult(null)
    try {
      if (dayId) {
        await saveDayMeetingDetails(dayId, {
          meetingPoint: point,
          meetingTime: time,
          links: draftLinks,
          attachments: draftFiles,
        })
      } else {
        await saveMeetingDetails(instanceId, {
          meetingDate: date,
          meetingPoint: point,
          meetingTime: time,
          links: draftLinks,
          attachments: draftFiles,
        })
      }

      if (!thenTell) {
        setEditing(false)
        setResult('Saved. Nobody was emailed.')
        router.refresh()
        return
      }

      const sent = await announceMeetingDetails(instanceId, { audience, meetingDate: date, copyMe })
      setEditing(false)
      setResult(
        sent.emailProblem ??
          `Emailed ${sent.sent === 1 ? '1 person' : `${sent.sent} people`} a link to this page.`
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    } finally {
      setBusy(false)
    }
  }

  function discard() {
    setDate(meetingDate ?? courseStart ?? '')
    setPoint(meetingPoint ?? ''); setTime(meetingTime ?? '')
    setDraftLinks(links)
    setDraftFiles(files.map(({ path, filename }) => ({ path, filename })))
    setError(null); setEditing(false)
  }

  const fields = (
    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-3">
      <div className="flex justify-end">
        <CloseButton onClick={discard} disabled={busy} label="Cancel" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {dayId ? (
          // The schedule already decided which day this is — it is the Nth
          // date the course runs. Offering a date field here would be a second
          // answer, and the two would disagree the moment a course moved.
          <p className="sm:col-span-2 text-[11px] uppercase tracking-wide text-zinc-500">
            {draftDay ?? 'This day'}
          </p>
        ) : (
          <label className="block sm:col-span-2">
            <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Day</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
          </label>
        )}
        {/* Wide, and it grows with what you type. A meeting point is usually
            four words and sometimes a paragraph — where to park, which gate,
            what the water is doing — and a one-line box that scrolls what you
            wrote out of sight is no way to write the second kind. */}
        <label className="block sm:col-span-2">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Meeting point</span>
          <textarea
            autoFocus
            ref={pointRef}
            rows={2}
            value={point}
            onChange={(e) => setPoint(e.target.value)}
            placeholder={inheritedPoint ?? 'lower lot, by the big cedar'}
            className="w-full min-h-[4.5rem] resize-y bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 leading-relaxed focus:outline-none focus:border-zinc-500"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Meeting time</span>
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder={inheritedTime ?? '0700, ready to walk'}
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

      {/* Telling them is a tick and a button, not a message to write. The
          email says the plan for that day is set and links here; it never
          quoted the plan even when there was a box to type it in, because the
          block above is meant to be the only copy of it. */}
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
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
            <span className="text-zinc-600">Who gets it</span>
            <Tick label="Students" on={toStudents} set={setToStudents} />
            <Tick label="Instructors" on={toInstructors} set={setToInstructors} />
            <span className="text-zinc-700">·</span>
            <Tick label="Copy me" on={copyMe} set={setCopyMe} />
            <span className="ml-auto">
              {reach === 0
                ? copyMe ? 'Nobody else to email — goes to you only.' : 'Nobody to email yet.'
                : `Emails ${reach === 1 ? '1 person' : `${reach} people`}${copyMe ? ' and you' : ''}: ${
                    moved ? 'the plan' : 'where and when'
                  }${draftDay ? ` for ${draftDay}` : ''} ${moved ? 'has changed' : 'is set'}.`}
            </span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-pr-red">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => submit(tell)}
          disabled={busy || (tell && ((reach === 0 && !copyMe) || (!toStudents && !toInstructors)))}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy
            ? 'Working…'
            : !tell
              ? 'Save'
              : reach === 0
                // Copying yourself into an empty roster is a real send, and
                // "notify 0 people" reads like nothing happens.
                ? 'Save and copy me'
                : `Save and notify ${reach === 1 ? '1 person' : `${reach} people`}`}
        </button>

      </div>
    </div>
  )

  // The pin sits under the two boxes, not inside the prose: a URL typed into
  // the meeting point is unclickable text, and on a phone at 0855 what you
  // want is something to tap.
  const pins = <ChipRow links={links} files={files} />

  const readout = isSet ? (
    <div className="space-y-3">
    <dl className="grid sm:grid-cols-2 gap-3">
      {shownPoint && (
        // Spans the row when it runs past a line: a paragraph set in a half
        // width column beside a single time is a column of two-word lines.
        <div className={`px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 ${
          shownPoint.length > 80 || shownPoint.includes('\n') ? 'sm:col-span-2' : ''
        }`}>
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Where</dt>
          {/* Typed over several lines, read back over several lines. */}
          <dd className="text-sm text-zinc-200 mt-0.5 whitespace-pre-line">{shownPoint}</dd>
          {/* Said out loud, because "where did this come from" is the question
              behind every stale meeting point. */}
          {inherited && (
            <dd className="text-[11px] text-zinc-600 mt-0.5">From the site’s usual meeting point</dd>
          )}
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
        {dayId
          ? 'No meeting point set for this day.'
          : 'Where and when to meet isn’t set yet — nobody on this course knows where to go.'}
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
            {[meetingTime, shownPoint].filter(Boolean).join(' · ')}
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
          {/* The way into the only editable thing in this block, so it looks
              like something you press. As bare grey text it read as a caption
              and sat at a different spot depending on how much was above it. */}
          <button
            onClick={() => { setResult(null); setEditing(true) }}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            <svg
              aria-hidden
              xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
            >
              {isSet ? (
                <>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </>
              ) : (
                <>
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </>
              )}
            </svg>
            {isSet ? 'Edit meeting details' : 'Add meeting details'}
          </button>
          {/* For details set some other time and never announced — filled in
              on the admin screen, or saved here without telling anyone. Opens
              the same box: there is one screen for the plan and the message
              about it, whichever of the two you came for. */}
          {isSet && (
            <button
              onClick={() => { setResult(null); setTell(true); setEditing(true) }}
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
