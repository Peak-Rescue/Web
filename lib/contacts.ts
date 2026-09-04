// Course POCs live in course_instances.contacts (jsonb): an ordered list of
// people, each with any number of phones and emails. The first POC's first
// email is the primary address (quotes are sent there).

export type CoursePOC = { name: string; phones: string[]; emails: string[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])

export function parseContacts(raw: unknown): CoursePOC[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => {
      const rec = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
      return { name: str(rec.name), phones: strList(rec.phones), emails: strList(rec.emails) }
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

export const primaryContactEmail = (contacts: CoursePOC[]) => contacts[0]?.emails[0] ?? null

// Every other email on file — offered as opt-in CCs when sending a quote.
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
