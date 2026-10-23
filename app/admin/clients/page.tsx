import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_COLUMNS, type ClientRow } from '@/lib/clients'
import ClientTree from './ClientTree'

// The client list, edited in place. Doubles as the review of the first draft:
// each person ticks the clients they agree with, and the ticks are theirs.

export const metadata = { title: 'Clients' }

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: clientRows }, { data: signoffRows }, { data: courseRows }, { data: peopleRows }, { data: linkRows }] =
    await Promise.all([
      admin.from('clients').select(CLIENT_COLUMNS),
      admin.from('client_signoffs').select('client_id, profile_id, profiles(first_name, last_name)'),
      admin.from('course_instances').select('client_id').not('client_id', 'is', null),
      // The people, and where each is known from (267).
      admin.from('contacts').select('id, name, role, phone, email, note'),
      admin.from('contact_links').select('contact_id, client_id, venue_id, region_code'),
    ])
  // Keyed by owner, with the other places on the row — a person known from
  // the client and the venue is one row saying so, not two rows.
  const venueNames = new Map(
    (((await admin.from('venues').select('id, name')).data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name])
  )
  const clientNames = new Map(((clientRows ?? []) as ClientRow[]).map((c) => [c.id, c.name]))
  const person = new Map(((peopleRows ?? []) as { id: string }[]).map((p) => [p.id, p]))
  const where = (l: { client_id: string | null; venue_id: string | null; region_code: string | null }) =>
    l.client_id
      ? { key: `client:${l.client_id}`, label: clientNames.get(l.client_id) ?? 'a client' }
      : l.venue_id
        ? { key: `venue:${l.venue_id}`, label: venueNames.get(l.venue_id) ?? 'a venue' }
        : { key: `region:${l.region_code}`, label: String(l.region_code) }
  type Link = { contact_id: string; client_id: string | null; venue_id: string | null; region_code: string | null }
  const links = (linkRows ?? []) as Link[]
  const contactsByOwner: Record<string, ReturnType<typeof Object>[]> = {}
  for (const l of links) {
    const p = person.get(l.contact_id)
    if (!p) continue
    const here = where(l)
    contactsByOwner[here.key] = [
      ...(contactsByOwner[here.key] ?? []),
      {
        ...p,
        homes: links.filter((x) => x.contact_id === l.contact_id).map(where),
      },
    ]
  }

  const courseCounts: Record<string, number> = {}
  for (const c of courseRows ?? []) courseCounts[c.client_id as string] = (courseCounts[c.client_id as string] ?? 0) + 1

  // Who has ticked what, as initials — enough to see at a glance whether a
  // client has been looked at by one person or by everyone.
  const signoffs: Record<string, { profileId: string; initials: string; name: string }[]> = {}
  for (const s of (signoffRows ?? []) as unknown as {
    client_id: string
    profile_id: string
    profiles: { first_name: string | null; last_name: string | null } | null
  }[]) {
    const first = s.profiles?.first_name?.trim() ?? ''
    const last = s.profiles?.last_name?.trim() ?? ''
    const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?'
    ;(signoffs[s.client_id] ??= []).push({ profileId: s.profile_id, initials, name: `${first} ${last}`.trim() })
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Clients</h1>
        <ClientTree
          rows={(clientRows ?? []) as ClientRow[]}
          signoffs={signoffs}
          me={user.id}
          courseCounts={courseCounts}
          contactsByOwner={contactsByOwner as never}
        />
      </div>
    </main>
  )
}
