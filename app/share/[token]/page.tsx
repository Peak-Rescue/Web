import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CourseView, { GUEST } from '@/app/portal/[id]/CourseView'

// A course page for someone with no account — the client's point of contact,
// an instructor being sounded out. The token stands in for the session and
// says one thing: this person may read this course as a student would.
//
// The page rendered is the students' page, not a copy of it. Anything else and
// the list you told them to pack from drifts from the one the students have.

// A link that gets forwarded is a link that gets indexed. Not that a search
// engine could guess a uuid, but a POC pasting it into a public thread would
// otherwise put the course in a crawler's path.
export const metadata = { robots: { index: false, follow: false } }

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // Not a uuid means not a token we ever minted, and answering that with a
  // database round-trip is answering it too politely.
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound()

  const admin = createAdminClient()
  const { data: share } = await admin
    .from('course_view_shares')
    .select('id, instance_id, expires_at, revoked_at, viewed_at, view_count')
    .eq('token', token)
    .maybeSingle()

  // Revoked, expired and never-existed are one answer on purpose: a dead link
  // shouldn't tell whoever holds it which kind of dead it is.
  if (!share) notFound()
  if (share.revoked_at) notFound()
  if (share.expires_at && new Date(share.expires_at) < new Date()) notFound()

  // After the response, so the count never delays the page. First open is kept
  // apart from the running total — "did they ever look at it" and "how often"
  // are different questions, and the first is the one you usually want.
  after(async () => {
    await createAdminClient()
      .from('course_view_shares')
      .update({
        viewed_at: share.viewed_at ?? new Date().toISOString(),
        view_count: (share.view_count ?? 0) + 1,
      })
      .eq('id', share.id)
  })

  return <CourseView id={share.instance_id} viewer={GUEST} />
}
