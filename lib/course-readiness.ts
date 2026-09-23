import { type createAdminClient } from '@/lib/supabase/admin'
import { billingState, type BillingState } from '@/lib/billing-handoff'
import { type InvoiceStatus } from '@/lib/billing'

// What a course still owes, and which of those things can be done from the
// list without opening the course.
//
// The courses page is where you find out what needs doing; until now it was
// also where you found out you had to click into a course to find out.
//
// One colour rule runs through everything below, so a row can be read without
// being read:
//
//   amber   it is on us, now — and the mark opens the thing that does it.
//           Nothing else is ever amber, so a page of courses is its own
//           to-do list.
//   green   done from our side. Hollow while somebody else has the ball,
//           filled once nothing is owed either way.
//   grey    not started, and nothing is chasing it.

// Two axes, because they answer two questions and one mark has to answer both.
//
// `tone` is the colour: whose move is it. `mark` is the shape: how far along
// is it. They usually agree, and the one place they don't is the whole reason
// they are separate — a course with Harken and a course Harken has already
// invoiced are both "waiting on them" in colour, and are not the same amount
// of done. The shape says so, and it says so in a screenshot and to somebody
// who does not see the difference between two greens.
export type StepMark = 'act' | 'open' | 'half' | 'full' | 'none'

export type StepTone =
  /** Somebody has to do something, and it can be done from here. */
  | 'action'
  /** Done from our side; we are waiting on a client, a biller, an instructor. */
  | 'waiting'
  /** Finished. */
  | 'done'
  /** Not started, and nothing is chasing it. */
  | 'idle'

export type StepKey =
  | 'staffing' | 'pricing' | 'quote' | 'billing' | 'books'
  | 'schedule' | 'curriculum' | 'gear'

export type StepPanel = 'staffing' | 'quote' | 'billing' | 'books'

export type Step = {
  key: StepKey
  label: string
  tone: StepTone
  /** How far along, as a shape. */
  mark: StepMark
  /** What the mark says under its label — the state in two or three words. */
  detail: string
  /** The chain that matters, or the housekeeping under it. */
  track: 'chain' | 'build'
  /** The panel this opens, on the ones that open one. */
  panel?: StepPanel
}

/** The parts of a course's state that aren't already on the list's own query. */
export type CourseExtras = {
  schedule: boolean
  curriculum: boolean
  gear: boolean
  /** Interest invites sent, and how many have come back either way. */
  invitesSent: number
  invitesAnswered: number
  /** Furthest any quote on the course has got. */
  quote: 'none' | 'draft' | 'sent' | 'accepted' | 'declined'
  /** How far the handoff to Harken has got. */
  billing: BillingState
  /** Whether somebody has said our own costs on this course are final. */
  booksClosed: boolean
  /** Whether a usable join link exists. Students reach a course through the
      invite token and nothing else, so a course with no live link is one
      nobody can join — worth reporting even though it is never urgent. */
  inviteLink: 'none' | 'live' | 'expired'
}

export const NO_EXTRAS: CourseExtras = {
  schedule: false,
  curriculum: false,
  gear: false,
  invitesSent: 0,
  invitesAnswered: 0,
  quote: 'none',
  billing: 'not-sent',
  booksClosed: false,
  inviteLink: 'none',
}

/** A course as the step list needs to read it — the list's own row, narrowed. */
export type StepInput = {
  id: string
  status: string
  instructor_slots?: number | null
  /** Assigned crew, with roles, so "nobody leading" reads differently from
      "nobody at all". */
  crew: { role: string }[]
  estimates: number
  /** The course's window. Billing is not a thing you can owe before the first
      day, and after the last one it is nearly the only thing left to owe. */
  starts_at: string | null
  ends_at: string | null
  /** No client, so nobody to invoice. */
  internal?: boolean | null
}

/** How long costs are allowed to keep arriving before anybody is asked to
    close the books. Overridden org-wide — see `loadBooksSettleDays`. */
export const DEFAULT_SETTLE_DAYS = 30

/** How many instructors a course wants. Unset means at least one. Fractional
    on purpose — 1.5 is a lead plus an assistant for part of the course. */
export const slotsWanted = (slots: number | null | undefined) =>
  slots && slots > 0 ? slots : 1

/** The same number as people, which only ever come whole: half a slot still
    takes somebody's name, so 1.5 is two on the roster. Anything counting
    bodies — the meter's boxes, whether staffing is done — asks for this;
    anything counting money uses the fraction as written. */
export const slotsToStaff = (slots: number | null | undefined) =>
  Math.ceil(slotsWanted(slots))

// A cancelled course owes nobody anything, and saying what it still needs is
// worse than saying nothing. Everything else has at least one step left —
// a course that has already run can still be unbilled.
export const showsSteps = (status: string) => status !== 'cancelled'

/** Where a course is in its own life. The row reads differently at each point:
    before it runs, everything is still to do; while it runs, the money joins
    the queue; once it is over, the money is all that is left. */
export type CoursePhase = 'ahead' | 'running' | 'over'

export function coursePhase(
  inst: { status: string; starts_at: string | null; ends_at: string | null },
  today: string
): CoursePhase {
  if (inst.status === 'completed') return 'over'
  if (inst.ends_at && inst.ends_at < today) return 'over'
  if (inst.starts_at && inst.starts_at <= today) return 'running'
  return 'ahead'
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Billing is the one step with a clock on it. Nothing is owed to Harken
// before the course starts — quoting one in March for August does not mean
// August's invoice is late — so it stays away until the first day, and then
// never leaves until the money has landed.
//
// Never on an internal course: a CE day has no client, so there is nobody to
// invoice. A course already handed over shows it whatever else is true,
// because a request that exists has a state worth seeing.
export const billingIsDue = (
  inst: { starts_at: string | null; ends_at: string | null; status: string; internal?: boolean | null },
  today: string,
  billing: BillingState
) => billing !== 'not-sent' || (!inst.internal && coursePhase(inst, today) !== 'ahead')

/** The shape a step wears when it hasn't asked for a particular one. */
export const markForTone = (tone: StepTone): StepMark =>
  tone === 'action' ? 'act' : tone === 'waiting' ? 'open' : tone === 'done' ? 'full' : 'none'

type Drafted = Omit<Step, 'mark'> & { mark?: StepMark }

const shaped = (steps: (Drafted | null)[]): Step[] =>
  steps.filter((s): s is Drafted => s !== null).map((s) => ({ ...s, mark: s.mark ?? markForTone(s.tone) }))

/** Our own side of the money, which is not the client's side.
 *
 *  A course can be paid with a card charge still to land next month, and the
 *  books can close before the client ever pays — so this is never a stop on
 *  the client's pipeline. It stays quiet while costs are still arriving,
 *  because closing early is how a late charge ends up with nowhere to go.
 */
function booksStep(inst: StepInput, x: CourseExtras, today: string, settleDays: number): Drafted {
  const base = { key: 'books' as const, label: 'Books', track: 'chain' as const, panel: 'books' as const }
  if (x.booksClosed) return { ...base, tone: 'done', detail: 'Closed' }
  const stillLanding = Boolean(inst.ends_at) && addDays(inst.ends_at as string, settleDays) > today
  return stillLanding
    ? { ...base, tone: 'waiting', detail: 'Costs still landing' }
    : { ...base, tone: 'action', detail: 'Close the books' }
}

function billingStep(inst: StepInput, x: CourseExtras, today: string): Drafted | null {
  if (!billingIsDue(inst, today, x.billing)) return null
  const base = { key: 'billing' as const, label: 'Billing', track: 'chain' as const, panel: 'billing' as const }
  if (x.billing === 'not-sent') {
    // A course nobody ever priced here was almost certainly agreed and
    // invoiced somewhere else. Worth a grey word, not a red flag.
    return inst.estimates > 0 || x.quote !== 'none'
      ? { ...base, tone: 'action', detail: 'Send to Harken' }
      : { ...base, tone: 'idle', detail: 'Not priced' }
  }
  // Three stops, two of them somebody else's: we send it, Kallie raises the
  // invoice, Kallie marks it paid. The middle two are both a wait on Harken —
  // same colour — and a half-filled mark is what says the second happened.
  return {
    ...base,
    ...({
      'with-harken': { tone: 'waiting' as const, detail: 'With Harken' },
      invoiced: { tone: 'waiting' as const, mark: 'half' as const, detail: 'Invoiced' },
      paid: { tone: 'done' as const, detail: 'Paid' },
    }[x.billing]),
  }
}

export function courseSteps(
  inst: StepInput,
  x: CourseExtras,
  today: string,
  settleDays: number = DEFAULT_SETTLE_DAYS
): Step[] {
  const billing = billingStep(inst, x, today)
  const books = booksStep(inst, x, today, settleDays)

  // A course that has run is done being built, and done being staffed.
  // Whether its curriculum was ever written down is history; whether it was
  // ever invoiced, and whether our own costs are final, are not.
  if (coursePhase(inst, today) === 'over') return shaped([billing, books])

  const staffed = inst.crew.length
  const wanted = slotsToStaff(inst.instructor_slots)
  const hasLead = inst.crew.some((c) => c.role === 'lead')
  const staffingDone = staffed >= wanted && hasLead

  // Somebody has been asked and hasn't answered. Still a gap, but a gap with
  // something already in flight — which is the difference between "go and do
  // something" and "wait".
  const awaiting = x.invitesSent - x.invitesAnswered

  const staffing: Drafted = {
    key: 'staffing',
    label: 'Staffing',
    track: 'chain',
    panel: 'staffing',
    // "3 of 1" is what counting against an unset slot count looks like, and it
    // reads as an error rather than as a well-staffed course. A course that
    // never said how many it wanted just says how many it has.
    ...(staffingDone
      ? { tone: 'done' as const, detail: inst.instructor_slots ? `${staffed} of ${wanted}` : `${staffed} staffed` }
      : staffed === 0
        ? awaiting > 0
          ? { tone: 'waiting' as const, detail: `${awaiting} asked` }
          : { tone: 'action' as const, detail: 'Nobody yet' }
        : !hasLead
          ? { tone: 'action' as const, detail: 'No lead' }
          : awaiting > 0
            ? { tone: 'waiting' as const, detail: `${staffed} of ${wanted}, ${awaiting} out` }
            : { tone: 'action' as const, detail: `${staffed} of ${wanted}` }),
  }

  const pricing: Drafted = {
    key: 'pricing',
    label: 'Pricing',
    track: 'chain',
    tone: inst.estimates > 0 ? 'done' : 'idle',
    detail: inst.estimates > 0 ? `${inst.estimates} COA${inst.estimates === 1 ? '' : 's'}` : 'No COA',
  }

  // A draft quote is the one piece of paper on this list that is finished and
  // sitting still — the whole reason for a send button out here.
  const quote: Drafted = {
    key: 'quote',
    label: 'Quote',
    track: 'chain',
    ...({
      none: { tone: 'idle' as const, detail: 'Not drafted' },
      draft: { tone: 'action' as const, detail: 'Ready to send', panel: 'quote' as const },
      sent: { tone: 'waiting' as const, detail: 'With client' },
      accepted: { tone: 'done' as const, detail: 'Accepted' },
      declined: { tone: 'action' as const, detail: 'Declined — re-quote', panel: 'quote' as const },
    }[x.quote]),
  }

  return shaped([
    staffing,
    pricing,
    quote,
    billing,
    { key: 'schedule',   label: 'Schedule',   track: 'build', tone: x.schedule   ? 'done' : 'idle', detail: x.schedule   ? 'Built' : 'None yet' },
    { key: 'curriculum', label: 'Curriculum', track: 'build', tone: x.curriculum ? 'done' : 'idle', detail: x.curriculum ? 'Built' : 'None yet' },
    { key: 'gear',       label: 'Gear',       track: 'build', tone: x.gear       ? 'done' : 'idle', detail: x.gear       ? 'Built' : 'None yet' },
  ])
}

/** Nothing is owed on it any more, so it is history rather than work.
 *
 *  Deliberately not a date. A course from two years ago that was never billed
 *  is still work; one that ran last month and was paid is not. Both finishes
 *  have to land — the client's money in, and our own costs closed — or a
 *  course leaves the list with half its P&L still arriving.
 */
export const courseSettled = (
  inst: StepInput,
  x: CourseExtras,
  today: string,
  settleDays: number = DEFAULT_SETTLE_DAYS
) =>
  coursePhase(inst, today) === 'over' &&
  !courseSteps(inst, x, today, settleDays).some((s) => s.tone === 'action' || s.tone === 'waiting')

// ── The money, as one thing with seven stops ─────────────────────────────────
//
// Every stop the money passes through, always drawn, in order. A rail fills to
// the furthest stop reached, so *how far along* is answered by position before
// any colour is read — and the first unlit stop is, by construction, the next
// thing that has to happen. Who owns that stop is what decides whether it is
// amber (ours) or hollow (theirs); no second rule, nothing to keep in sync.
//
// The three groups exist because "COA" and three separate quote stops are
// otherwise seven unrelated words. The COA is our own costing and the client
// never sees it; the quote is one document with three lives.

export type MoneyStopKey = 'coa' | 'draft' | 'sent' | 'agreed' | 'billed' | 'invoiced' | 'paid'

export type MoneyStopState =
  /** It happened. */
  | 'done'
  /** Passed over, and it never has to happen — billed against a PO, say. */
  | 'skip'
  /** The live edge, and it is ours. */
  | 'next-us'
  /** The live edge, ours, and it cannot be done yet. */
  | 'block'
  /** The live edge, and somebody else has it. */
  | 'next-them'
  /** Refused. */
  | 'no'
  | 'future'

export type MoneyStop = {
  key: MoneyStopKey
  label: string
  group: 'Our costing' | 'The quote' | 'The invoice'
  owner: 'us' | 'them'
  panel?: StepPanel
  /** What the caption says when this stop is the live edge. A stop that has
      not happened must not read as though it has: an unlit "Sent" is an
      instruction, not a past tense. */
  todo: string
  /** The long form, for the title attribute. */
  say: string
  state: MoneyStopState
  /** Why it cannot be done, on a blocked stop — and the caption, there. */
  blockedBy?: string
}

const STOPS: Omit<MoneyStop, 'state'>[] = [
  { key: 'coa',      group: 'Our costing', label: 'COA',      owner: 'us',   todo: 'Price it',   say: 'Build a COA — our own costing, never seen by the client' },
  { key: 'draft',    group: 'The quote',   label: 'Drafted',  owner: 'us',   todo: 'Draft it',   say: 'Draw a quote up from the COA', panel: 'quote' },
  { key: 'sent',     group: 'The quote',   label: 'Sent',     owner: 'us',   todo: 'Send it',    say: 'Email the quote to the client', panel: 'quote' },
  { key: 'agreed',   group: 'The quote',   label: 'Accepted', owner: 'them', todo: 'Their call', say: 'The client has it and has not answered' },
  { key: 'billed',   group: 'The invoice', label: 'Billed',   owner: 'us',   todo: 'Bill it',    say: 'Hand the course to Harken', panel: 'billing' },
  { key: 'invoiced', group: 'The invoice', label: 'Invoiced', owner: 'them', todo: 'Harken’s',   say: 'Harken raises the invoice', panel: 'billing' },
  { key: 'paid',     group: 'The invoice', label: 'Paid',     owner: 'them', todo: 'Unpaid',     say: 'The money has not landed yet', panel: 'billing' },
]

export type MoneyPipeline = {
  stops: MoneyStop[]
  /** Index of the furthest stop reached, or -1 if nothing has happened. */
  frontier: number
  /** The one stop that is somebody's move, or null once it is settled. */
  next: MoneyStop | null
  settled: boolean
}

export function moneyPipeline(
  inst: Pick<StepInput, 'estimates'> & { hasBillingContact?: boolean },
  x: CourseExtras
): MoneyPipeline {
  const reached: Record<MoneyStopKey, boolean> = {
    coa: inst.estimates > 0,
    draft: x.quote !== 'none',
    sent: ['sent', 'accepted', 'declined'].includes(x.quote),
    agreed: x.quote === 'accepted',
    billed: x.billing !== 'not-sent',
    invoiced: x.billing === 'invoiced' || x.billing === 'paid',
    paid: x.billing === 'paid',
  }
  let frontier = -1
  STOPS.forEach((s, i) => { if (reached[s.key]) frontier = i })

  const refused = x.quote === 'declined'
  const noContact = inst.hasBillingContact === false

  const stops: MoneyStop[] = STOPS.map((s, i) => {
    let state: MoneyStopState
    let blockedBy: string | undefined
    let todo = s.todo
    if (refused && s.key === 'agreed') state = 'no'
    // A refusal rewinds the quote rather than ending it: the drafting stop
    // becomes the live edge again even though a quote was drafted once, and
    // it says re-quote rather than draft. Checked before `reached`, which
    // would otherwise call it done and leave the pipeline with nothing next.
    else if (refused && s.key === 'draft') { state = 'next-us'; todo = 'Re-quote' }
    else if (reached[s.key]) state = 'done'
    else if (i < frontier) state = 'skip'
    else if (i === frontier + 1) {
      if (s.owner !== 'us') state = 'next-them'
      else if (noContact && (s.key === 'sent' || s.key === 'billed')) {
        // Ours, but the course is missing what the tool needs. Saying so on
        // the stop beats saying it in a panel you had to open first.
        state = 'block'
        blockedBy = 'No contact'
      } else state = 'next-us'
    } else state = 'future'
    return { ...s, state, blockedBy, todo }
  })

  const next =
    stops.find((s) => s.state === 'next-us' || s.state === 'block') ??
    stops.find((s) => s.state === 'next-them') ??
    null

  return { stops, frontier, next, settled: frontier === STOPS.length - 1 }
}

// ── Loading ─────────────────────────────────────────────────────────────────

/** How long costs may keep arriving before the books are chased, org-wide. */
export async function loadBooksSettleDays(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { data } = await admin
    .from('org_settings')
    .select('value')
    .eq('key', 'books_settle_days')
    .maybeSingle()
  const n = Number(data?.value)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTLE_DAYS
}

/** The state the list's own query doesn't carry.
 *
 *  Split in two on purpose. The build track and the interest invites are only
 *  ever drawn for courses still ahead of us, and their tables are the big ones
 *  — a row per module, per gear entry, per person asked — so those are
 *  narrowed to exactly the courses that will draw them. Quotes, invoice
 *  requests and actuals are read whole: there is about one of each per course,
 *  every course on the page needs them (a course that ran last month is where
 *  an unsent invoice hides), and an `in` list of every id on a long page is a
 *  URL long enough to be refused.
 */
export async function loadCourseExtras(
  admin: ReturnType<typeof createAdminClient>,
  /** Courses drawn with the full chain and the build track under it. */
  chainIds: string[],
  /** Every course on the page, those included. */
  allIds: string[]
): Promise<Record<string, CourseExtras>> {
  if (allIds.length === 0) return {}

  const none = { data: [] as { instance_id: string }[] }
  const forChain = <T>(q: T) => (chainIds.length > 0 ? q : Promise.resolve(none))

  const [{ data: sched }, { data: mods }, { data: gear }, { data: invites }, { data: quotes }, { data: invoices }, { data: actuals }] =
    await Promise.all([
      forChain(admin.from('course_schedules').select('instance_id').in('instance_id', chainIds)),
      forChain(admin.from('course_modules').select('instance_id').in('instance_id', chainIds)),
      forChain(admin.from('gear_lists').select('instance_id').in('instance_id', chainIds)),
      forChain(admin.from('course_interest_invites').select('instance_id, responded_at').in('instance_id', chainIds)),
      admin.from('course_quotes').select('instance_id, status, archived_at'),
      admin.from('invoice_requests').select('instance_id, status'),
      admin.from('course_actuals').select('instance_id, closed_at'),
    ])

  const out: Record<string, CourseExtras> = {}
  for (const id of allIds) out[id] = { ...NO_EXTRAS }

  for (const r of sched ?? []) if (out[r.instance_id]) out[r.instance_id].schedule = true
  for (const r of mods  ?? []) if (out[r.instance_id]) out[r.instance_id].curriculum = true
  for (const r of gear  ?? []) if (out[r.instance_id]) out[r.instance_id].gear = true

  for (const r of (invites ?? []) as { instance_id: string; responded_at: string | null }[]) {
    const e = out[r.instance_id]
    if (!e) continue
    e.invitesSent += 1
    if (r.responded_at) e.invitesAnswered += 1
  }

  // Furthest-along wins: a course with an accepted quote and two old drafts
  // is not a course that owes anybody a quote.
  const rank = { none: 0, declined: 1, draft: 2, sent: 3, accepted: 4 } as const
  for (const r of (quotes ?? []) as { instance_id: string; status: string; archived_at: string | null }[]) {
    const e = out[r.instance_id]
    if (!e) continue
    // A quote whose every COA was set aside is not a live draft.
    if (r.status === 'draft' && r.archived_at) continue
    const s = r.status as CourseExtras['quote']
    if (rank[s] !== undefined && rank[s] > rank[e.quote]) e.quote = s
  }

  // Read by the same function the pricing page reads, so "with Harken" means
  // the same thing in both places.
  const requestsByCourse: Record<string, { status: InvoiceStatus }[]> = {}
  for (const r of (invoices ?? []) as { instance_id: string; status: string }[]) {
    (requestsByCourse[r.instance_id] ??= []).push({ status: r.status as InvoiceStatus })
  }
  for (const [id, rows] of Object.entries(requestsByCourse)) {
    if (out[id]) out[id].billing = billingState(rows)
  }

  // The same `closed_at` the course's own Actuals panel sets, read rather than
  // redefined — there is one answer to "are the books shut on this course".
  for (const r of (actuals ?? []) as { instance_id: string; closed_at: string | null }[]) {
    if (out[r.instance_id]) out[r.instance_id].booksClosed = Boolean(r.closed_at)
  }

  return out
}
