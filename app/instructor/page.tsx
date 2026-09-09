import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signCertDocs } from '@/lib/cert-docs'
import CertGrid from './CertGrid'
import ProfileForm from './ProfileForm'
import AvatarEditor from '@/components/AvatarEditor'
import InfoHint from '@/components/InfoHint'
import SaveButton from '@/components/SaveButton'
import { upsertCert, deleteCert, addCertDocument, deleteCertDocument, updateProfile, updateInstructorProfile, updateCalendarInvites, updateCourseAlerts, updateStudentContact } from './actions'
import { workEmail } from '@/lib/contacts'
import CourseAlertsForm from './CourseAlertsForm'
import { signOut } from '@/app/actions'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

export default async function InstructorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: instructor }] = await Promise.all([
    admin.from('profiles').select('role, first_name, last_name, email, phone, emergency_name, emergency_relationship, emergency_phone').eq('id', user.id).single(),
    admin.from('instructors').select('id, name, email, bio, avatar, avatar_position, avatar_scale, calendar_invites, show_email, show_phone, course_alert_muted_disciplines, course_alert_muted_sectors, instructor_capabilities(category, role)').eq('profile_id', user.id).maybeSingle(),
  ])

  if (!instructor) redirect('/dashboard')



  const { data: certs } = await admin
    .from('instructor_certs')
    .select('id, cert_type, level, expires_at, notes, instructor_cert_documents(id, url, file_name, created_at)')
    .eq('instructor_id', user.id)
    .order('cert_type')

  // cert-documents is a private bucket — hand the UI short-lived signed URLs.
  const certsWithDocs = await Promise.all(
    (certs ?? []).map(async (c) => ({
      ...c,
      instructor_cert_documents: await signCertDocs(admin, c.instructor_cert_documents ?? []),
    }))
  )

  const capabilities = (instructor.instructor_capabilities ?? []) as { category: string; role: string }[]

  // A switch that cannot do anything is worse than no switch: the domain rule
  // decides this one, and the box says so rather than pretending to.
  const hasWorkEmail = Boolean(workEmail(instructor.email))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
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
            <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
              Save profile
            </SaveButton>
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

        {/* What the students on your courses can see of you.
            Two questions, one screen, because they are the same question
            asked about two things — and both were previously answered for
            you: the phone by a column nothing could set, the email by a rule
            about the address rather than about the person. */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Share your contact info with students</h2>
          <form action={updateStudentContact} className="p-6 bg-zinc-900 rounded-lg border border-zinc-800 space-y-3">
            {/* No sentence under the heading, and no verb on the boxes. The
                heading is the question — two words naming what is being
                shared is the whole answer — and the crew seeing it regardless
                is a why, which lives in the hint. */}
            {/* A disabled box posts nothing, and nothing reads as "off" —
                which would quietly answer a question this person was never
                allowed to be asked. The stored value rides along instead. */}
            {!hasWorkEmail && (
              <input type="hidden" name="show_email" value={instructor.show_email === false ? 'off' : 'on'} />
            )}
            <label className={`flex items-start gap-3 ${hasWorkEmail ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                name="show_email"
                defaultChecked={instructor.show_email !== false}
                disabled={!hasWorkEmail}
                className="mt-0.5 w-4 h-4 accent-pr-red shrink-0"
              />
              <span className="text-sm inline-flex items-center gap-1.5">
                Email
                <InfoHint
                  text={hasWorkEmail
                    ? 'On your card on the courses you are staffed on. The crew see it either way; off, students get your name and role and no address.'
                    : 'Only a peak-rescue.com address is ever shown to students — a personal one is never put on a card, so there is nothing to turn on here.'}
                />
              </span>
            </label>

            {!profile?.phone && (
              <input type="hidden" name="show_phone" value={instructor.show_phone ? 'on' : 'off'} />
            )}
            <label className={`flex items-start gap-3 ${profile?.phone ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                name="show_phone"
                defaultChecked={Boolean(instructor.show_phone)}
                disabled={!profile?.phone}
                className="mt-0.5 w-4 h-4 accent-pr-red shrink-0"
              />
              <span className="text-sm inline-flex items-center gap-1.5">
                Phone number
                <InfoHint
                  text={profile?.phone
                    ? 'The number on your profile above, on the card students read at a trailhead. The crew see it either way. Off by default, because every number we hold is a personal mobile.'
                    : 'There is no number on your profile yet. Add one above and this becomes available.'}
                />
              </span>
            </label>

            <div className="pt-1">
              <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                Save
              </SaveButton>
            </div>
          </form>
        </section>

        {/* Calendar */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Calendar</h2>
          <form action={updateCalendarInvites} className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="calendar_invites"
                defaultChecked={instructor.calendar_invites}
                className="mt-0.5 w-4 h-4 accent-pr-red shrink-0"
              />
              <span className="text-sm inline-flex items-center gap-1.5">
                Send me Google Calendar invites for my courses
                <InfoHint text="One invitation per course you're staffed on. Turn it off if you already subscribe to the Peak Rescue course calendars, or your courses show up twice. The portal emails you when a course is scheduled, moved or cancelled either way." />
              </span>
            </label>
            <div className="mt-4">
              <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                Save
              </SaveButton>
            </div>
          </form>
        </section>

        {/* New-course alerts — admins only, because nobody else can act on a
            course that has only just been written down. */}
        {profile?.role === 'admin' && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">New Course Alerts</h2>
            <CourseAlertsForm
              action={updateCourseAlerts}
              mutedDisciplines={instructor.course_alert_muted_disciplines ?? []}
              mutedSectors={instructor.course_alert_muted_sectors ?? []}
            />
          </section>
        )}

        {/* Certifications */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Certifications</h2>
          <CertGrid initialCerts={certsWithDocs} actions={{ upsertCert, deleteCert, addCertDocument, deleteCertDocument }} />
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
