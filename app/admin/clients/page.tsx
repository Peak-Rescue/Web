import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClientRow } from '@/lib/clients'
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

  const [{ data: clientRows }, { data: signoffRows }] = await Promise.all([
    admin.from('clients').select('id, parent_id, name, aliases, note, position'),
    admin.from('client_signoffs').select('client_id, profile_id, profiles(first_name, last_name)'),
  ])

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
        <ClientTree rows={(clientRows ?? []) as ClientRow[]} signoffs={signoffs} me={user.id} />
      </div>
    </main>
  )
}
