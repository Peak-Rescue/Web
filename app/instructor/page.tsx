import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CertGrid from './CertGrid'
import ProfileForm from './ProfileForm'
import AvatarEditor from '@/components/AvatarEditor'
import { upsertCert, deleteCert, addCertDocument, deleteCertDocument, updateProfile, updateInstructorProfile } from './actions'
import { signOut } from '@/app/actions'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

export default async function InstructorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: instructor }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, email, phone, emergency_name, emergency_relationship, emergency_phone').eq('id', user.id).single(),
    admin.from('instructors').select('id, name, bio, avatar, avatar_position, avatar_scale, instructor_capabilities(category, role)').eq('profile_id', user.id).maybeSingle(),
  ])

  if (!instructor) redirect('/dashboard')

  const { data: certs } = await admin
    .from('instructor_certs')
    .select('id, cert_type, level, expires_at, notes, instructor_cert_documents(id, url, file_name, created_at)')
    .eq('instructor_id', user.id)
    .order('cert_type')

  const capabilities = (instructor.instructor_capabilities ?? []) as { category: string; role: string }[]

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{instructor.name}</h1>
            <p className="text-zinc-400 mt-1">Manage your profile and certifications</p>
          </div>
          <SignOutButton />
        </div>

        {/* Public profile (bio + photo) */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Public Profile</h2>
          <form action={updateInstructorProfile} className="space-y-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <AvatarEditor
              name={instructor.name}
              currentAvatar={instructor.avatar}
              currentPosition={instructor.avatar_position}
              currentScale={instructor.avatar_scale}
            />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Bio</label>
              <textarea
                name="bio"
                defaultValue={instructor.bio ?? ''}
                rows={6}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-y"
                placeholder="Write a short bio for your public profile…"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
              Save profile
            </button>
          </form>
        </section>

        {/* Contact info */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Contact Info</h2>
          <ProfileForm
            initialEmail={profile?.email ?? null}
            initialPhone={profile?.phone ?? null}
            initialEmergencyName={profile?.emergency_name ?? null}
            initialEmergencyRelationship={profile?.emergency_relationship ?? null}
            initialEmergencyPhone={profile?.emergency_phone ?? null}
            onUpdateProfile={updateProfile}
          />
        </section>

        {/* Certifications */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Certifications</h2>
          <CertGrid initialCerts={certs ?? []} actions={{ upsertCert, deleteCert, addCertDocument, deleteCertDocument }} />
        </section>

        {/* Teaching expertise (read-only — set by admin) */}
        {capabilities.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-1">Teaching Expertise</h2>
            <p className="text-xs text-zinc-500 mb-4">Set by your administrator.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CAPABILITY_ORDER
                .filter(cat => capabilities.some(c => c.category === cat))
                .map(cat => {
                  const role = capabilities.find(c => c.category === cat)?.role
                  return (
                    <div key={cat} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900">
                      <div className="text-sm font-medium text-white mb-2">{CAPABILITY_META[cat].label}</div>
                      <div className="flex gap-1.5">
                        {(['lead', 'assist'] as const).map(r => (
                          <span key={r} className={`flex-1 px-2 py-1 rounded text-xs font-medium capitalize text-center ${
                            role === r
                              ? r === 'lead'
                                ? 'bg-teal-900/40 border border-teal-700 text-teal-300'
                                : 'bg-blue-900/40 border border-blue-700 text-blue-300'
                              : 'bg-zinc-800 text-zinc-600'
                          }`}>{r}</span>
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
      <button type="submit" className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors">
        Sign out
      </button>
    </form>
  )
}
