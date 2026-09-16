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

export type QuoteOption = { estimate_id?: string | null; title: string; total: number; chosen?: boolean }

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
