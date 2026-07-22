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
