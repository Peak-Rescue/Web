import { normalizeEmail } from '@/lib/email'

// The waiver: its stored text, and the rules for reading a signature back.
//
// The document lives in waiver_template_versions.body as structured blocks
// rather than HTML, so one row renders both the form on screen and the PDF and
// the two can't drift. A published version never changes — a signature points
// at the version it was shown, which is what lets you produce the exact words
// someone agreed to years later.

export type WaiverItem = { label: string; text: string }

export type WaiverClause = {
  number: number
  /** Bold run-in title — "Indemnification". Most clauses have none. */
  heading?: string
  paragraphs: string[]
  /** Lettered sub-items, as clause 2's list of inherent risks. */
  items?: WaiverItem[]
  /** Paragraphs that follow the sub-items, still inside the clause. */
  trailing?: string[]
}

export type WaiverBody = {
  title: string
  warning: string
  preamble: string
  clauses: WaiverClause[]
  /** Initials are collected immediately after this clause. Null for none. */
  initials_after_clause: number | null
  guardian_notice: string[]
  esign_consent: string
}

// ─── What a signer fills in ────────────────────────────────────────────────

/** The form's fields, and the shape a returning student's answers arrive in. */
export type WaiverPrefill = {
  firstName: string
  middleName: string
  lastName: string
  phone: string
  email: string
  dateOfBirth: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  emergencyFirstName: string
  emergencyLastName: string
  emergencyPhone: string
  emergencyRelationship: string
}

/** A waiver already on file, as the person who signed it needs to see it. */
export type SignedWaiver = {
  id: string
  signedAt: string
  name: string
  templateName: string
  signerRole: 'adult' | 'guardian'
  guardianName: string | null
}

// ─── Age ────────────────────────────────────────────────────────────────────

/**
 * Whole years old on a given day, counted the way a birthday is: the year
 * difference, minus one if the birthday hasn't come round yet.
 *
 * Both dates are read as plain calendar dates. A date of birth is not a moment
 * in time — it doesn't shift when the signer is in a different timezone to the
 * server, and treating it as one is how someone turns 18 a day early.
 */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number)
  let age = on.getFullYear() - y
  const beforeBirthday =
    on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

export const ADULT_AGE = 18

/** Under 18 on the day they're signing, so a guardian has to sign for them. */
export function isMinor(dateOfBirth: string, on: Date = new Date()): boolean {
  return ageOn(dateOfBirth, on) < ADULT_AGE
}

// ─── Matching a signature to a person ───────────────────────────────────────
//
// Only ever needed for waivers signed off the QR code, where an anonymous
// person has typed their own details. Someone signing in the portal is bound
// to their session and never goes near any of this.

/**
 * A name reduced to what two spellings of the same person have in common:
 * case, accents, and the punctuation that O'Brien and Anne-Marie pick up or
 * lose depending on who's typing.
 */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

export type MatchCandidate = {
  enrollmentId: string
  profileId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  /** Already has a waiver for this course. */
  hasSigned: boolean
}

export type MatchResult =
  | { kind: 'matched'; candidate: MatchCandidate; method: 'email_exact' | 'name_exact' }
  | { kind: 'none'; suggestions: MatchCandidate[] }

/**
 * Which enrolled student a QR signature belongs to, decided only when the
 * answer is not in doubt.
 *
 * Candidates are the enrollments on one course — never all profiles. A shared
 * full name across eight people is close to impossible; across every account
 * we've ever created it is only a matter of time, and the cost of being wrong
 * is a legal document filed against the wrong human.
 *
 * Two things stop a match cold. More than one candidate, because picking one
 * is a coin toss. And a candidate who has already signed, because that is
 * either a different person with the same name or somebody signing twice, and
 * both deserve a person's attention.
 *
 * Everything it declines to decide comes back as suggestions, ranked, for an
 * instructor who knows the course to settle in one tap. Last-name-only lands
 * there deliberately: it's how Dave signing as David gets found, and it is not
 * certain enough to act on alone.
 */
export function matchSignature(
  signed: { email: string; firstName: string; lastName: string },
  candidates: MatchCandidate[]
): MatchResult {
  const email = normalizeEmail(signed.email)
  const first = normalizeName(signed.firstName)
  const last = normalizeName(signed.lastName)

  const unsigned = candidates.filter((c) => !c.hasSigned)

  const byEmail = unsigned.filter((c) => c.email && normalizeEmail(c.email) === email)
  if (byEmail.length === 1) return { kind: 'matched', candidate: byEmail[0], method: 'email_exact' }

  const byName = unsigned.filter(
    (c) => normalizeName(c.firstName) === first && normalizeName(c.lastName) === last
  )
  if (byName.length === 1 && first && last) {
    return { kind: 'matched', candidate: byName[0], method: 'name_exact' }
  }

  // Nothing certain. Rank what a human should look at first: an exact hit we
  // refused to act on outranks a surname, which outranks a phone-book guess.
  const scored = candidates
    .map((c) => {
      const sameEmail = c.email && normalizeEmail(c.email) === email
      const sameLast = last && normalizeName(c.lastName) === last
      const sameFirst = first && normalizeName(c.firstName) === first
      const score = (sameEmail ? 4 : 0) + (sameLast ? 2 : 0) + (sameFirst ? 1 : 0)
      return { c, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.c)

  return { kind: 'none', suggestions: scored }
}
