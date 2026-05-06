import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { InstructorTable } from './InstructorTable'
import { adminSendInvite } from './[id]/actions'

export default async function AdminInstructorsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const admin = createAdminClient()

  const [{ data: profileList }, { data: capRows }, { data: uninvited }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, first_name, last_name, email, phone, instructor_certs(id, cert_type, level, notes, expires_at, instructor_cert_documents(id, url, file_name))')
      .in('role', ['instructor', 'admin'])
      .order('last_name'),
    // Capabilities keyed by profile_id (join through instructors)
    admin
      .from('instructors')
      .select('profile_id, instructor_capabilities(category, role)')
      .not('profile_id', 'is', null),
    // Instructors without a profile yet — need inviting
    admin
      .from('instructors')
      .select('id, name, email')
      .is('profile_id', null)
      .not('email', 'is', null)
      .order('name'),
  ])

  // Merge capabilities onto each profile by profile_id
  const capsByProfileId = new Map<string, { category: string; role: string }[]>()
  for (const row of capRows ?? []) {
    if (row.profile_id) {
      capsByProfileId.set(row.profile_id, (row.instructor_capabilities ?? []) as { category: string; role: string }[])
    }
  }
  const merged = (profileList ?? []).map(i => ({
    ...i,
    instructor_capabilities: capsByProfileId.get(i.id) ?? [],
  }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-2">Instructor Profiles</h1>
        <p className="text-zinc-400 mb-8">All instructors — certifications, expertise, and portal access</p>
        <InstructorTable instructors={merged as Parameters<typeof InstructorTable>[0]['instructors']} isAdmin={profile?.role === 'admin'} />

        {profile?.role === 'admin' && (uninvited ?? []).length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-semibold mb-1">Portal Invites</h2>
            <p className="text-zinc-500 text-sm mb-4">These instructors don't have an account yet.</p>
            <div className="space-y-2">
              {(uninvited ?? []).map(instr => (
                <div key={instr.id} className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div>
                    <span className="font-medium text-sm">{instr.name}</span>
                    <span className="ml-3 text-xs text-zinc-500">{instr.email}</span>
                  </div>
                  <form action={adminSendInvite.bind(null, instr.id)}>
                    <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors">
                      Send invite
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
