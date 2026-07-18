import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { InstructorTable } from './InstructorTable'
import { adminSendInvite } from './[id]/actions'
import AddInstructorButton from './AddInstructorButton'
import { InviteButton } from './InviteButton'

export default async function AdminInstructorsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'instructor'].includes(callerProfile?.role ?? '')) redirect('/dashboard')

  const isAdmin = callerProfile?.role === 'admin'

  // Instructors table is the source of truth
  const { data: instructorRows } = await admin
    .from('instructors')
    .select('id, name, email, profile_id, invite_sent_at, instructor_capabilities(category, role)')
    .order('name')

  // Fetch profiles for linked instructors
  const profileIds = (instructorRows ?? []).filter(i => i.profile_id).map(i => i.profile_id!)
  const { data: profileRows } = profileIds.length > 0
    ? await admin
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_exempt, instructor_certs(id, cert_type, level, notes, expires_at, instructor_cert_documents(id, url, file_name))')
        .in('id', profileIds)
    : { data: [] }

  const profileMap = new Map((profileRows ?? []).map(p => [p.id, p]))

  type InviteStatus = 'active' | 'invited' | 'not_invited'

  const allInstructors = (instructorRows ?? []).map(instr => {
    const profile = instr.profile_id ? profileMap.get(instr.profile_id) : undefined
    const inviteStatus: InviteStatus = instr.profile_id
      ? 'active'
      : instr.invite_sent_at
        ? 'invited'
        : 'not_invited'

    return {
      id: instr.id,
      name: instr.name,
      email: instr.email,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      phone: profile?.phone ?? null,
      invite_status: inviteStatus,
      is_exempt: profile?.is_exempt ?? false,
      instructor_certs: (profile?.instructor_certs ?? []) as Parameters<typeof InstructorTable>[0]['instructors'][number]['instructor_certs'],
      instructor_capabilities: (instr.instructor_capabilities ?? []) as Parameters<typeof InstructorTable>[0]['instructors'][number]['instructor_capabilities'],
    }
  })

  const active = allInstructors.filter(i => i.invite_status === 'active')
  const invited = allInstructors.filter(i => i.invite_status === 'invited')
  const notInvited = allInstructors.filter(i => i.invite_status === 'not_invited')

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-2">Instructor Profiles</h1>
        <div className="flex items-center justify-between mb-10">
          <p className="text-zinc-400">Certifications, expertise, and portal access</p>
          {isAdmin && <AddInstructorButton />}
        </div>

        {/* ── Active accounts ─────────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-semibold">Active</h2>
          </div>
          {active.length > 0
            ? <InstructorTable instructors={active} isAdmin={isAdmin} />
            : <p className="text-sm text-zinc-500">No active accounts yet.</p>
          }
        </section>

        {/* ── Invited — awaiting login ─────────────────────────────────────── */}
        {(isAdmin || invited.length > 0) && (
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold">Invited</h2>
            </div>
            <p className="text-sm text-zinc-500 mb-4">Invite sent — waiting for them to set up their account.</p>
            {invited.length > 0 ? (
              <div className="space-y-2">
                {invited.map(instr => (
                  <div key={instr.id} className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <div>
                      <Link href={`/admin/instructors/${instr.id}`} className="font-medium text-sm hover:text-pr-red-light transition-colors">
                        {instr.name}
                      </Link>
                      {instr.email && <span className="ml-3 text-xs text-zinc-500">{instr.email}</span>}
                    </div>
                    {isAdmin && (
                      <InviteButton
                        action={adminSendInvite.bind(null, instr.id)}
                        label="Resend invite"
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-600 italic">None pending.</p>
            )}
          </section>
        )}

        {/* ── Not invited ──────────────────────────────────────────────────── */}
        {isAdmin && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold">Not Invited</h2>
            </div>
            <p className="text-sm text-zinc-500 mb-4">These instructors don&apos;t have a portal account yet.</p>
            {notInvited.length > 0 ? (
              <div className="space-y-2">
                {notInvited.map(instr => (
                  <div key={instr.id} className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <div>
                      <Link href={`/admin/instructors/${instr.id}`} className="font-medium text-sm hover:text-pr-red-light transition-colors">
                        {instr.name}
                      </Link>
                      {instr.email && <span className="ml-3 text-xs text-zinc-500">{instr.email}</span>}
                    </div>
                    {instr.email && (
                      <InviteButton
                        action={adminSendInvite.bind(null, instr.id)}
                        label="Send invite"
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-600 italic">Everyone has been invited.</p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
