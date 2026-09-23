'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { staffingData, quoteData, billingData, booksData } from './quick-actions'
import { setInstanceStatus, setInstanceOwner } from './actions'
import StaffingPanel from './StaffingPanel'
import QuoteQuickSend from './QuoteQuickSend'
import BooksQuickClose from './BooksQuickClose'
import BillingSection from './BillingSection'
import { COURSE_STATUSES, COURSE_STATUS_STYLES, COURSE_STATUS_MEANING } from '@/lib/course-status'
import {
  moneyPipeline, slotsToStaff,
  type Step, type StepKey, type StepPanel,
  type CourseExtras, type CoursePhase, type MoneyStop,
} from '@/lib/course-readiness'
import type { StaffingPanelData } from '@/lib/staffing-panel'
import type { BillingPanelData } from '@/lib/billing-handoff'
import type { QuoteQuickData, BooksQuickData } from './quick-actions'
import OwnerPill from '@/components/OwnerPill'
import { type CourseOwner } from '@/lib/course-owner'

// The list's quick actions: where a course has got to, and the things you can
// settle from here without opening it.
//
// The list was a list of names. Knowing which course still had nobody on it
// meant opening each one and waiting for a whole course page to render, then
// coming back — so the answer to "what needs doing this month" cost a dozen
// page loads.
//
// Three shapes, because there are three kinds of fact here and drawing them
// alike would be a lie:
//
//   The money is a pipeline. Seven stops, always all drawn, a rail that fills
//   to how far it has got — so "how far along" is answered by position before
//   any colour is read, and the first unlit stop is by construction the next
//   thing to do.
//
//   The crew is a meter. One box per slot, filled as people are assigned. It
//   is a count against a target, not a sequence, and a bar would imply an
//   order that does not exist.
//
//   The books are a single mark. Our own costs going final is not a stop on
//   the client's pipeline: a course can be paid with a card charge still to
//   land, and the books can close before the client ever pays.
//
// Under all of it, schedule, curriculum and gear on one grey line. Built or
// not, never amber — nobody writes a curriculum from a list, and a loud mark
// on every unbuilt one would drown the money above it.

export type Panel = StepPanel | 'status' | 'owner'

/** Where each step is built, for the marks that only point at it. */
const STEP_SECTION: Record<StepKey, string> = {
  staffing: 'details',
  pricing: 'pricing',
  quote: 'pricing',
  billing: 'pricing',
  books: 'pricing',
  schedule: 'schedule',
  curriculum: 'prep',
  gear: 'prep',
}

// ── The money pipeline ───────────────────────────────────────────────────────

const STOP_W = 76

/** One rule, three ways to read it: fill says whether it happened, the halo
    says it is the live edge, colour says whose move. Nothing unfinished is
    ever filled. */
const STOP_DOT: Record<MoneyStop['state'], string> = {
  done: 'bg-teal-400 border-teal-400',
  skip: 'border-dashed border-zinc-600 bg-zinc-950',
  'next-us': 'border-amber-400 bg-zinc-950 ring-4 ring-amber-400/15',
  block: 'border-amber-400 bg-zinc-950 ring-4 ring-amber-400/15',
  'next-them': 'border-teal-400 bg-zinc-950 ring-4 ring-teal-400/10',
  no: 'bg-rose-400 border-rose-400',
  future: 'border-zinc-700 bg-zinc-950',
}

const STOP_CAP: Record<MoneyStop['state'], string> = {
  done: 'text-teal-300',
  skip: 'text-zinc-600 line-through decoration-zinc-700',
  'next-us': 'text-amber-300 font-semibold',
  block: 'text-amber-300 font-semibold',
  'next-them': 'text-teal-300',
  no: 'text-rose-300',
  future: 'text-zinc-700',
}

function MoneyTrack({
  stops,
  frontier,
  onOpen,
}: {
  stops: MoneyStop[]
  frontier: number
  onOpen: (p: StepPanel) => void
}) {
  // Which stops belong to which of the three things. Without this, "COA" and
  // three separate quote stops are seven unrelated words.
  const groups: { label: string; span: number }[] = []
  for (const s of stops) {
    const last = groups[groups.length - 1]
    if (last && last.label === s.group) last.span += 1
    else groups.push({ label: s.group, span: 1 })
  }

  return (
    <div className="shrink-0">
      <div className="flex" style={{ width: STOP_W * stops.length }}>
        {groups.map((g) => (
          <div key={g.label} style={{ width: STOP_W * g.span }} className="pr-2">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-800 pb-1">
              {g.label}
            </span>
          </div>
        ))}
      </div>

      <div className="relative flex mt-2" style={{ width: STOP_W * stops.length }}>
        {/* The rail, and how far along it the money has got. */}
        <span className="absolute h-0.5 rounded top-[5px] bg-zinc-800" style={{ left: 5, right: STOP_W - 11 }} aria-hidden />
        <span
          className="absolute h-0.5 rounded top-[5px] bg-teal-400/30"
          style={{ left: 5, width: frontier < 0 ? 0 : frontier * STOP_W }}
          aria-hidden
        />
        {stops.map((s) => {
          const live = s.state === 'next-us' || s.state === 'block'
          const clickable = Boolean(s.panel) && (live || s.state === 'done' || s.state === 'next-them')
          const caption = s.state === 'block' ? s.blockedBy : live || s.state === 'next-them' ? s.todo : s.label
          const title =
            s.state === 'skip' ? `${s.label} — skipped on this course, and it never has to happen`
            : s.state === 'done' ? `${s.label} — done`
            : s.state === 'block' ? `${s.say}, but the course has no contact to bill — add one in Details`
            : s.say
          const body = (
            <>
              <span className={`relative w-3 h-3 rounded-full border-2 ${STOP_DOT[s.state]}`}>
                {s.state === 'block' && (
                  <span className="absolute left-1/2 top-1/2 w-2.5 h-0.5 rounded bg-amber-400 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
                )}
              </span>
              <span className={`text-[10.5px] whitespace-nowrap ${STOP_CAP[s.state]}`}>{caption}</span>
            </>
          )
          return clickable ? (
            <button
              key={s.key}
              type="button"
              title={title}
              onClick={() => onOpen(s.panel as StepPanel)}
              style={{ width: STOP_W }}
              className="relative flex flex-col items-start gap-1.5 text-left group/stop"
            >
              {body}
            </button>
          ) : (
            <span key={s.key} title={title} style={{ width: STOP_W }} className="relative flex flex-col items-start gap-1.5">
              {body}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── The crew meter ───────────────────────────────────────────────────────────

function CrewMeter({
  slots,
  crew,
  awaiting,
  onOpen,
}: {
  slots: number | null | undefined
  crew: { role: string }[]
  awaiting: number
  onOpen: () => void
}) {
  // Boxes are people, so a fractional slot count rounds up to one: a course
  // planned for 1.5 instructors still needs two names.
  const wanted = slotsToStaff(slots)
  const lead = crew.some((c) => c.role === 'lead')
  const full = crew.length >= wanted && lead
  // Lead first, so the L is always the leftmost box and the meter reads the
  // same way down a column. The boxes are slots, not particular people, so
  // nothing is lost by ordering them.
  const filled = [...crew].sort((a, b) => Number(b.role === 'lead') - Number(a.role === 'lead'))

  return (
    <div className="shrink-0">
      <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-800 pb-1">
        Crew
      </span>
      <button type="button" onClick={onOpen} title="Opens staffing here" className="flex items-center gap-1 mt-2">
        {Array.from({ length: wanted }, (_, i) => {
          const person = filled[i]
          return (
            <span
              key={i}
              title={person ? (person.role === 'lead' ? 'Lead instructor' : 'Assist') : 'Open slot — nobody assigned'}
              className={`w-4 h-4 rounded-[3px] border grid place-items-center ${
                person
                  ? 'bg-teal-400 border-teal-400'
                  : full
                    ? 'border-zinc-700 bg-zinc-800'
                    : 'border-amber-500/60 bg-amber-500/10'
              }`}
            >
              {/* The lead's slot says so, because a mark that only means
                  "this one is different" still leaves you to remember how.
                  Only the lead is lettered: an A in every other box would
                  turn a thing you count into a thing you read. */}
              {person?.role === 'lead' && (
                <span className="text-[9px] font-bold leading-none text-zinc-950">L</span>
              )}
            </span>
          )
        })}
        {crew.length > wanted && (
          <span className="text-[11px] text-teal-300 ml-1">+{crew.length - wanted}</span>
        )}
        <span className={`text-[11px] ml-1.5 ${full ? 'text-zinc-500' : awaiting > 0 ? 'text-teal-300' : 'text-amber-300'}`}>
          {full
            ? `${crew.length} of ${wanted}`
            : crew.length > 0 && !lead
              ? 'no lead'
              : awaiting > 0
                ? `${awaiting} asked`
                : `${crew.length} of ${wanted}`}
        </span>
      </button>
    </div>
  )
}

// ── Students ─────────────────────────────────────────────────────────────────
//
// The count sat on its own at the right of the row, the only bare number on a
// page of shapes, saying the same thing about instructors that the crew meter
// says better. The instructor half is gone; the roster half moved here, beside
// the crew, because both answer "who is on this course".
//
// The join link comes with it. Students reach a course through that token and
// nothing else, so a course with nobody on it and no live link is not waiting
// on students — it is waiting on somebody to open the door. Reported, never
// amber: we cannot see whether the link was actually sent, only that it was
// made, and a mark that nags about something it cannot verify is a mark people
// learn to ignore.
function Students({
  instanceId,
  students,
  link,
}: {
  instanceId: string
  students: { enrolled: number; max: number | null }
  link: CourseExtras['inviteLink']
}) {
  const said = {
    live: { text: 'Link made', cls: 'text-teal-400/80', dot: 'bg-teal-400 border-teal-400' },
    expired: { text: 'Link expired', cls: 'text-zinc-500', dot: 'border-zinc-600 bg-zinc-950' },
    none: { text: 'No link yet', cls: 'text-zinc-600', dot: 'border-zinc-700 bg-zinc-950' },
  }[link]

  return (
    <div className="shrink-0">
      <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-800 pb-1">
        Students
      </span>
      <Link
        href={`/portal/${instanceId}?open=details`}
        prefetch={false}
        title={
          link === 'live' ? 'A join link has been made for this course — open the roster'
          : link === 'expired' ? 'The join link has expired, so nobody can join on it — open the roster'
          : 'No join link has been made, so there is no way to join yet — open the roster'
        }
        className="mt-2 flex items-center gap-2 group/st"
      >
        <span className="text-[11px] text-zinc-400 tabular-nums group-hover/st:text-zinc-200 transition-colors">
          {students.max ? `${students.enrolled} of ${students.max}` : `${students.enrolled} enrolled`}
        </span>
        <span className={`inline-flex items-center gap-1.5 text-[10.5px] ${said.cls}`}>
          <span className={`w-2 h-2 rounded-full border-[1.5px] ${said.dot}`} aria-hidden />
          {said.text}
        </span>
      </Link>
    </div>
  )
}

// ── The books ────────────────────────────────────────────────────────────────

const BOOKS_CLS: Record<string, string> = {
  done: 'border-transparent bg-teal-500/15 text-teal-300 hover:bg-teal-500/25',
  action: 'border-amber-500/70 bg-amber-500/15 text-amber-200 font-semibold hover:bg-amber-500/25',
  waiting: 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
}

function BooksMark({ step, onOpen }: { step: Step; onOpen: () => void }) {
  return (
    <div className="shrink-0">
      <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-800 pb-1">
        Our books
      </span>
      <button
        type="button"
        onClick={onOpen}
        title={
          step.tone === 'done'
            ? 'Costs are final — this course is finished with'
            : step.tone === 'action'
              ? 'Every cost should be in by now. Closing the books is what finishes the course off.'
              : 'A card charge or an expense report may still be coming. Closing now is how one ends up with nowhere to go.'
        }
        className={`mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11.5px] transition-colors ${BOOKS_CLS[step.tone] ?? BOOKS_CLS.waiting}`}
      >
        <span className={`w-2 h-2 rounded-sm border ${step.tone === 'done' ? 'bg-teal-400 border-teal-400' : step.tone === 'action' ? 'border-amber-400' : 'border-zinc-600'}`} />
        {step.detail}
      </button>
    </div>
  )
}

// ── The build line ───────────────────────────────────────────────────────────

function BuildLine({ steps, instanceId }: { steps: Step[]; instanceId: string }) {
  if (steps.length === 0) return null
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      {steps.map((s) => (
        <Link
          key={s.key}
          href={`/portal/${instanceId}?open=${STEP_SECTION[s.key]}`}
          prefetch={false}
          title={`${s.label} — ${s.tone === 'done' ? 'built' : 'nothing yet'}`}
          className={`inline-flex items-center gap-1.5 transition-colors ${
            s.tone === 'done' ? 'text-teal-400/80 hover:text-teal-300' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <span
            aria-hidden
            className={`w-2 h-2 rounded-full border-[1.5px] ${
              s.tone === 'done' ? 'bg-teal-400 border-teal-400' : 'border-zinc-700 bg-zinc-950'
            }`}
          />
          {s.label}
        </Link>
      ))}
    </div>
  )
}

// ── The row ──────────────────────────────────────────────────────────────────

export default function CourseQuickActions({
  instanceId,
  status,
  steps,
  phase,
  estimates,
  extras,
  crew,
  slots,
  owner,
  owners,
  students,
  hasBillingContact,
  /** Changes whenever anything the marks count changes. An open panel came
      from a server call rather than from this page's render, so it cannot
      follow a router refresh on its own — it re-asks when this moves. */
  version,
}: {
  instanceId: string
  status: string
  steps: Step[]
  phase: CoursePhase
  estimates: number
  extras: CourseExtras
  /** The assigned crew and how many the course wants — the meter's whole
      world, and not a thing the step list carries in a countable form. */
  crew: { role: string }[]
  slots: number | null | undefined
  /** Who is running comms on this one, and everyone it could be handed to. */
  owner: CourseOwner | undefined
  owners: CourseOwner[]
  /** How the roster is filling, or null on a course that has no roster. */
  students: { enrolled: number; max: number | null } | null
  hasBillingContact: boolean
  version: string
}) {
  const [open, setOpen] = useState<Panel | null>(null)
  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p))

  const pipe = moneyPipeline({ estimates, hasBillingContact }, extras)
  const books = steps.find((s) => s.key === 'books')
  const build = steps.filter((s) => s.track === 'build')

  return (
    <div className="mt-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="shrink-0">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-800 pb-1">
            Owner
          </span>
          <button
            type="button"
            onClick={() => toggle('owner')}
            title={owner ? `${owner.name} is running comms on this — click to hand it over` : 'Nobody is running comms on this — click to put a name on it'}
            className={`mt-2 block transition-opacity hover:opacity-80 ${open === 'owner' ? 'ring-1 ring-zinc-400 rounded-full' : ''}`}
          >
            <OwnerPill owner={owner ?? null} />
          </button>
        </div>

        <div className="shrink-0">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-800 pb-1">
            Status
          </span>
          <button
            type="button"
            onClick={() => toggle('status')}
            title="Move this course along"
            className={`mt-2 text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wide transition-colors hover:brightness-125 ${
              COURSE_STATUS_STYLES[status] ?? ''
            } ${open === 'status' ? 'ring-1 ring-zinc-400' : ''}`}
          >
            {status}
          </button>
        </div>

        {/* A course that has run is done being staffed. */}
        {phase !== 'over' && (
          <CrewMeter
            slots={slots}
            crew={crew}
            awaiting={extras.invitesSent - extras.invitesAnswered}
            onOpen={() => toggle('staffing')}
          />
        )}

        {phase !== 'over' && students && (
          <Students instanceId={instanceId} students={students} link={extras.inviteLink} />
        )}

        <MoneyTrack stops={pipe.stops} frontier={pipe.frontier} onOpen={(p) => toggle(p)} />

        {books && <BooksMark step={books} onOpen={() => toggle('books')} />}
      </div>

      <BuildLine steps={build} instanceId={instanceId} />

      {open && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          {open === 'owner' ? (
            <OwnerPicker instanceId={instanceId} owner={owner} owners={owners} onDone={() => setOpen(null)} />
          ) : open === 'status' ? (
            <StatusPicker instanceId={instanceId} status={status} onDone={() => setOpen(null)} />
          ) : (
            // Keyed by which panel: switching between them is a different
            // question, not a newer answer to the same one, and the loading
            // state belongs to the panel being opened.
            <LazyPanel key={open} panel={open} instanceId={instanceId} version={version} />
          )}
        </div>
      )}
    </div>
  )
}

// Handing a course over, from the row it is on.
//
// No fetch: the list already knows every admin, because it draws the filter
// row from the same list. Opening this asks the server nothing.
function OwnerPicker({
  instanceId,
  owner,
  owners,
  onDone,
}: {
  instanceId: string
  owner: CourseOwner | undefined
  owners: CourseOwner[]
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const hand = (to: string | null) => {
    if ((owner?.id ?? null) === to) return onDone()
    setError(null)
    start(async () => {
      try {
        await setInstanceOwner(instanceId, to)
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not change the owner')
      }
    })
  }

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2.5">
        Who is running comms on this course — chasing the staffing, the quote, the invoice and the books.
        Not the crew: the crew runs the course, the owner runs the course&apos;s paperwork.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {owners.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={pending}
            onClick={() => hand(o.id)}
            className={`rounded-full transition-opacity disabled:opacity-50 hover:opacity-80 ${
              o.id === owner?.id ? 'ring-1 ring-teal-400' : ''
            }`}
          >
            <OwnerPill owner={o} />
          </button>
        ))}
        {owner && (
          <button
            type="button"
            disabled={pending}
            onClick={() => hand(null)}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50 ml-1"
          >
            Take the name off
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

// Where a status change actually lands, said next to each option. "Cancelled"
// emails everybody assigned; nothing else on this menu leaves the building,
// and the difference is worth knowing before the click rather than after.
function StatusPicker({
  instanceId,
  status,
  onDone,
}: {
  instanceId: string
  status: string
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const move = (next: string) => {
    if (next === status) return onDone()
    setError(null)
    start(async () => {
      try {
        await setInstanceStatus(instanceId, next)
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not change the status')
      }
    })
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {COURSE_STATUSES.map((s) => (
          <button
            key={s}
            disabled={pending}
            onClick={() => move(s)}
            className={`text-left px-3 py-2 rounded border transition-colors disabled:opacity-50 ${
              s === status
                ? `${COURSE_STATUS_STYLES[s]} cursor-default`
                : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/60'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wide">{s}</span>
            {s === status && <span className="ml-2 text-[10px] opacity-70">now</span>}
            <span className="block text-[11px] text-zinc-500 mt-0.5">{COURSE_STATUS_MEANING[s]}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

type PanelData = StaffingPanelData | QuoteQuickData | BillingPanelData | BooksQuickData

// The panel itself, fetched when it is opened rather than rendered with the
// list. What comes back is the course's own data, drawn by the same panels the
// course page draws — one loader and one component each, two doors.
//
// The previous render is kept on screen while a newer one is on its way, so
// assigning somebody doesn't blank the panel you are working in.
function LazyPanel({
  panel,
  instanceId,
  version,
}: {
  panel: StepPanel
  instanceId: string
  version: string
}) {
  const [data, setData] = useState<PanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const loader =
      panel === 'staffing' ? staffingData
      : panel === 'quote' ? quoteData
      : panel === 'books' ? booksData
      : billingData
    loader(instanceId)
      .then((d) => { if (live) { setData(d); setError(null) } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load this') })
    return () => { live = false }
  }, [panel, instanceId, version])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!data) {
    return (
      <div className="space-y-2 animate-pulse" aria-label="Loading">
        <div className="h-8 bg-zinc-800/70 rounded" />
        <div className="h-8 bg-zinc-800/50 rounded w-2/3" />
      </div>
    )
  }
  if (panel === 'staffing') return <StaffingPanel data={data as StaffingPanelData} />
  if (panel === 'quote') return <QuoteQuickSend data={data as QuoteQuickData} />
  if (panel === 'books') return <BooksQuickClose data={data as BooksQuickData} />
  return <BillingSection {...(data as BillingPanelData)} />
}
