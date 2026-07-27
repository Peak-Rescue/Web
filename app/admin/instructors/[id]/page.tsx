import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CertGrid from '@/app/instructor/CertGrid'
import ProfileForm from '@/app/instructor/ProfileForm'
import AvatarEditor from '@/components/AvatarEditor'
import SaveButton from '@/components/SaveButton'
import CapabilityPanel from '@/app/admin/instructors/CapabilityPanel'
import TeamPageToggle from '@/app/admin/instructors/TeamPageToggle'
import ExemptToggle from '@/app/admin/instructors/ExemptToggle'
import DeleteInstructorButton from '@/app/admin/instructors/DeleteInstructorButton'
import { InviteButton } from '@/app/admin/instructors/InviteButton'
import {
  adminUpsertCert,
  adminDeleteCert,
  adminAddCertDocument,
  adminDeleteCertDocument,
  adminUpdateProfile,
  adminUpdateInstructorProfile,
  adminUpdateInstructorEmail,
  adminSendInvite,
} from './actions'

type InviteStatus = 'active' | 'invited' | 'not_invited'

export default async function AdminInstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // instructors.id

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: callerProfile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  // Look up by instructors.id (the URL param)
  const { data: instructor } = await admin
    .from('instructors')
    .select('id, name, email, slug, profile_id, invite_sent_at, show_on_team_page, bio, avatar, avatar_position, avatar_scale, instructor_capabilities(category, role)')
    .eq('id', id)
    .single()

  if (!instructor) notFound()

  // Get linked profile if it exists
  const profile = instructor.profile_id
    ? (await admin
        .from('profiles')
        .select('id, first_name, last_name, email, phone, role, emergency_name, emergency_relationship, emergency_phone, is_exempt')
        .eq('id', instructor.profile_id)
        .single()).data
    : null

  // Get certs if profile is linked
  const { data: certs } = profile
    ? await admin
        .from('instructor_certs')
        .select('id, cert_type, level, expires_at, notes, instructor_cert_documents(id, url, file_name, created_at)')
        .eq('instructor_id', profile.id)
        .order('cert_type')
    : { data: [] }

  const inviteStatus: InviteStatus = instructor.profile_id
    ? 'active'
    : instructor.invite_sent_at
      ? 'invited'
      : 'not_invited'

  const capabilities = (instructor.instructor_capabilities ?? []) as { category: string; role: string }[]
  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
    : instructor.name

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href="/admin/instructors" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← All Instructor Profiles
          </Link>
          <div className="flex items-center gap-3 mt-3">
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {inviteStatus === 'active' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-teal-900/60 text-teal-300">Active</span>
            )}
            {inviteStatus === 'invited' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-900/60 text-yellow-300">Invite sent</span>
            )}
            {inviteStatus === 'not_invited' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-400">Not invited</span>
            )}
          </div>
          {instructor.email && <p className="text-zinc-400 mt-1">{instructor.email}</p>}
        </div>

        {/* Active — option to send a sign-in link */}
        {inviteStatus === 'active' && instructor.email && (
          <div className="mb-10 px-4 py-4 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Portal account active</p>
              <p className="text-xs text-zinc-500 mt-0.5">Send a sign-in link if they need access to their account.</p>
            </div>
            <InviteButton
              action={adminSendInvite.bind(null, instructor.id)}
              label="Send sign-in link"
              className="shrink-0 px-4 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors"
            />
          </div>
        )}

        {/* Invite banner for instructors without a portal account */}
        {inviteStatus !== 'active' && (
          <div className="mb-10 px-4 py-4 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                {inviteStatus === 'invited' ? 'Waiting for instructor to accept their invite' : 'This instructor doesn\'t have a portal account yet'}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {inviteStatus === 'invited'
                  ? 'Contact info and certifications will be available once they log in.'
                  : 'Send an invite so they can set up their profile and access course materials.'}
              </p>
            </div>
            {inviteStatus === 'not_invited' && instructor.email && (
              <InviteButton
                action={adminSendInvite.bind(null, instructor.id)}
                label="Send invite"
                className="shrink-0 px-4 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors"
              />
            )}
            {inviteStatus === 'invited' && (
              <InviteButton
                action={adminSendInvite.bind(null, instructor.id)}
                label="Resend invite"
                className="shrink-0 px-4 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors"
              />
            )}
          </div>
        )}

        {/* Email — separate form so it can't be nested */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Portal Email</h2>
          <form action={adminUpdateInstructorEmail.bind(null, instructor.id)} className="flex gap-2 items-end p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Invite / portal email</label>
              <input
                type="email"
                name="email"
                defaultValue={instructor.email ?? ''}
                placeholder="instructor@peak-rescue.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <SaveButton className="px-3 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors shrink-0">
              Save
            </SaveButton>
          </form>
        </section>

        {/* Public profile — bio + photo */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Public Profile</h2>
          <form action={adminUpdateInstructorProfile.bind(null, instructor.id)} className="space-y-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
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
                placeholder="Write a short bio for the public profile…"
              />
            </div>
            <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
              Save profile
            </SaveButton>
          </form>
        </section>

        {profile ? (
          <>
            <section className="mb-10">
              <h2 className="text-lg font-semibold mb-4">Contact Info</h2>
              <ProfileForm
                initialEmail={profile.email ?? null}
                initialPhone={profile.phone ?? null}
                initialEmergencyName={profile.emergency_name ?? null}
                initialEmergencyRelationship={profile.emergency_relationship ?? null}
                initialEmergencyPhone={profile.emergency_phone ?? null}
                onUpdateProfile={adminUpdateProfile.bind(null, profile.id)}
              />
            </section>

            <section className="mb-10">
              <h2 className="text-lg font-semibold mb-4">Certifications</h2>
              <CertGrid
                initialCerts={certs ?? []}
                actions={{
                  upsertCert: adminUpsertCert.bind(null, profile.id),
                  deleteCert: adminDeleteCert.bind(null, profile.id),
                  addCertDocument: adminAddCertDocument.bind(null, profile.id),
                  deleteCertDocument: adminDeleteCertDocument.bind(null, profile.id),
                }}
              />
            </section>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-zinc-500 border border-zinc-800 rounded-lg">
            Contact info and certifications will appear here once the instructor logs in.
          </div>
        )}

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Team Page</h2>
          <TeamPageToggle instructorId={instructor.id} initialValue={instructor.show_on_team_page} />
        </section>

        {profile && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Employment</h2>
            <ExemptToggle profileId={profile.id} initialValue={profile.is_exempt ?? false} />
          </section>
        )}

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Expertise</h2>
          <CapabilityPanel
            instructorId={instructor.id}
            initialCapabilities={capabilities as Parameters<typeof CapabilityPanel>[0]['initialCapabilities']}
          />
        </section>

        <div className="mt-16 pt-8 border-t border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-400">Delete instructor</p>
            <p className="text-xs text-zinc-600 mt-0.5">Permanently removes this record. Cannot be undone.</p>
          </div>
          <DeleteInstructorButton instructorId={instructor.id} displayName={displayName} />
        </div>
      </div>
    </main>
  )
}
