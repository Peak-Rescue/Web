import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CertGrid from '@/app/instructor/CertGrid'
import ProfileForm from '@/app/instructor/ProfileForm'
import CapabilityPanel from '@/app/admin/instructors/CapabilityPanel'
import {
  adminUpsertCert,
  adminDeleteCert,
  adminAddCertDocument,
  adminDeleteCertDocument,
  adminUpdateProfile,
  adminSetCapability,
  adminRemoveCapability,
} from './actions'

export default async function AdminInstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: callerProfile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'admin') redirect('/dashboard')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id, first_name, last_name, email, phone, role')
    .eq('id', id)
    .in('role', ['instructor', 'admin'])
    .single()

  if (!profile) notFound()

  const [{ data: certs }, { data: capabilities }] = await Promise.all([
    createAdminClient()
      .from('instructor_certs')
      .select('id, cert_type, level, expires_at, notes, instructor_cert_documents(id, url, file_name, created_at)')
      .eq('instructor_id', id)
      .order('cert_type'),
    createAdminClient()
      .from('instructor_capabilities')
      .select('category, role')
      .eq('instructor_id', id),
  ])

  const name = profile.first_name
    ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
    : 'Unnamed Instructor'

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href="/admin/instructors" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Instructor Certifications
          </Link>
          <h1 className="text-2xl font-bold mt-3">{name}</h1>
          {profile.email && <p className="text-zinc-400 mt-1">{profile.email}</p>}
        </div>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Contact Info</h2>
          <ProfileForm
            initialEmail={profile.email ?? null}
            initialPhone={profile.phone ?? null}
            onUpdateProfile={adminUpdateProfile.bind(null, id)}
          />
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Certifications</h2>
          <CertGrid
            initialCerts={certs ?? []}
            actions={{
              upsertCert: adminUpsertCert.bind(null, id),
              deleteCert: adminDeleteCert.bind(null, id),
              addCertDocument: adminAddCertDocument.bind(null, id),
              deleteCertDocument: adminDeleteCertDocument.bind(null, id),
            }}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Teaching Capabilities</h2>
          <CapabilityPanel
            initialCapabilities={(capabilities ?? []) as Parameters<typeof CapabilityPanel>[0]['initialCapabilities']}
            actions={{
              setCapability: adminSetCapability.bind(null, id),
              removeCapability: adminRemoveCapability.bind(null, id),
            }}
          />
        </section>
      </div>
    </main>
  )
}
