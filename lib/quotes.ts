// Quote boilerplate — the recurring copy from Peak Rescue's real quotes,
// templated verbatim (typos fixed, branding standardized).

export const QUOTE_MISSION =
  "Peak Rescue's mission is to provide each client or organization with cutting edge skills and education to " +
  'prevent catastrophe. We also respond to difficult rescue scenarios with the safest and most effective ' +
  'techniques available to rescuers.'

export const QUOTE_COMMITMENT =
  'We truly look forward to this opportunity! We stand behind our mission to be the top training team for ' +
  'mountain warfare operations. We are committed to giving you the best training; specially designed for YOU ' +
  'and your team! Your teams are the heart of our company and we value your experience with Peak Rescue! ' +
  'Looking forward to working with you!'

export const QUOTE_CONTACT = {
  phone: '(833) 737-2834',
  website: 'www.peak-rescue.com',
}

export function quoteNumber(refNumber: number, seq: number): string {
  return `PR-${String(refNumber).padStart(4, '0')}-Q${seq}`
}

export const QUOTE_VALIDITY_DAYS = 30

/** What an option is to the others on its quote — see migration 214.

    standalone  a course the client can take, and at most one of them: two
                whole courses on one quote are two deployments billed as one,
                which is what the drive team and the fly-in would have been.
    addition    priced as the difference, on top of the option `requires`
                names. The only way to combine.

    Absent on quotes written before 213, which were freely combinable and must
    stay that way — it is what their clients were shown. */
export type OptionRelation = 'standalone' | 'addition'

export type QuoteOption = {
  estimate_id?: string | null
  title: string
  total: number
  chosen?: boolean
  /** Absent on quotes written before 213, which were all freely combinable. */
  relation?: OptionRelation | null
  /** The option an addition goes on top of, when it goes on a particular one.
      Snapshotted from the COA's extends_id, so re-pointing a COA later cannot
      change what a client already accepted. */
  requires?: string | null
}

const isAddition = (o: QuoteOption | undefined) => o?.relation === 'addition' || Boolean(o?.requires)

/** The option an addition depends on, when that option is on this quote at all.
    A COA can extend one whose COA was set aside before the quote was written;
    the snapshot then has a requires nothing else matches, and an addition whose
    parent is not being offered is not an addition — it is the only thing on
    offer, and holding it hostage to a missing option would make the quote
    unacceptable. */
const parentIndex = (options: QuoteOption[], i: number): number => {
  const req = options[i]?.requires
  return req ? options.findIndex((o) => o.estimate_id === req) : -1
}

/** Whether an option can be ticked given what else is. The client's form and
    the accept action both ask this, so what the page greys out and what the
    server refuses cannot come apart.

    An addition needs the thing it is added to: the option it names, or — when
    it names none — anything at all that is not itself an addition. An
    alternative needs no other alternative already taken. */
export function optionAvailable(options: QuoteOption[], i: number, selected: Iterable<number>): boolean {
  const picked = [...selected]
  const o = options[i]
  if (!o) return false
  if (o.relation === 'standalone') {
    // A second whole course is not a bigger order, so one releases the other.
    return !picked.some((j) => j !== i && options[j]?.relation === 'standalone')
  }
  if (!isAddition(o)) return true // pre-213, freely combinable
  const parent = parentIndex(options, i)
  if (parent !== -1) return picked.includes(parent)
  // An addition can name a COA that was set aside before the quote went out.
  // With nothing on the quote for it to be added to, the rule carries no
  // information, and enforcing it anyway would leave a quote that can never be
  // accepted — so it stands on its own instead.
  if (!options.some((other, j) => j !== i && !isAddition(other))) return true
  return picked.some((j) => j !== i && !isAddition(options[j]))
}

/** What is wrong with a selection, or null when nothing is. The message reaches
    the client, so it names the options rather than their ids. */
export function selectionProblem(options: QuoteOption[], selected: number[]): string | null {
  if (selected.length === 0) return 'Select at least one option'
  if (selected.some((i) => i < 0 || i >= options.length)) return 'That option is no longer on this quote'

  const courses = selected.filter((i) => options[i]?.relation === 'standalone')
  if (courses.length > 1) {
    return `"${options[courses[0]].title}" and "${options[courses[1]].title}" are alternatives — please choose one.`
  }

  const orphan = selected.find((i) => !optionAvailable(options, i, selected))
  if (orphan === undefined) return null
  const parent = parentIndex(options, orphan)
  return parent !== -1
    ? `"${options[orphan].title}" is an addition to "${options[parent].title}" and can only be accepted with it.`
    : `"${options[orphan].title}" is an addition and has to be taken with one of the other options.`
}

/** A quote as every screen that lists one reads it. Lives here rather than on
    the list component because the action that makes a quote hands one back. */
export type QuoteRow = {
  id: string
  accept_token: string
  estimate_id: string | null
  /** Set when every COA this quote prices has been set aside. */
  archived_at: string | null
  prepared_by: string | null
  prepared_by_name: string | null
  quote_seq: number
  status: string
  issue_date: string
  valid_until: string | null
  total: number
  options: QuoteOption[] | null
  scope_bullets: string[] | null
  course_blurb: string | null
  sent_at: string | null
  accepted_at: string | null
  accepted_name: string | null
}

/** The columns a QuoteRow needs, for the queries that load or return one. */
export const QUOTE_ROW_COLUMNS =
  'id, accept_token, estimate_id, archived_at, prepared_by, prepared_by_name, quote_seq, status, issue_date, valid_until, total, options, scope_bullets, course_blurb, sent_at, accepted_at, accepted_name' as const
