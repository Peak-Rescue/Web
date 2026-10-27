'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tick } from './UpdateComposer'
import AttachmentFields, { withLinkDraft } from './AttachmentFields'
import { ChipRow } from '@/components/LinkChip'
import { Linkified, shortUrl, urlsIn } from '@/lib/linkify'
import CloseButton from '@/components/CloseButton'
import InfoHint from '@/components/InfoHint'
import type { MeetingLink, MeetingFile } from '@/lib/meeting-details'
import type { UpdateLink, UpdateAttachment, UpdateAudience } from './update-actions'
import type { NotifyCounts } from '@/lib/course-notify'
import { announceMeetingDetails } from './update-actions'
import { saveDayMeetingDetails } from './logistics-actions'
import { fileDayMeetingPoint, dayMeetingPointFilingOptions } from '@/app/admin/sites/actions'
import { meetingDayLabel } from '@/lib/meeting-details'

// The picker's value for a one-off spot typed below rather than filed.
const ELSEWHERE = 'elsewhere'

// Meeting point and time: read as two facts, edited in place, and announced
// with the same composer the Updates section uses.
//
// The micro plan, not the venue — the schedule already says which crag. This
// is the lot and the tree and the hour, decided late and sometimes changed the
// morning of, which is why it is editable here rather than only from admin.
//
// Always a schedule day. There was a course-level twin of this block sitting
// at the top of Updates, for a course with no schedule, and the two were a
// second answer to one question waiting to disagree. Where we meet is part of
// the day's plan, so it belongs to the day — and a course with no schedule has
// nowhere to say it, which is honest: it isn't ready to run.
export default function MeetingDetails({
  instanceId,
  dayId,
  inheritedTime = null,
  meetingDate,
  meetingPoint,
  meetingPointId,
  meetsElsewhere,
  meetingPoints = [],
  canFileToLibrary = false,
  siteMeetup = null,
  editPlaceHref = null,
  resolved,
  meetingTime,
  links,
  inheritedLinks = [],
  files,
  canEdit,
  notifyCounts,
  announcedDates,
  folded,
}: {
  instanceId: string
  /** The day this morning belongs to. A day has no date of its own — it is
      the Nth date the course runs — so there is no date field to offer. */
  dayId: string
  /** What we usually do at this site. A placeholder only — the hour is never
      inherited silently, because a default that announces itself is a default
      nobody checked. */
  inheritedTime?: string | null
  /** Which calendar date this day falls on, worked out by the caller from the
      course's own dates. Only used for what the announcement calls the day. */
  meetingDate: string | null
  /** The day's own words: a note beside the meetup, or the place itself when
      the day meets somewhere else or there is no meetup to name. */
  meetingPoint: string | null
  /** The meetup this day gathers at, when it has been told to use one other
      than the site's usual. Null means "whatever the canyon usually does",
      which is the right answer nearly every day. */
  meetingPointId: string | null
  /** The words are a one-off place, not a note on the canyon's usual. */
  meetsElsewhere: boolean
  /** Everywhere a day could be told to gather. Empty for anyone who can't
      edit, so a student is sent no list of the company's meetups. */
  meetingPoints?: { id: string; name: string }[]
  /** Whether a meetup typed onto this day can be filed into the library from
      here. Admins only: the library is shared by every course, and the
      meeting-points table is theirs to write. */
  canFileToLibrary?: boolean
  /** What the site usually uses — so the empty option reads "Grafton lot
      (usual)" rather than the blank that makes a picker look unset, and so
      the same place is never offered twice under two names. */
  siteMeetup?: { id: string; name: string } | null
  /** Where the usual meetup is edited, for those who may. */
  editPlaceHref?: string | null
  /** What the morning reads as, from `resolveDayMeeting`. */
  resolved: {
    name: string | null
    point: string | null
    from: 'day' | 'day-meetup' | 'site-meetup' | 'course' | null
    coords: string | null
    note: string | null
  }
  meetingTime: string | null
  /** The pin, the gate-code page. Kept with the meeting point rather than on
      the announcement about it — a day later the announcement is somewhere
      down the updates feed. */
  links: MeetingLink[]
  /** The meetup's own pins — the driving link, the gate-code page — written
      once on the meetup and shown on every day that meets there. Kept apart
      from `links` because those are this day's and get saved back to it: fold
      an inherited pin into the draft and editing the morning quietly copies
      the meetup's links onto the day, where correcting them stops reaching. */
  inheritedLinks?: MeetingLink[]
  /** Signed on the server: the bucket is private. */
  files: MeetingFile[]
  canEdit: boolean
  notifyCounts: NotifyCounts
  /** Days this course has already been told about — what makes a further
      announcement for one of them a correction rather than the plan arriving.
      Empty for anyone who can't post. */
  announcedDates: string[]
  /** Fold to a single line — now only for a day with nothing on it, where the
      line is a way in for staff rather than an announcement that nobody knows
      where to go. Days ahead used to fold too, so that only the next morning
      stood open; that hid plans people had come to read, and a day behind us
      is already folded away whole by the day card around this one. */
  folded: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(!folded)
  // Whether there is anything here is a fact, not a preference, so it is
  // re-decided when that changes: fill in an empty morning and the block opens
  // itself onto the answer just written rather than staying shut on it. Either
  // side of that, the toggle is the reader's.
  const [foldedFor, setFoldedFor] = useState(folded)
  if (folded !== foldedFor) {
    setFoldedFor(folded)
    setOpen(!folded)
  }
  // The field opens on day one rather than empty: it is the answer nearly
  // every time, and an empty date box invites the question of whether leaving
  // it blank means today.
  const [date] = useState(meetingDate ?? '')
  const [point, setPoint] = useState(meetingPoint ?? '')
  // Picking the usual by name is the same place as leaving it on the usual,
  // and the two used to be two options saved two ways.
  const savedPick = meetsElsewhere ? ELSEWHERE : meetingPointId && meetingPointId !== siteMeetup?.id ? meetingPointId : ''
  const [pointId, setPointId] = useState(savedPick)
  const elsewhere = pointId === ELSEWHERE
  // Whether the words are the place or a note about it. They are the place
  // when the day says so, or when nothing is picked and the canyon has no
  // usual — there is then no other answer for them to sit beside.
  const wordsArePlace = elsewhere || (!pointId && !siteMeetup)
  const pointRef = useRef<HTMLTextAreaElement>(null)
  // A meetup filed from this box joins the picker straight away, before the
  // refresh brings the library back with it in — otherwise the select would
  // be set to an id it has no option for and read as the usual.
  const [filedPoints, setFiledPoints] = useState<{ id: string; name: string }[]>([])
  const pickable = [...meetingPoints, ...filedPoints.filter((f) => !meetingPoints.some((p) => p.id === f.id))]
    .filter((p) => p.id !== siteMeetup?.id)
  const [filing, setFiling] = useState(false)
  // The filing form's draft. Null while closed. venueId stays undefined until
  // someone picks one, so the day's own venue can fill it in when the options
  // arrive without overwriting a choice made while they were loading.
  const [fileDraft, setFileDraft] = useState<{
    name: string
    directions: string
    coords: string
    venueId: string | undefined
    makeSiteUsual: boolean
  } | null>(null)
  const [fileOpts, setFileOpts] = useState<Awaited<ReturnType<typeof dayMeetingPointFilingOptions>> | null>(null)

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
  const [linkDraft, setLinkDraft] = useState('')
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

  // The meetup's pins after this day's own — and never the same URL twice,
  // for the day that retyped a meetup's link.
  const shownLinks = [
    ...links,
    ...inheritedLinks.filter((l) => !links.some((own) => own.url === l.url)),
  ]
  // Named, because "where did this come from" is the question behind every
  // stale meeting point.
  const placeWhy =
    resolved.from === 'day-meetup' ? 'Picked for this day'
    : resolved.from === 'site-meetup' ? 'Where this canyon usually meets'
    : resolved.from === 'course' ? 'From the course'
    : null
  // Directions that are only a pasted pin say what the coordinates line does.
  const directions = resolved.point && !(resolved.name && /^\s*-?[\d.]+\s*,\s*-?[\d.]+\s*$/.test(resolved.point))
    ? resolved.point
    : null
  const shownPoint = resolved.name ?? resolved.point
  const isSet = Boolean(shownPoint || resolved.note || meetingTime || shownLinks.length || files.length)
  // A URL pasted into the words, that isn't already a pin. Offered, never
  // taken: the prose renders it as a link either way, so ignoring this costs
  // the reader nothing — it is here for the morning where what you want is the
  // big teal button, not the link three lines into a paragraph. Matched
  // against the draft rather than the saved links so an offer taken stops
  // being offered.
  const pinnable = urlsIn(point).filter((u) => !draftLinks.some((l) => l.url === u))
  const day = meetingDayLabel(meetingDate, null)
  // Which day the announcement will be about, and whether these people have
  // heard about that day already — read from the field being edited, so the
  // line under the button keeps up as the date is picked. The email is written
  // from the same two facts, server-side, where they cannot be stale.
  const announceDay = date || ''
  const draftDay = meetingDayLabel(date || null, null)
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
      const savedLinks = withLinkDraft(draftLinks, linkDraft)
      await saveDayMeetingDetails(dayId, {
        meetingPointId: elsewhere ? null : pointId || null,
        meetsElsewhere: elsewhere,
        meetingPoint: point,
        meetingTime: time,
        links: savedLinks,
        attachments: draftFiles,
      })
      setDraftLinks(savedLinks); setLinkDraft('')

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

  // Asked for, never automatic: most typed mornings are one-offs — the lay-by
  // on the way, the morning we start at the shop — and a library that filled
  // itself from every one of them would be a picker nobody could read.
  //
  // Opened prefilled with a guess rather than filed on the guess: the first
  // line is usually the name, but the person who typed it is the one who
  // knows what the place is called and which region it serves.
  function openFiling() {
    const text = point.trim()
    setError(null)
    setFileDraft({
      name: (text.split('\n')[0].replace(/https?:\/\/\S+/gi, '').trim() || '').slice(0, 160),
      directions: text,
      // A pasted "lat, lng" is the pin itself, so it goes where the pin goes.
      coords: text.match(/-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/)?.[0]?.replace(/\s+/g, '') ?? '',
      venueId: undefined,
      makeSiteUsual: false,
    })
    if (!fileOpts) {
      dayMeetingPointFilingOptions(dayId)
        .then(setFileOpts)
        .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load venues'))
    }
  }

  async function fileToLibrary() {
    if (!fileDraft) return
    setFiling(true); setError(null)
    try {
      const res = await fileDayMeetingPoint(dayId, {
        name: fileDraft.name,
        directions: fileDraft.directions,
        coords: fileDraft.coords,
        venueId: (fileDraft.venueId ?? fileOpts?.venueId) || null,
        makeSiteUsual: Boolean(fileOpts?.site) && fileDraft.makeSiteUsual,
      })
      if ('error' in res) { setError(res.error); return }
      setFiledPoints((prev) => [...prev, res])
      setPointId(res.id === siteMeetup?.id ? '' : res.id)
      setPoint('')
      setFileDraft(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t file')
    } finally {
      setFiling(false)
    }
  }

  function discard() {
    setPoint(meetingPoint ?? ''); setPointId(savedPick); setTime(meetingTime ?? '')
    setDraftLinks(links)
    setLinkDraft('')
    setDraftFiles(files.map(({ path, filename }) => ({ path, filename })))
    setFileDraft(null)
    setError(null); setEditing(false)
  }

  const fields = (
    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-3">
      <div className="flex justify-end">
        <CloseButton onClick={discard} disabled={busy} label="Cancel" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {/* The schedule already decided which day this is — it is the Nth
            date the course runs. Offering a date field here would be a second
            answer, and the two would disagree the moment a course moved. */}
        <p className="sm:col-span-2 text-[11px] uppercase tracking-wide text-zinc-500">
          {draftDay ?? 'This day'}
        </p>
        {/* Which meetup, before the words about it — the place is the answer
            most mornings, and the box under it is for what the place does not
            say. Left alone it is the canyon's usual, named, because an unset
            picker and a picker set to the usual look identical otherwise. The
            usual is offered once: under its own name as well, it was a second
            option that saved the same place a second way. */}
        {(siteMeetup || pickable.length > 0) && (
          <label className="block sm:col-span-2">
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
              Meet at
              {editPlaceHref && !pointId && siteMeetup && (
                <a href={editPlaceHref} className="normal-case tracking-normal text-zinc-500 hover:text-white transition-colors">
                  Edit {siteMeetup.name}
                </a>
              )}
            </span>
            <select
              value={pointId}
              onChange={(e) => setPointId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              <option value="">{siteMeetup ? `${siteMeetup.name} (usual)` : 'Somewhere else — write it below'}</option>
              {pickable.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {siteMeetup && <option value={ELSEWHERE}>Somewhere else — write it below</option>}
            </select>
          </label>
        )}
        {/* Wide, and it grows with what you type. A meeting point is usually
            four words and sometimes a paragraph — where to park, which gate,
            what the water is doing — and a one-line box that scrolls what you
            wrote out of sight is no way to write the second kind. */}
        <label className="block sm:col-span-2">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">{wordsArePlace ? 'Where' : 'Note for this morning'}</span>
          <textarea
            autoFocus
            ref={pointRef}
            rows={2}
            value={point}
            onChange={(e) => setPoint(e.target.value)}
            placeholder={wordsArePlace ? 'lower lot, by the big cedar' : 'gate code, who’s driving, carpool from here'}
            className="w-full min-h-[4.5rem] resize-y bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 leading-relaxed focus:outline-none focus:border-zinc-500"
          />
        </label>
        {canFileToLibrary && wordsArePlace && point.trim() && !fileDraft && (
          <div className="sm:col-span-2 -mt-1 flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              disabled={busy}
              onClick={openFiling}
              className="text-zinc-500 hover:text-zinc-200 underline-offset-2 hover:underline transition-colors disabled:opacity-40"
            >
              Save to meeting points
            </button>
            <InfoHint text="Files these words as a meeting point other courses can pick, and points this day at it." />
          </div>
        )}
        {/* Nested in the day's form rather than a dialog over it: what is
            being filed is the box just above, and covering it would hide the
            words being turned into a meetup. */}
        {fileDraft && (
          <div className="sm:col-span-2 p-3 rounded border border-zinc-700 bg-zinc-950/60 space-y-2">
            <span className="block text-[11px] uppercase tracking-wide text-zinc-500">File as a meeting point</span>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Name</span>
                <input
                  autoFocus
                  value={fileDraft.name}
                  onChange={(e) => setFileDraft({ ...fileDraft, name: e.target.value })}
                  placeholder="Hanawi lower lot"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Venue</span>
                <select
                  value={fileDraft.venueId ?? fileOpts?.venueId ?? ''}
                  onChange={(e) => setFileDraft({ ...fileDraft, venueId: e.target.value })}
                  disabled={!fileOpts}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-40"
                >
                  <option value="">{fileOpts ? 'No venue' : 'Loading…'}</option>
                  {fileOpts?.venues.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Directions</span>
                <textarea
                  rows={3}
                  value={fileDraft.directions}
                  onChange={(e) => setFileDraft({ ...fileDraft, directions: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y leading-relaxed"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Coordinates</span>
                <input
                  value={fileDraft.coords}
                  onChange={(e) => setFileDraft({ ...fileDraft, coords: e.target.value })}
                  placeholder="20.7984,-156.3319"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                />
              </label>
            </div>
            {fileOpts?.site && (
              <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fileDraft.makeSiteUsual}
                  onChange={(e) => setFileDraft({ ...fileDraft, makeSiteUsual: e.target.checked })}
                  className="accent-pr-red w-3 h-3"
                />
                Make it {fileOpts.site.name}’s usual meetup
                <InfoHint
                  text={fileOpts.site.hasUsual
                    ? `Every course at ${fileOpts.site.name} would meet here unless a day says otherwise, replacing the meetup it uses now.`
                    : `Every course at ${fileOpts.site.name} would meet here unless a day says otherwise.`}
                />
              </label>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fileToLibrary}
                disabled={filing || !fileDraft.name.trim()}
                className="px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors disabled:opacity-40"
              >
                {filing ? 'Filing…' : 'File'}
              </button>
              <button
                type="button"
                onClick={() => setFileDraft(null)}
                disabled={filing}
                className="px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {pinnable.length > 0 && (
          <div className="sm:col-span-2 -mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span>Add {pinnable.length === 1 ? 'it' : 'them'} as a pin too?</span>
            {pinnable.map((u) => (
              <button
                key={u}
                type="button"
                disabled={busy}
                onClick={() => setDraftLinks((prev) => [...prev, { url: u, label: '' }])}
                title={u}
                className="inline-flex items-center gap-1 max-w-full rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-teal-300 hover:border-teal-400 hover:text-teal-100 transition-colors disabled:opacity-40"
              >
                <span aria-hidden className="shrink-0">+</span>
                <span className="truncate">{shortUrl(u)}</span>
              </button>
            ))}
          </div>
        )}
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
        linkDraft={linkDraft}
        setLinkDraft={setLinkDraft}
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
  const pins = <ChipRow links={shownLinks} files={files} />

  const readout = isSet ? (
    <div className="space-y-3">
    <dl className="grid sm:grid-cols-2 gap-3">
      {shownPoint && (
        // Spans the row when it runs past a line: a paragraph set in a half
        // width column beside a single time is a column of two-word lines.
        <div className={`px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 ${
          (directions?.length ?? 0) > 80 || directions?.includes('\n') ? 'sm:col-span-2' : ''
        }`}>
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Where</dt>
          {resolved.name && <dd className="text-sm text-zinc-200 mt-0.5">{resolved.name}</dd>}
          {/* Typed over several lines, read back over several lines — and a
              URL typed into the middle of them is followed, not retyped. */}
          {directions && (
            <dd className={`text-sm mt-0.5 whitespace-pre-line ${resolved.name ? 'text-zinc-400' : 'text-zinc-200'}`}>
              <Linkified text={directions} />
            </dd>
          )}
          {/* Plain, to copy into whatever map you use; the pins below are
              the one tap into Google Maps. */}
          {resolved.coords && (
            <dd className="text-[11px] text-zinc-500 font-mono mt-0.5 select-all">{resolved.coords}</dd>
          )}
          {placeWhy && <dd className="text-[11px] text-zinc-600 mt-0.5">{placeWhy}</dd>}
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
      {/* Beside the place rather than instead of it: a note used to replace
          the meetup, so the gate code hid the pin it was about. */}
      {resolved.note && (
        <div className="sm:col-span-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Note</dt>
          <dd className="text-sm text-zinc-200 mt-0.5 whitespace-pre-line">
            <Linkified text={resolved.note} />
          </dd>
        </div>
      )}
    </dl>
    {pins}
    </div>
  ) : (
    canEdit && (
      <p className="text-xs text-zinc-600">Not set for this day.</p>
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
              and sat at a different spot depending on how much was above it.

              There was a "Tell the course" beside it, for details filled in on
              the admin screen or saved here without telling anyone. It opened
              this same box with the same tick already on, so the two buttons
              were one button drawn twice — and two ways in invite the question
              of what the other one does. Telling them is the tick inside, and
              it is on every time this opens: a plan nobody has been told about
              is what this block exists to prevent, so the quiet save stays the
              one you have to ask for. */}
          <button
            onClick={() => { setResult(null); setTell(true); setEditing(true) }}
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
          {result && <span className="text-[11px] text-zinc-500">{result}</span>}
          {error && <span className="text-[11px] text-pr-red">{error}</span>}
        </div>
      )}
    </div>
  )
}
