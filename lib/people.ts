import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName } from '@/lib/courses'

type Admin = ReturnType<typeof createAdminClient>

// One person, as the people running a course need to see them.
//
// The shape follows what an instructor actually asks, in the order they ask
// it: how do I reach them, who do I call if it goes wrong, have they signed —
// and only then, have we had them before. The history is real context (a
// returning student, a waiver signed last year) but it is never the answer to
// the question that made someone open the page.

export type PersonWaiver = {
  id: string
  signedAt: string
  identity: 'authenticated' | 'unverified'
  source: 'portal' | 'qr'
  signerRole: 'adult' | 'guardian'
  guardianName: string | null
  templateName: string
}

export type PersonCourse = {
  instanceId: string
  refNumber: number | null
  title: string
  startsAt: string | null
  endsAt: string | null
  status: string
  waiver: PersonWaiver | null
}

export type CoursePerson = {
  enrollmentId: string
  profileId: string
  name: string
  email: string | null
  phone: string | null
  enrolledAt: string | null

  emergencyName: string | null
  emergencyPhone: string | null
  emergencyRelationship: string | null

  /** Their current waiver for the course you came from. */
  waiver: PersonWaiver | null
  /** Earlier ones for the same course, newest first. Signing again supersedes
      rather than replaces — a second waiver usually means somebody re-signed,
      or a walk-up was attached to a person who had already signed, and the
      record of what they agreed to the first time is not ours to hide. */
  supersededWaivers: PersonWaiver[]
  /** What the waiver recorded that a profile has nowhere to keep. */
  waiverDetails: {
    dateOfBirth: string
    address: string[]
  } | null

  /** Every other course they have been on, most recent first. */
  history: PersonCourse[]
}

/**
 * Everything logged about one person on one course.
 *
 * Returns null when the enrollment isn't on the course asked for, so a page
 * can't be talked into showing somebody from a different delivery by editing
 * the URL.
 */
export async function loadCoursePerson(
  instanceId: string,
  enrollmentId: string,
  admin: Admin = createAdminClient()
): Promise<CoursePerson | null> {
  const { data: enrollment } = await admin
    .from('enrollments')
    .select('id, user_id, instance_id, enrolled_at')
    .eq('id', enrollmentId)
    .maybeSingle()
  if (!enrollment || enrollment.instance_id !== instanceId) return null

  const [{ data: profile }, { data: signatures }, { data: enrollments }] = await Promise.all([
    admin
      .from('profiles')
      .select('first_name, last_name, email, phone, emergency_name, emergency_phone, emergency_relationship')
      .eq('id', enrollment.user_id)
      .single(),
    // Everything they have ever signed, by profile — a waiver signed at a
    // tailgate and claimed later belongs on this page too.
    admin
      .from('waiver_signatures')
      .select('id, instance_id, signed_at, identity, source, signer_role, guardian_first_name, guardian_last_name, date_of_birth, address_line1, address_line2, city, state, postal_code, country, version_id')
      .eq('profile_id', enrollment.user_id)
      .order('signed_at', { ascending: false }),
    admin
      .from('enrollments')
      .select('instance_id, enrolled_at')
      .eq('user_id', enrollment.user_id),
  ])

  // Template names, once, for however many waivers there are.
  const versionIds = [...new Set((signatures ?? []).map((s) => s.version_id))]
  const { data: versions } = versionIds.length
    ? await admin.from('waiver_template_versions').select('id, template_id').in('id', versionIds)
    : { data: [] }
  const templateIds = [...new Set((versions ?? []).map((v) => v.template_id))]
  const { data: templates } = templateIds.length
    ? await admin.from('waiver_templates').select('id, name').in('id', templateIds)
    : { data: [] }
  const templateOfVersion = new Map(
    (versions ?? []).map((v) => [
      v.id,
      (templates ?? []).find((t) => t.id === v.template_id)?.name ?? 'Liability waiver',
    ])
  )

  const toWaiver = (s: NonNullable<typeof signatures>[number]): PersonWaiver => ({
    id: s.id,
    signedAt: s.signed_at,
    identity: s.identity as 'authenticated' | 'unverified',
    source: s.source as 'portal' | 'qr',
    signerRole: s.signer_role as 'adult' | 'guardian',
    guardianName:
      [s.guardian_first_name, s.guardian_last_name].filter(Boolean).join(' ') || null,
    templateName: templateOfVersion.get(s.version_id) ?? 'Liability waiver',
  })

  // Latest per course decides what counts; the rest are kept to be shown.
  const latestByInstance = new Map<string, NonNullable<typeof signatures>[number]>()
  for (const s of signatures ?? []) {
    if (!latestByInstance.has(s.instance_id)) latestByInstance.set(s.instance_id, s)
  }
  const supersededHere = (signatures ?? []).filter(
    (s) => s.instance_id === instanceId && s.id !== latestByInstance.get(instanceId)?.id
  )

  const thisSignature = latestByInstance.get(instanceId) ?? null
  // Falls back to their most recent waiver anywhere: a date of birth doesn't
  // change between courses, and half a record reads as no record.
  const detailSource = thisSignature ?? (signatures ?? [])[0] ?? null

  const otherIds = (enrollments ?? [])
    .map((e) => e.instance_id)
    .filter((id) => id !== instanceId)
  const { data: courses } = otherIds.length
    ? await admin
        .from('course_instances')
        .select('id, ref_number, course_type, custom_title, starts_at, ends_at, status')
        .in('id', otherIds)
        .order('starts_at', { ascending: false, nullsFirst: false })
    : { data: [] }

  const history: PersonCourse[] = (courses ?? []).map((c) => {
    const sig = latestByInstance.get(c.id)
    return {
      instanceId: c.id,
      refNumber: c.ref_number,
      title: courseDisplayName(c.course_type, c.custom_title),
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      status: c.status,
      waiver: sig ? toWaiver(sig) : null,
    }
  })

  return {
    enrollmentId: enrollment.id,
    profileId: enrollment.user_id,
    name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Unnamed',
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    enrolledAt: enrollment.enrolled_at,
    emergencyName: profile?.emergency_name ?? null,
    emergencyPhone: profile?.emergency_phone ?? null,
    emergencyRelationship: profile?.emergency_relationship ?? null,
    waiver: thisSignature ? toWaiver(thisSignature) : null,
    supersededWaivers: supersededHere.map(toWaiver),
    waiverDetails: detailSource
      ? {
          dateOfBirth: detailSource.date_of_birth,
          address: [
            detailSource.address_line1,
            detailSource.address_line2,
            [detailSource.city, detailSource.state].filter(Boolean).join(', '),
            [detailSource.postal_code, detailSource.country].filter(Boolean).join('  '),
          ].filter((l): l is string => Boolean(l && l.trim())),
        }
      : null,
    history,
  }
}
