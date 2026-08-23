import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseAccess, courseSubtitle } from '@/lib/course-access'
import { courseDisplayName } from '@/lib/courses'
import { loadCoursePerson } from '@/lib/people'

// One student on one course, for the people running it.
//
// Staff only, and never the student's own page: it carries a date of birth, a
// home address and a next of kin, which the person it describes already knows
// and nobody else on the course has any business reading.

export const metadata = { robots: { index: false, follow: false } }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-200 mt-0.5">{children}</dd>
    </div>
  )
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

/** A stored yyyy-mm-dd, read as a calendar date rather than a moment. */
function plainDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

export default async function CoursePersonPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>
}) {
  const { id, enrollmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const access = await courseAccess(admin, user.id, id)
  if (!access.allowed || !access.isStaff) notFound()

  const person = await loadCoursePerson(id, enrollmentId, admin)
  if (!person) notFound()

  const { data: inst } = await admin
    .from('course_instances')
    .select('course_type, custom_title, starts_at, ends_at, location, client_name')
    .eq('id', id)
    .single()

  const w = person.waiver

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          href={`/portal/${id}#roster`}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
        >
          ← {inst ? courseDisplayName(inst.course_type, inst.custom_title) : 'Back to the course'}
        </Link>

        <h1 className="text-3xl font-bold">{person.name}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {inst ? courseSubtitle(inst) : null}
          {person.enrolledAt && ` · enrolled ${longDate(person.enrolledAt)}`}
        </p>

        {/* Reaching them, and reaching someone else about them. Together at the
            top because they are the two things looked up in a hurry. */}
        <div className="grid sm:grid-cols-2 gap-3 mt-6">
          <dl className="rounded-lg border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
            <Field label="Email">
              {person.email
                ? <a href={`mailto:${person.email}`} className="hover:text-white transition-colors">{person.email}</a>
                : <span className="text-zinc-500">Not on file</span>}
            </Field>
            <Field label="Phone">
              {person.phone
                ? <a href={`tel:${person.phone}`} className="hover:text-white transition-colors">{person.phone}</a>
                : <span className="text-zinc-500">Not on file</span>}
            </Field>
            {person.waiverDetails && (
              <Field label="Date of birth">{plainDate(person.waiverDetails.dateOfBirth)}</Field>
            )}
          </dl>

          <dl className={`rounded-lg border divide-y divide-zinc-800 ${
            person.emergencyPhone ? 'border-zinc-800 bg-zinc-900' : 'border-amber-900/70 bg-amber-950/20'
          }`}>
            <Field label="Emergency contact">
              {person.emergencyName ?? <span className="text-amber-300">Nobody on file</span>}
              {person.emergencyRelationship && (
                <span className="text-zinc-500"> · {person.emergencyRelationship}</span>
              )}
            </Field>
            <Field label="Emergency phone">
              {person.emergencyPhone
                ? <a href={`tel:${person.emergencyPhone}`} className="hover:text-white transition-colors">{person.emergencyPhone}</a>
                : <span className="text-amber-300">Nobody on file</span>}
            </Field>
          </dl>
        </div>

        {/* This course's waiver — the reason most people open this page. */}
        <h2 className="text-sm font-semibold text-zinc-300 mt-8 mb-2">Waiver for this course</h2>
        {w ? (
          <div className="rounded-lg border border-teal-900 bg-teal-950/30 px-4 py-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-teal-400">✓</span>
              <span className="text-sm text-teal-200">{w.templateName}</span>
              <a
                href={`/api/waivers/${w.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-teal-300 hover:text-teal-100 underline transition-colors"
              >
                Open the signed copy
              </a>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {w.signerRole === 'guardian' && w.guardianName
                ? `Signed by ${w.guardianName} as guardian`
                : 'Signed'} on {longDate(w.signedAt)}
              {w.identity === 'unverified' && (
                <span className="text-amber-400"> · self-entered via QR, not signed in</span>
              )}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-900/70 bg-amber-950/20 px-4 py-3">
            <p className="text-sm text-amber-200">Not signed</p>
            <p className="text-xs text-zinc-400 mt-1">
              It’s waiting on their course page. They can also sign on the day using the course QR
              code, under the waiver section of the admin page.
            </p>
          </div>
        )}

        {person.supersededWaivers.length > 0 && (
          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
            <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">
              Also signed for this course
            </p>
            {person.supersededWaivers.map((s) => (
              <div key={s.id} className="flex items-baseline gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300">{s.templateName}</p>
                  <p className="text-[11px] text-zinc-500">
                    {longDate(s.signedAt)}
                    {s.signerRole === 'guardian' && s.guardianName && ` · signed by ${s.guardianName}`}
                    {s.identity === 'unverified' ? ' · self-entered via QR' : ' · signed in to the portal'}
                    {' · superseded'}
                  </p>
                </div>
                <a
                  href={`/api/waivers/${s.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto shrink-0 text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
                >
                  PDF
                </a>
              </div>
            ))}
          </div>
        )}

        {person.waiverDetails && person.waiverDetails.address.length > 0 && (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Address given on the waiver</p>
            <p className="text-sm text-zinc-300 mt-1">
              {person.waiverDetails.address.map((line, i) => <span key={i} className="block">{line}</span>)}
            </p>
          </div>
        )}

        {/* Context, not the answer: everything else they have done with us. */}
        {person.history.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-zinc-300 mt-8 mb-2">
              Their other courses
            </h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
              {person.history.map((c) => (
                <div key={c.instanceId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/portal/${c.instanceId}`}
                      className="text-sm text-zinc-200 hover:text-white transition-colors"
                    >
                      {c.title}
                    </Link>
                    <p className="text-[11px] text-zinc-500">
                      {c.refNumber && `PR-${String(c.refNumber).padStart(4, '0')} · `}
                      {c.startsAt ? longDate(c.startsAt) : 'No dates'}
                      {c.status === 'cancelled' && ' · cancelled'}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    {c.waiver ? (
                      <a
                        href={`/api/waivers/${c.waiver.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
                      >
                        Waiver
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-600">No waiver</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
