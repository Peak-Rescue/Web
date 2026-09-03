import type { SupabaseClient } from '@supabase/supabase-js'

/** Who an update is for. The audience also decides who can see it on the page:
    emailing only the crew while the words sit where the students are reading
    would be worse than not sending at all. */
export type UpdateAudience = 'students' | 'instructors' | 'everyone'

/** How many inboxes each choice of audience reaches, you excepted. */
export type NotifyCounts = { students: number; instructors: number; everyone: number }

// Counted by address and never by head: an instructor who is also enrolled is
// one inbox, and your own doesn't count because the poster is never emailed
// their own post. `everyone` is its own union for exactly that reason — adding
// the two groups would double-count that person.
//
// One definition, because the number is a promise made before something that
// can't be taken back: the button says "emails 10 people" on two different
// screens and they had better agree with each other and with what goes out.
export function countAddresses(
  emails: (string | null | undefined)[],
  excludeEmail: string | null
): Set<string> {
  const mine = excludeEmail?.trim().toLowerCase() ?? null
  return new Set(
    emails
      .map((e) => e?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e) && e !== mine)
  )
}

export function notifyCountsFrom(
  studentEmails: (string | null | undefined)[],
  crewEmails: (string | null | undefined)[],
  excludeEmail: string | null
): NotifyCounts {
  const students = countAddresses(studentEmails, excludeEmail)
  const crew = countAddresses(crewEmails, excludeEmail)
  return {
    students: students.size,
    instructors: crew.size,
    everyone: new Set([...students, ...crew]).size,
  }
}

/** The same counts for a caller that hasn't already loaded the roster — the
    admin course editor, which knows the course but not its addresses. */
export async function courseNotifyCounts(
  admin: SupabaseClient,
  instanceId: string,
  excludeEmail: string | null
): Promise<NotifyCounts> {
  const [{ data: enrollments }, { data: crew }] = await Promise.all([
    admin.from('enrollments').select('profiles(email)').eq('instance_id', instanceId),
    admin.from('instance_instructors').select('instructors(email)').eq('instance_id', instanceId),
  ])
  return notifyCountsFrom(
    ((enrollments ?? []) as unknown as { profiles: { email: string | null } | null }[]).map((e) => e.profiles?.email),
    ((crew ?? []) as unknown as { instructors: { email: string | null } | null }[]).map((c) => c.instructors?.email),
    excludeEmail
  )
}

/** Whether a course is real enough to email the crew about a change to it.
    A tentative or quoted course is a proposal: its dates move as the client
    talks, and mailing every move trains people to ignore the ones that
    matter. Nothing goes out about a change until the course is confirmed —
    up to then the portal page is the record, and anyone staffed early can
    read it there.

    `completed` counts too: a course that already ran was confirmed once, and
    a correction to it after the fact is still news to the people who worked
    it. */
export function announcesChanges(status: string | null | undefined): boolean {
  return status === 'confirmed' || status === 'completed'
}
