import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CertGrid from './CertGrid'
import ProfileForm from './ProfileForm'
import { upsertCert, deleteCert, addCertDocument, deleteCertDocument, updateProfile } from './actions'
import { signOut } from '@/app/actions'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

export default async function InstructorPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role, first_name, last_name, email, phone, emergency_name, emergency_relationship, emergency_phone')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'instructor' && profile.role !== 'admin')) {
    redirect('/dashboard')
  }

  const [{ data: certs }, { data: capabilities }] = await Promise.all([
    createAdminClient()
      .from('instructor_certs')
      .select('id, cert_type, level, expires_at, notes, instructor_cert_documents(id, url, file_name, created_at)')
      .eq('instructor_id', user.id)
      .order('cert_type'),
    createAdminClient()
      .from('instructor_capabilities')
      .select('category, role')
      .eq('instructor_id', user.id),
  ])

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {profile.first_name ? `${profile.first_name} ${profile.last_name ?? ''}'s Portal`.trim() : 'Instructor Portal'}
            </h1>
            <p className="text-zinc-400 mt-1">Manage your certifications</p>
          </div>
          <SignOutButton />
        </div>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Contact Info</h2>
          <ProfileForm
            initialEmail={profile.email ?? null}
            initialPhone={profile.phone ?? null}
            initialEmergencyName={profile.emergency_name ?? null}
            initialEmergencyRelationship={profile.emergency_relationship ?? null}
            initialEmergencyPhone={profile.emergency_phone ?? null}
            onUpdateProfile={updateProfile}
          />
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Certifications</h2>
          <CertGrid initialCerts={certs ?? []} actions={{ upsertCert, deleteCert, addCertDocument, deleteCertDocument }} />
        </section>

        {(capabilities ?? []).length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Teaching Expertise</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CAPABILITY_ORDER
                .filter(cat => capabilities?.some(c => c.category === cat))
                .map(cat => {
                  const role = capabilities?.find(c => c.category === cat)?.role
                  return (
                    <div key={cat} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900">
                      <div className="text-sm font-medium text-white mb-2">{CAPABILITY_META[cat].label}</div>
                      <div className="flex gap-1.5">
                        {(['lead', 'assist'] as const).map(r => (
                          <span
                            key={r}
                            className={`flex-1 px-2 py-1 rounded text-xs font-medium capitalize text-center ${
                              role === r
                                ? r === 'lead'
                                  ? 'bg-green-900/40 border border-green-700 text-green-400'
                                  : 'bg-blue-700 text-white'
                                : 'bg-zinc-800 text-zinc-600'
                            }`}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
      >
        Sign out
      </button>
    </form>
  )
}
