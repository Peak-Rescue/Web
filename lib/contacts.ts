// Course POCs live in course_instances.contacts (jsonb): an ordered list of
// people, each with any number of phones and emails. The first POC's first
// email is the primary address (quotes are sent there).
//
// One POC can be marked `billing`: the person who gets invoiced, who is often
// not the person who booked the course. It is a tag rather than a column
// because the billing contact is usually already on the list — marking the
// person you typed once beats retyping them into a second field and letting
// the two drift. A tag also lifts out cleanly the day the billing contact
// becomes a fact about the client rather than about the course.

export type ContactRole = 'billing'

export type CoursePOC = { name: string; phones: string[]; emails: string[]; role?: ContactRole }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])

export function parseContacts(raw: unknown): CoursePOC[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => {
      const rec = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
      const poc: CoursePOC = { name: str(rec.name), phones: strList(rec.phones), emails: strList(rec.emails) }
      if (str(rec.role) === 'billing') poc.role = 'billing'
      return poc
    })
    .filter((c) => c.name || c.phones.length || c.emails.length)
}

export function contactsFromForm(value: FormDataEntryValue | null): CoursePOC[] {
  if (typeof value !== 'string') return []
  try {
    return parseContacts(JSON.parse(value))
  } catch {
    return []
  }
}

// The quote goes to whoever is deciding, which is never accounts payable.
// So the billing POC is skipped when picking the primary — tagging someone
// must never quietly re-route a quote — and the fallback keeps the old
// behaviour for the courses where every POC happens to be tagged.
export const primaryContactEmail = (contacts: CoursePOC[]) =>
  contacts.find((c) => c.role !== 'billing' && c.emails.length > 0)?.emails[0] ??
  contacts[0]?.emails[0] ??
  null

// The POC somebody has explicitly said is the one to invoice. Usually nobody
// has, which is not a gap — see billTo.
export const billingContact = (contacts: CoursePOC[]) =>
  contacts.find((c) => c.role === 'billing') ?? null

/** Who the bill goes to, which a course almost always already knows.
 
    The person who booked the course is the person invoiced, unless somebody
    says otherwise — that is how it works on nearly every course, and treating
    the tag as required meant a course with a perfectly good contact refused to
    be handed to Harken until somebody re-stated the obvious. So the tag is an
    exception now, not a prerequisite: tag a POC when accounts payable is a
    different human, and otherwise the first contact stands.
 
    `tagged` says which of the two it is, so a screen can name the fallback out
    loud rather than quietly billing whoever happens to be first. */
export function billTo(contacts: CoursePOC[]): { contact: CoursePOC; tagged: boolean } | null {
  const marked = billingContact(contacts)
  if (marked) return { contact: marked, tagged: true }
  // Someone with nothing but a name is still who to bill: the biller has a
  // phone and a client, and an empty row is not a contact at all.
  const first = contacts.find((c) => c.name || c.emails.length > 0)
  return first ? { contact: first, tagged: false } : null
}

// Every other email on file — offered as opt-in CCs when sending a quote.
// The billing POC is in here: copying them on the quote is a choice worth
// offering, just not one worth making for you.
export function ccEmailOptions(contacts: CoursePOC[]): string[] {
  const primary = primaryContactEmail(contacts)
  return [...new Set(contacts.flatMap((c) => c.emails))].filter((e) => e !== primary)
}

// An instructor's own contact details, filtered for a page students read.
//
// A work address is fine to hand out and a personal one is not, and the
// difference is legible from the address itself — everything at our own domain
// is a work address, everything else is somebody's Gmail. A phone number has
// no such tell: every number we hold is a personal mobile, so it is shown only
// where the person has said it may be (`instructors.show_phone`).
const WORK_DOMAIN = '@peak-rescue.com'

export function workEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase()
  return e && e.endsWith(WORK_DOMAIN) ? email!.trim() : null
}

// Two gates, and both have to open.
//
// The domain rule above is about the address: a personal one is never handed
// to students, whatever anybody says. The switch is about the person: having
// a work address is not the same as wanting eight students mailing it
// directly, and the rule alone left the people it applies to nothing to say
// so with. On by default, because that is what the page did before there was
// a switch — and it can only ever hide an address, never promote a personal
// one to a card.
export function studentEmail(
  email: string | null | undefined,
  shown: boolean | null | undefined
): string | null {
  return shown === false ? null : workEmail(email)
}
