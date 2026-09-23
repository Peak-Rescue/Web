import { describe, it, expect } from 'vitest'
import {
  courseSteps, showsSteps, coursePhase, markForTone, courseSettled, moneyPipeline, NO_EXTRAS,
  type CourseExtras, type StepInput, type StepTone,
} from '@/lib/course-readiness'
import { NEEDS, matchesNeeds } from '@/lib/course-needs'

const TODAY = '2026-06-15'

const inst = (over: Partial<StepInput> = {}): StepInput => ({
  id: 'c1',
  status: 'confirmed',
  instructor_slots: 2,
  crew: [],
  estimates: 0,
  starts_at: null,
  ends_at: null,
  ...over,
})

/** A course that ran in May — long enough ago that its books are chased. */
const ran = (over: Partial<StepInput> = {}) =>
  inst({ estimates: 1, starts_at: '2026-05-01', ends_at: '2026-05-05', ...over })

const extras = (over: Partial<CourseExtras> = {}): CourseExtras => ({ ...NO_EXTRAS, ...over })

const step = (i: StepInput, x: CourseExtras, key: string, today = TODAY) =>
  courseSteps(i, x, today).find((s) => s.key === key)

const tone = (i: StepInput, x: CourseExtras, key: string, today = TODAY): StepTone | undefined =>
  step(i, x, key, today)?.tone

// The whole point of the row is that it reads without being read: amber is
// the only colour that means "go and do something", so a page of courses
// shows its own to-do list.
describe('staffing', () => {
  it('shouts when nobody is on it', () => {
    const s = step(inst(), extras(), 'staffing')!
    expect(s.tone).toBe('action')
    expect(s.detail).toBe('Nobody yet')
  })

  // Asked and not yet answered is not a thing to go and do. It stops being
  // amber so the courses nobody has touched still stand out.
  it('stops shouting once people have been asked', () => {
    const s = step(inst(), extras({ invitesSent: 5, invitesAnswered: 2 }), 'staffing')!
    expect(s.tone).toBe('waiting')
    expect(s.detail).toBe('3 asked')
  })

  it('shouts again once every invite has come back', () => {
    expect(tone(inst(), extras({ invitesSent: 5, invitesAnswered: 5 }), 'staffing')).toBe('action')
  })

  it('shouts when the crew is short and nothing is out', () => {
    const s = step(inst({ crew: [{ role: 'lead' }] }), extras(), 'staffing')!
    expect(s.tone).toBe('action')
    expect(s.detail).toBe('1 of 2')
  })

  // A full crew with nobody leading it is the failure that reads as success
  // if you only count heads.
  it('shouts at a full crew with no lead', () => {
    const s = step(inst({ crew: [{ role: 'assist' }, { role: 'assist' }] }), extras(), 'staffing')!
    expect(s.tone).toBe('action')
    expect(s.detail).toBe('No lead')
  })

  it('settles once the crew is full and led', () => {
    const s = step(inst({ crew: [{ role: 'lead' }, { role: 'assist' }] }), extras(), 'staffing')!
    expect(s.tone).toBe('done')
    expect(s.detail).toBe('2 of 2')
  })

  it('wants one instructor when no slot count was set', () => {
    expect(tone(inst({ instructor_slots: null, crew: [{ role: 'lead' }] }), extras(), 'staffing')).toBe('done')
  })

  // Counting against a slot count nobody set reads as an error — "3 of 1"
  // looks like over-staffing rather than a course that never asked for a
  // number. Over-staffing against a real count still shows, because it is
  // real: "5 of 3" is something to go and look at.
  it('just counts heads when no slot count was set', () => {
    const crew3 = [{ role: 'lead' }, { role: 'assist' }, { role: 'assist' }]
    expect(step(inst({ instructor_slots: null, crew: crew3 }), extras(), 'staffing')!.detail).toBe('3 staffed')
    expect(step(inst({ instructor_slots: 3, crew: [...crew3, { role: 'assist' }, { role: 'assist' }] }), extras(), 'staffing')!.detail)
      .toBe('5 of 3')
  })

  // 1.5 slots is a lead plus an assistant for part of the course — a real
  // plan, and one that still needs two names. The fraction is the estimator's
  // business; staffing counts people.
  it('rounds a fractional slot count up to whole people', () => {
    const s = (crew: { role: string }[]) => step(inst({ instructor_slots: 1.5, crew }), extras(), 'staffing')!
    expect(s([{ role: 'lead' }]).detail).toBe('1 of 2')
    expect(s([{ role: 'lead' }]).tone).toBe('action')
    expect(s([{ role: 'lead' }, { role: 'assist' }]).detail).toBe('2 of 2')
    expect(s([{ role: 'lead' }, { role: 'assist' }]).tone).toBe('done')
  })

  it('always opens the staffing panel, full or not', () => {
    expect(step(inst(), extras(), 'staffing')!.panel).toBe('staffing')
    expect(step(inst({ crew: [{ role: 'lead' }, { role: 'assist' }] }), extras(), 'staffing')!.panel).toBe('staffing')
  })
})

describe('pricing and quote', () => {
  it('greens pricing as soon as a COA exists', () => {
    expect(tone(inst(), extras(), 'pricing')).toBe('idle')
    expect(tone(inst({ estimates: 1 }), extras(), 'pricing')).toBe('done')
    expect(step(inst({ estimates: 2 }), extras(), 'pricing')!.detail).toBe('2 COAs')
    expect(step(inst({ estimates: 1 }), extras(), 'pricing')!.detail).toBe('1 COA')
  })

  it('offers to send a draft', () => {
    expect(tone(inst(), extras({ quote: 'draft' }), 'quote')).toBe('action')
    expect(step(inst(), extras({ quote: 'draft' }), 'quote')!.panel).toBe('quote')
  })

  // Nothing to send is not an action — those point at pricing instead.
  it('has no send button when nothing is sitting there written', () => {
    for (const q of ['none', 'sent', 'accepted'] as const) {
      expect(step(inst(), extras({ quote: q }), 'quote')!.panel).toBeUndefined()
    }
  })

  // Sending it is our job and it is done; the client having it is the wait.
  it('greens a quote once it is out, hollow until it is agreed', () => {
    expect(tone(inst(), extras({ quote: 'sent' }), 'quote')).toBe('waiting')
    expect(tone(inst(), extras({ quote: 'accepted' }), 'quote')).toBe('done')
  })

  // A refusal is not a dead end, it is a re-quote — and it is ours to do, so
  // it is amber and it opens the quote panel like a draft does.
  it('treats a declined quote as work, not as an ending', () => {
    const s = step(inst(), extras({ quote: 'declined' }), 'quote')!
    expect(s.tone).toBe('action')
    expect(s.panel).toBe('quote')
    expect(s.detail).toBe('Declined — re-quote')
  })
})

// Nothing is owed to Harken before the course has started: quoting one in
// March for August does not make August's invoice late.
describe('billing', () => {
  const priced = { estimates: 1 }

  it('stays away until the course has begun', () => {
    expect(step(inst({ ...priced, starts_at: '2026-08-01' }), extras(), 'billing')).toBeUndefined()
    expect(step(inst({ ...priced, starts_at: null }), extras(), 'billing')).toBeUndefined()
  })

  it('arrives on the first day, asking to be sent', () => {
    const s = step(inst({ ...priced, starts_at: TODAY }), extras(), 'billing')!
    expect(s.tone).toBe('action')
    expect(s.detail).toBe('Send to Harken')
    expect(s.panel).toBe('billing')
  })

  // The loudest thing this row can say: the course ran, the money never
  // moved, and it is sitting in the Past fold where nobody looks.
  it('still shouts on a course that has already run', () => {
    const over = inst({ ...priced, starts_at: '2026-05-01', ends_at: '2026-05-05' })
    expect(step(over, extras(), 'billing')!.tone).toBe('action')
  })

  // An internal day has no client, so there is nobody to invoice — and the
  // chip would otherwise be on half the calendar.
  it('never appears on an internal course', () => {
    expect(step(inst({ ...priced, starts_at: TODAY, internal: true }), extras(), 'billing')).toBeUndefined()
  })

  // A course nobody ever priced here was almost certainly agreed and
  // invoiced somewhere else.
  it('is a grey word, not a flag, on a course that was never priced', () => {
    const s = step(inst({ starts_at: TODAY }), extras(), 'billing')!
    expect(s.tone).toBe('idle')
    expect(s.detail).toBe('Not priced')
  })

  it('counts a quote as pricing', () => {
    expect(tone(inst({ starts_at: TODAY }), extras({ quote: 'sent' }), 'billing')).toBe('action')
  })

  it('shows a course already handed over, whatever the date says', () => {
    const s = step(inst({ starts_at: '2026-08-01' }), extras({ billing: 'with-harken' }), 'billing')!
    expect(s.tone).toBe('waiting')
    expect(s.detail).toBe('With Harken')
  })

  it('stays hollow while Harken still owes us the money', () => {
    expect(tone(inst({ ...priced, starts_at: TODAY }), extras({ billing: 'invoiced' }), 'billing')).toBe('waiting')
    expect(tone(inst({ ...priced, starts_at: TODAY }), extras({ billing: 'paid' }), 'billing')).toBe('done')
  })

  // Three stops, and the middle two are both a wait on Harken — same colour.
  // The shape is the only thing that tells "she has it" from "she has raised
  // it", which is the whole reason the shape is a separate axis.
  it('fills the pip a stop at a time', () => {
    const at = (b: CourseExtras['billing']) =>
      step(inst({ ...priced, starts_at: TODAY }), extras({ billing: b }), 'billing')!.mark
    expect(at('not-sent')).toBe('act')
    expect(at('with-harken')).toBe('open')
    expect(at('invoiced')).toBe('half')
    expect(at('paid')).toBe('full')
  })

  // Even an internal one, once a request exists: a request that was made has
  // a state worth seeing.
  it('shows a handed-over internal course', () => {
    expect(tone(inst({ starts_at: TODAY, internal: true }), extras({ billing: 'paid' }), 'billing')).toBe('done')
  })
})

// A course that has run is done being built. Whether its curriculum was ever
// written down is history; whether it was ever invoiced is not.
describe('a course that is over', () => {
  const over = ran()

  it('is asked about the money and nothing else', () => {
    expect(courseSteps(over, extras(), TODAY).map((s) => s.key)).toEqual(['billing', 'books'])
  })

  // An internal day has no client, so no billing — but it still cost money to
  // run, and that money still has to land in the P&L.
  it('still owes its own books when there is nobody to bill', () => {
    expect(courseSteps({ ...over, internal: true }, extras(), TODAY).map((s) => s.key)).toEqual(['books'])
  })

  it('counts a completed course as over whatever its dates say', () => {
    expect(courseSteps({ ...over, status: 'completed', ends_at: '2027-01-01' }, extras(), TODAY).map((s) => s.key))
      .toContain('billing')
  })
})

// The three that only report. None of them is ever amber: nobody builds a
// curriculum from a list, and a loud chip on every unbuilt one would drown
// the chain above it.
describe('the build track', () => {
  it('never asks for action and never opens a panel', () => {
    const build = courseSteps(inst(), extras(), TODAY).filter((s) => s.track === 'build')
    expect(build.map((s) => s.key)).toEqual(['schedule', 'curriculum', 'gear'])
    expect(build.every((s) => s.tone === 'idle' && s.panel === undefined)).toBe(true)
  })

  it('ticks off what exists', () => {
    const built = courseSteps(inst(), extras({ schedule: true, curriculum: true, gear: true }), TODAY)
    expect(built.filter((s) => s.track === 'build').every((s) => s.tone === 'done')).toBe(true)
  })
})

// The chain is the row you read at a glance, in the order the work happens.
describe('the chain', () => {
  it('runs people, then money, in order', () => {
    const chain = courseSteps(inst({ starts_at: TODAY }), extras(), TODAY).filter((s) => s.track === 'chain')
    expect(chain.map((s) => s.key)).toEqual(['staffing', 'pricing', 'quote', 'billing'])
  })
})

// A course that has run, or was called off, owes nobody anything.
describe('showsSteps', () => {
  it('keeps a completed course, because it can still be unbilled', () => {
    expect(showsSteps('tentative')).toBe(true)
    expect(showsSteps('quoted')).toBe(true)
    expect(showsSteps('confirmed')).toBe(true)
    expect(showsSteps('completed')).toBe(true)
    expect(showsSteps('cancelled')).toBe(false)
  })
})

// Every other step has two stops, so its shape follows its colour and no
// step has to remember to say both.
describe('markForTone', () => {
  it('falls out of the tone everywhere but billing', () => {
    expect(markForTone('action')).toBe('act')
    expect(markForTone('waiting')).toBe('open')
    expect(markForTone('done')).toBe('full')
    expect(markForTone('idle')).toBe('none')
  })

  it('leaves no chip without a shape', () => {
    const all = courseSteps(inst({ estimates: 1, starts_at: TODAY }), extras(), TODAY)
    expect(all.every((s) => typeof s.mark === 'string')).toBe(true)
  })
})

describe('coursePhase', () => {
  const at = (starts_at: string | null, ends_at: string | null, status = 'confirmed') =>
    coursePhase({ status, starts_at, ends_at }, TODAY)

  it('reads the course\'s own window', () => {
    expect(at('2026-07-01', '2026-07-05')).toBe('ahead')
    expect(at(TODAY, '2026-06-20')).toBe('running')
    expect(at('2026-05-01', '2026-05-05')).toBe('over')
    expect(at(null, null)).toBe('ahead')
  })

  it('takes "completed" at its word', () => {
    expect(at('2027-01-01', '2027-01-05', 'completed')).toBe('over')
  })
})

// ── The books ────────────────────────────────────────────────────────────────
//
// Paid is the client's side. Books closed is ours, and it lands later — a card
// statement arrives the month after, an expense report later still. A course
// that leaves the list on Paid alone leaves with half its P&L still coming.
describe('the books', () => {
  it('stays quiet while costs could still be arriving', () => {
    const s = step(ran({ ends_at: '2026-06-10' }), extras(), 'books')!
    expect(s.tone).toBe('waiting')
    expect(s.detail).toBe('Costs still landing')
  })

  it('asks once they should all be in', () => {
    const s = step(ran({ ends_at: '2026-05-05' }), extras(), 'books')!
    expect(s.tone).toBe('action')
    expect(s.detail).toBe('Close the books')
  })

  it('takes the settle window from whatever the org says', () => {
    const late = ran({ ends_at: '2026-06-10' })
    expect(step(late, extras(), 'books', TODAY)!.tone).toBe('waiting')
    // Shorten the window and the same course is now overdue.
    expect(courseSteps(late, extras(), TODAY, 3).find((s) => s.key === 'books')!.tone).toBe('action')
  })

  it('goes quiet for good once somebody closes them', () => {
    const s = step(ran(), extras({ booksClosed: true }), 'books')!
    expect(s.tone).toBe('done')
    expect(s.detail).toBe('Closed')
  })

  it('never appears before the course has run', () => {
    expect(step(inst({ starts_at: '2026-12-01', ends_at: '2026-12-05' }), extras(), 'books')).toBeUndefined()
  })
})

// A course leaves the working list only when both finishes have landed.
describe('courseSettled', () => {
  const paidUp = extras({ quote: 'accepted', billing: 'paid' })

  it('needs the money in and the books shut', () => {
    expect(courseSettled(ran(), paidUp, TODAY)).toBe(false)
    expect(courseSettled(ran(), { ...paidUp, booksClosed: true }, TODAY)).toBe(true)
  })

  it('is not satisfied by closed books alone', () => {
    expect(courseSettled(ran(), extras({ booksClosed: true, billing: 'with-harken' }), TODAY)).toBe(false)
  })

  // The whole reason it is not a date: age has nothing to do with it.
  it('keeps an ancient unbilled course as work', () => {
    const old = ran({ starts_at: '2024-02-01', ends_at: '2024-02-09' })
    expect(courseSettled(old, extras(), TODAY)).toBe(false)
  })

  it('never settles a course that has not run', () => {
    expect(courseSettled(inst({ starts_at: '2026-12-01' }), { ...paidUp, booksClosed: true }, TODAY)).toBe(false)
  })
})

// ── The money pipeline ───────────────────────────────────────────────────────
//
// Position answers "how far along" before any colour is read, and the first
// unlit stop is by construction the next thing that has to happen.
describe('moneyPipeline', () => {
  const pipe = (estimates: number, x: Partial<CourseExtras>, hasBillingContact = true) =>
    moneyPipeline({ estimates, hasBillingContact }, extras(x))

  it('starts with nothing reached and the first stop ours', () => {
    const p = pipe(0, {})
    expect(p.frontier).toBe(-1)
    expect(p.next!.key).toBe('coa')
    expect(p.next!.state).toBe('next-us')
  })

  it('moves the frontier as the money moves', () => {
    expect(pipe(1, {}).frontier).toBe(0)
    expect(pipe(1, { quote: 'sent' }).frontier).toBe(2)
    expect(pipe(1, { quote: 'accepted', billing: 'invoiced' }).frontier).toBe(5)
  })

  // Whose move it is falls straight out of who owns the stop — no second rule.
  it('hands the wait to the client once the quote is out', () => {
    const p = pipe(1, { quote: 'sent' })
    expect(p.next!.key).toBe('agreed')
    expect(p.next!.state).toBe('next-them')
  })

  it('hands it back to us once they accept', () => {
    const p = pipe(1, { quote: 'accepted' })
    expect(p.next!.key).toBe('billed')
    expect(p.next!.state).toBe('next-us')
  })

  // A course billed against a PO never had a quote and never will. Those
  // stops are passed over, not pending, and the rail runs straight through.
  it('marks stops that were skipped rather than forgotten', () => {
    const p = pipe(0, { billing: 'with-harken' })
    const by = Object.fromEntries(p.stops.map((s) => [s.key, s.state]))
    expect(by.coa).toBe('skip')
    expect(by.draft).toBe('skip')
    expect(by.sent).toBe('skip')
    expect(by.agreed).toBe('skip')
    expect(by.billed).toBe('done')
  })

  it('says a refusal is a refusal, and puts a re-quote next', () => {
    const p = pipe(1, { quote: 'declined' })
    expect(p.stops.find((s) => s.key === 'agreed')!.state).toBe('no')
    expect(p.next!.key).toBe('draft')
    expect(p.next!.state).toBe('next-us')
  })

  // Ours, and it cannot be done yet. Worth knowing before the click, not after
  // opening a panel that only tells you to go and add a contact.
  it('blocks a send with nobody to send it to', () => {
    const p = pipe(1, { quote: 'accepted' }, false)
    expect(p.next!.state).toBe('block')
    expect(p.next!.blockedBy).toBe('No contact')
  })

  it('is settled once the money has landed', () => {
    const p = pipe(1, { quote: 'accepted', billing: 'paid' })
    expect(p.settled).toBe(true)
    expect(p.next).toBeNull()
  })

  it('always draws every stop, however little has happened', () => {
    expect(pipe(0, {}).stops.map((s) => s.key))
      .toEqual(['coa', 'draft', 'sent', 'agreed', 'billed', 'invoiced', 'paid'])
  })
})

// The filters ask the same step list the rows draw, so a count at the top can
// never disagree with what is under it.
describe('needs', () => {
  const needing = (id: string, s: StepInput, x: CourseExtras) =>
    NEEDS.find((n) => n.id === id)!.test(courseSteps(s, x, TODAY))

  it('finds the courses with nobody on them', () => {
    expect(needing('staffing', inst(), extras())).toBe(true)
    expect(needing('staffing', inst({ crew: [{ role: 'lead' }, { role: 'assist' }] }), extras())).toBe(false)
  })

  it('finds a draft sitting written and unsent', () => {
    expect(needing('quote', inst(), extras({ quote: 'draft' }))).toBe(true)
    expect(needing('quote', inst(), extras({ quote: 'sent' }))).toBe(false)
  })

  it('finds money we never asked for', () => {
    expect(needing('billing', ran(), extras())).toBe(true)
    expect(needing('billing', ran(), extras({ billing: 'paid' }))).toBe(false)
  })

  it('finds books nobody has shut', () => {
    expect(needing('books', ran(), extras())).toBe(true)
    expect(needing('books', ran(), extras({ booksClosed: true }))).toBe(false)
  })

  // "Waiting" is the list you chase from, so it must not also contain the
  // list you work from — a course with an amber step is not waiting.
  it('keeps waiting and acting apart', () => {
    const waiting = courseSteps(
      inst({ crew: [{ role: 'lead' }, { role: 'assist' }], estimates: 1 }),
      extras({ quote: 'sent', schedule: true, curriculum: true, gear: true }),
      TODAY
    )
    expect(NEEDS.find((n) => n.id === 'waiting')!.test(waiting)).toBe(true)
    const acting = courseSteps(inst(), extras({ quote: 'sent' }), TODAY)
    expect(NEEDS.find((n) => n.id === 'waiting')!.test(acting)).toBe(false)
  })

  it('ORs the picked filters and passes everything when none are picked', () => {
    const steps = courseSteps(inst(), extras(), TODAY)
    expect(matchesNeeds(steps, new Set())).toBe(true)
    expect(matchesNeeds(steps, new Set(['staffing']))).toBe(true)
    expect(matchesNeeds(steps, new Set(['billing']))).toBe(false)
    expect(matchesNeeds(steps, new Set(['billing', 'staffing']))).toBe(true)
  })
})
