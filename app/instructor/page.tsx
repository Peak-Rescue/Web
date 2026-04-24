import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CertGrid from './CertGrid'
import ProfileForm from './ProfileForm'
import { upsertCert, deleteCert, addCertDocument, deleteCertDocument, updateProfile } from './actions'

export default async function InstructorPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role, first_name, last_name, email, phone')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'instructor' && profile.role !== 'admin')) {
    redirect('/dashboard')
  }

  const { data: certs } = await createAdminClient()
    .from('instructor_certs')
    .select('id, cert_type, level, expires_at, notes, instructor_cert_documents(id, url, file_name, created_at)')
    .eq('instructor_id', user.id)
    .order('cert_type')

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
          <ProfileForm initialEmail={profile.email ?? null} initialPhone={profile.phone ?? null} onUpdateProfile={updateProfile} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Certifications</h2>
          <CertGrid initialCerts={certs ?? []} actions={{ upsertCert, deleteCert, addCertDocument, deleteCertDocument }} />
        </section>
      </div>
    </main>
  )
}

function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
      >
        Sign out
      </button>
    </form>
  )
}
