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

export type QuoteOption = {
  estimate_id?: string | null
  title: string
  total: number
  chosen?: boolean
  /** The option this one is an addition to, snapshotted from the COA's
      extends_id when the quote was written. An addition carries no travel and
      no mobilization — those are in the option it extends — so it cannot be
      accepted on its own. Absent on an option that stands alone. */
  requires?: string | null
}

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

/** Whether an option can be ticked on its own — false for an addition whose
    parent is on the quote and not selected. The client's form and the accept
    action both ask this, so what the page greys out and what the server
    refuses cannot come apart. */
export function optionAvailable(options: QuoteOption[], i: number, selected: Iterable<number>): boolean {
  const parent = parentIndex(options, i)
  return parent === -1 || [...selected].includes(parent)
}

/** What is wrong with a selection, or null when nothing is. The message is
    shown to the client, so it names the options rather than their ids. */
export function selectionProblem(options: QuoteOption[], selected: number[]): string | null {
  if (selected.length === 0) return 'Select at least one option'
  if (selected.some((i) => i < 0 || i >= options.length)) return 'That option is no longer on this quote'
  const orphan = selected.find((i) => !optionAvailable(options, i, selected))
  if (orphan === undefined) return null
  const parent = options[parentIndex(options, orphan)]
  return `"${options[orphan].title}" is an addition to "${parent.title}" and can only be accepted with it.`
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
  unit_rate_note: string | null
  scope_bullets: string[] | null
  course_blurb: string | null
  sent_at: string | null
  accepted_at: string | null
  accepted_name: string | null
}

/** The columns a QuoteRow needs, for the queries that load or return one. */
export const QUOTE_ROW_COLUMNS =
  'id, accept_token, estimate_id, archived_at, prepared_by, prepared_by_name, quote_seq, status, issue_date, valid_until, total, options, unit_rate_note, scope_bullets, course_blurb, sent_at, accepted_at, accepted_name' as const
