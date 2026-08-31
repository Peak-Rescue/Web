import { createAdminClient } from '@/lib/supabase/admin'
import { courseSubtitle } from '@/lib/course-access'
import { courseDisplayName } from '@/lib/courses'
import type { WaiverPdfData } from '@/lib/waiver-pdf'
import { matchSignature, type MatchCandidate, type WaiverBody, type WaiverPrefill, type SignedWaiver } from '@/lib/waiver'
import { normalizeEmail } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

// Reading a course's waiver and one student's standing on it.
//
// Kept out of the server-action file so the course page can call it directly
// while rendering, rather than reaching through an action that exists to be
// posted to.

export type CourseWaiverVersion = {
  versionId: string
  templateName: string
  body: WaiverBody
}

/**
 * The waiver this course uses, at the version a signer would be shown now.
 * Null when the course has no waiver attached — a setup gap, not an error, so
 * the page simply doesn't ask for one.
 */
export async function courseWaiverVersion(
  instanceId: string,
  admin: Admin = createAdminClient()
): Promise<CourseWaiverVersion | null> {
  const { data: inst } = await admin
    .from('course_instances')
    .select('waiver_template_id')
    .eq('id', instanceId)
    .single()
  if (!inst?.waiver_template_id) return null

  const { data: template } = await admin
    .from('waiver_templates')
    .select('name, current_version_id')
    .eq('id', inst.waiver_template_id)
    .single()
  if (!template?.current_version_id) return null

  const { data: version } = await admin
    .from('waiver_template_versions')
    .select('id, body')
    .eq('id', template.current_version_id)
    .single()
  if (!version) return null

  return {
    versionId: version.id,
    templateName: template.name,
    body: version.body as WaiverBody,
  }
}

const str = (v: string | null | undefined) => v ?? ''

/**
 * Everything the course page needs to show one student their waiver: the
 * document, whether they've signed this course, and a prefilled form if not.
 *
 * Returns null when there's nothing to show — no waiver on the course, or the
 * viewer isn't a student on it. Instructors and admins aren't asked to sign;
 * they track who has from the admin side.
 */
export async function loadStudentWaiver(
  instanceId: string,
  userId: string,
  admin: Admin = createAdminClient()
): Promise<{
  version: CourseWaiverVersion
  signed: SignedWaiver | null
  prefill: WaiverPrefill
} | null> {
  // Enrollment first, and asked at the same time as the document. Building the
  // version is three lookups deep — course, template, current version — and
  // everyone running the course pays for all three before the enrollment check
  // throws the answer away. The two questions don't depend on each other, so
  // whichever says no ends it.
  const [version, { data: enrollment }] = await Promise.all([
    courseWaiverVersion(instanceId, admin),
    admin
      .from('enrollments')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (!version || !enrollment) return null

  const [{ data: existing }, { data: profile }, { data: previous }] = await Promise.all([
    // This course, latest first: a re-signed waiver supersedes rather than
    // replaces, so the newest row is the one that counts.
    admin
      .from('waiver_signatures')
      .select('id, signed_at, first_name, last_name, signer_role, guardian_first_name, guardian_last_name')
      .eq('instance_id', instanceId)
      .eq('profile_id', userId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('first_name, last_name, email, phone, emergency_name, emergency_relationship, emergency_phone')
      .eq('id', userId)
      .single(),
    // Their last waiver on any course. Profiles hold no date of birth and no
    // address, so without this a returning student retypes both every time.
    admin
      .from('waiver_signatures')
      .select('first_name, middle_name, last_name, phone, date_of_birth, claim_email, address_line1, address_line2, city, state, postal_code, country, emergency_first_name, emergency_last_name, emergency_phone, emergency_relationship')
      .eq('profile_id', userId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // The emergency contact is one name on the profile and two columns on a
  // waiver, so a profile-only fallback has to be split back apart.
  const [profileEmergencyFirst, ...profileEmergencyRest] = str(profile?.emergency_name).trim().split(/\s+/)

  const prefill: WaiverPrefill = {
    // The profile wins on name and email — it's what they log in as and what
    // the roster shows. Everything the profile doesn't hold comes from their
    // last waiver.
    firstName: str(profile?.first_name) || str(previous?.first_name),
    middleName: str(previous?.middle_name),
    lastName: str(profile?.last_name) || str(previous?.last_name),
    phone: str(profile?.phone) || str(previous?.phone),
    email: str(profile?.email) || str(previous?.claim_email),
    dateOfBirth: str(previous?.date_of_birth),
    addressLine1: str(previous?.address_line1),
    addressLine2: str(previous?.address_line2),
    city: str(previous?.city),
    state: str(previous?.state),
    postalCode: str(previous?.postal_code),
    country: str(previous?.country) || 'United States',
    emergencyFirstName: str(previous?.emergency_first_name) || str(profileEmergencyFirst),
    emergencyLastName: str(previous?.emergency_last_name) || profileEmergencyRest.join(' '),
    emergencyPhone: str(previous?.emergency_phone) || str(profile?.emergency_phone),
    emergencyRelationship:
      str(previous?.emergency_relationship) || str(profile?.emergency_relationship),
  }

  const signed: SignedWaiver | null = existing
    ? {
        id: existing.id,
        signedAt: existing.signed_at,
        name: [existing.first_name, existing.last_name].filter(Boolean).join(' '),
        templateName: version.templateName,
        signerRole: existing.signer_role as 'adult' | 'guardian',
        guardianName:
          [existing.guardian_first_name, existing.guardian_last_name].filter(Boolean).join(' ') || null,
      }
    : null

  return { version, signed, prefill }
}

// ─── Feeding the profile back ───────────────────────────────────────────────

/**
 * Copy the contact details from a signature onto the signer's profile.
 *
 * A waiver is the most deliberate, most recent statement someone makes about
 * how to reach them and who to call — better evidence than a profile field
 * they filled in once at signup and never looked at again. So a filled-in
 * value wins over what's already there.
 *
 * What it will never do is blank something out. An emergency contact left
 * empty on the waiver means "I didn't type it", not "I no longer have one",
 * and treating those the same is how a phone number nobody notices is missing
 * turns into a real problem on a real course.
 *
 * Only ever the participant's own details. A guardian's phone number belongs
 * to the guardian, not to the account of the student they signed for.
 *
 * Fails quietly by design: the signature is the record and it is already
 * written. A profile that didn't update is worth fixing later; a valid waiver
 * reported to the signer as failed is not recoverable at all.
 */
export async function syncProfileFromWaiver(
  userId: string,
  details: {
    phone?: string | null
    emergencyFirstName?: string | null
    emergencyLastName?: string | null
    emergencyPhone?: string | null
    emergencyRelationship?: string | null
  },
  admin: Admin = createAdminClient()
): Promise<void> {
  const clean = (v: string | null | undefined) => v?.trim() || null

  const emergencyName =
    [clean(details.emergencyFirstName), clean(details.emergencyLastName)]
      .filter(Boolean)
      .join(' ') || null

  const patch: Record<string, string> = {}
  const put = (column: string, value: string | null) => {
    if (value) patch[column] = value
  }
  put('phone', clean(details.phone))
  put('emergency_name', emergencyName)
  put('emergency_phone', clean(details.emergencyPhone))
  put('emergency_relationship', clean(details.emergencyRelationship))

  if (Object.keys(patch).length === 0) return

  try {
    await admin.from('profiles').update(patch).eq('id', userId)
  } catch {
    // Deliberately swallowed — see above.
  }
}

// ─── The signed copy ────────────────────────────────────────────────────────

/**
 * Everything needed to render one signature as a PDF.
 *
 * Deliberately not stored anywhere. The row is immutable and the text it
 * points at is frozen, so the document regenerates identically whenever it's
 * asked for — keeping a second copy in a bucket would only add somewhere for
 * the two to disagree, and something else to keep private.
 */
export async function loadWaiverPdfData(
  signatureId: string,
  admin: Admin = createAdminClient()
): Promise<WaiverPdfData | null> {
  const { data: sig } = await admin
    .from('waiver_signatures')
    .select('*')
    .eq('id', signatureId)
    .maybeSingle()
  if (!sig) return null

  // The version and its template are read separately rather than embedded:
  // there are two foreign keys between these tables — a version belongs to a
  // template, and a template points at its current version — so an embed is
  // ambiguous and PostgREST refuses it outright.
  const [{ data: version, error: versionError }, { data: inst }] = await Promise.all([
    admin
      .from('waiver_template_versions')
      .select('version, body, template_id')
      .eq('id', sig.version_id)
      .single(),
    admin
      .from('course_instances')
      .select('course_type, custom_title, starts_at, ends_at, location, client_name')
      .eq('id', sig.instance_id)
      .single(),
  ])
  // Loudly: returning null here means a signed waiver can't be produced, and
  // the last time that happened quietly it looked like two unrelated bugs.
  if (versionError) console.error('Waiver version lookup failed:', versionError.message)
  if (!version || !inst) return null

  const { data: template } = await admin
    .from('waiver_templates')
    .select('name')
    .eq('id', version.template_id)
    .maybeSingle()

  return {
    courseTitle: courseDisplayName(inst.course_type, inst.custom_title),
    courseSubtitle: courseSubtitle(inst),
    templateName: template?.name ?? 'Liability waiver',
    version: version.version,
    body: version.body as WaiverBody,

    signerRole: sig.signer_role,
    firstName: sig.first_name,
    middleName: sig.middle_name,
    lastName: sig.last_name,
    phone: sig.phone,
    dateOfBirth: sig.date_of_birth,
    email: sig.claim_email,

    guardianFirstName: sig.guardian_first_name,
    guardianMiddleName: sig.guardian_middle_name,
    guardianLastName: sig.guardian_last_name,
    guardianPhone: sig.guardian_phone,
    guardianDob: sig.guardian_dob,

    addressLine1: sig.address_line1,
    addressLine2: sig.address_line2,
    city: sig.city,
    state: sig.state,
    postalCode: sig.postal_code,
    country: sig.country,

    emergencyFirstName: sig.emergency_first_name,
    emergencyLastName: sig.emergency_last_name,
    emergencyPhone: sig.emergency_phone,
    emergencyRelationship: sig.emergency_relationship,

    initialsImage: sig.initials_image,
    signatureImage: sig.signature_image,
    signedAt: sig.signed_at,
    ipAddress: sig.ip_address,
    identity: sig.identity,
    source: sig.source,
  }
}

// ─── Waivers waiting for a person ───────────────────────────────────────────

/**
 * Attach any unclaimed waivers signed under this address to the account that
 * has just been created for it.
 *
 * This is the last rung of the ladder: somebody signed at the tailgate with no
 * login, got invited a week later, and their waiver finds them without anyone
 * re-doing paperwork. It runs at enrollment, so the enrollment it should point
 * at already exists.
 *
 * Matching on email alone is safe here in a way it isn't on the public page:
 * the person controls this mailbox — they were just invited through it and
 * proved it to sign in. That is a stronger claim than a name typed on a form.
 *
 * Returns how many were claimed, for the caller that wants to say so.
 */
export async function claimWaiversForEmail(
  userId: string,
  email: string,
  admin: Admin = createAdminClient()
): Promise<number> {
  const claimEmail = normalizeEmail(email)

  const { data: waiting } = await admin
    .from('waiver_signatures')
    .select('id, instance_id')
    .eq('claim_email', claimEmail)
    .is('profile_id', null)
  if (!waiting?.length) return 0

  // One lookup for the courses involved rather than one per waiver — somebody
  // signing at three tailgates is rare, but the query shouldn't scale with it.
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('id, instance_id')
    .eq('user_id', userId)
    .in('instance_id', [...new Set(waiting.map((w) => w.instance_id))])
  const enrollmentFor = new Map((enrollments ?? []).map((e) => [e.instance_id, e.id]))

  let claimed = 0
  for (const w of waiting) {
    const { error } = await admin
      .from('waiver_signatures')
      .update({
        profile_id: userId,
        // Null when they signed for a course they were never enrolled on. The
        // waiver is still theirs and still valid; it just isn't a seat.
        enrollment_id: enrollmentFor.get(w.instance_id) ?? null,
        link_method: 'claim_signup',
        linked_at: new Date().toISOString(),
      })
      .eq('id', w.id)
    if (!error) claimed++
  }
  return claimed
}

/**
 * Signatures on a course that aren't attached to anybody, each with the
 * enrolled students they might belong to.
 *
 * This is the queue that stops the QR path losing people quietly. Anything the
 * matcher declined to decide lands here rather than being guessed at, and the
 * suggestions are ranked for someone who knows the course by sight.
 */
export async function loadUnmatchedWaivers(
  instanceId: string,
  admin: Admin = createAdminClient()
): Promise<{
  id: string
  name: string
  email: string
  signedAt: string
  source: 'portal' | 'qr'
  suggestions: { enrollmentId: string; profileId: string; name: string; email: string | null }[]
}[]> {
  const { data: orphans } = await admin
    .from('waiver_signatures')
    .select('id, first_name, last_name, claim_email, signed_at, source')
    .eq('instance_id', instanceId)
    .is('enrollment_id', null)
    .order('signed_at', { ascending: false })
  if (!orphans?.length) return []

  const [{ data: enrollments }, { data: signed }] = await Promise.all([
    admin
      .from('enrollments')
      .select('id, user_id, profiles(first_name, last_name, email)')
      .eq('instance_id', instanceId),
    admin
      .from('waiver_signatures')
      .select('enrollment_id')
      .eq('instance_id', instanceId)
      .not('enrollment_id', 'is', null),
  ])

  const taken = new Set((signed ?? []).map((s) => s.enrollment_id))
  const candidates: MatchCandidate[] = ((enrollments ?? []) as unknown as {
    id: string; user_id: string
    profiles: { first_name: string | null; last_name: string | null; email: string | null } | null
  }[]).map((e) => ({
    enrollmentId: e.id,
    profileId: e.user_id,
    email: e.profiles?.email ?? null,
    firstName: e.profiles?.first_name ?? null,
    lastName: e.profiles?.last_name ?? null,
    hasSigned: taken.has(e.id),
  }))

  const nameOf = (c: MatchCandidate) =>
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Unnamed'

  return orphans.map((o) => {
    const result = matchSignature(
      { email: o.claim_email, firstName: o.first_name, lastName: o.last_name },
      candidates
    )
    // Anything still here was declined by the matcher, so 'matched' can only
    // mean it became decidable after the fact — show it first either way.
    const suggestions =
      result.kind === 'matched' ? [result.candidate] : result.suggestions
    return {
      id: o.id,
      name: [o.first_name, o.last_name].filter(Boolean).join(' '),
      email: o.claim_email,
      signedAt: o.signed_at,
      source: o.source as 'portal' | 'qr',
      suggestions: suggestions.slice(0, 5).map((c) => ({
        enrollmentId: c.enrollmentId,
        profileId: c.profileId,
        name: nameOf(c),
        email: c.email,
      })),
    }
  })
}

// ─── The public QR token ────────────────────────────────────────────────────

export type PublicWaiverTarget = {
  instanceId: string
  courseTitle: string
  courseSubtitle: string | null
  templateName: string
  body: WaiverBody
  versionId: string
}

/**
 * Resolve a QR token to the course and waiver behind it.
 *
 * Expiry is judged here rather than in the page that renders it: "what time is
 * it" is not a question a component may ask while rendering, and both the page
 * and the action that accepts a signature need the same answer anyway.
 *
 * The three failures are told apart because they need different words from
 * whoever is standing there holding a phone.
 */
export async function resolvePublicWaiverToken(
  token: string,
  admin: Admin = createAdminClient()
): Promise<
  | { ok: true; target: PublicWaiverTarget }
  | { ok: false; reason: 'unknown' | 'expired' | 'no-waiver' }
> {
  const { data: course } = await admin
    .from('course_instances')
    .select('id, course_type, custom_title, starts_at, ends_at, location, client_name, waiver_token_expires_at')
    .eq('waiver_token', token)
    .maybeSingle()
  if (!course) return { ok: false, reason: 'unknown' }

  if (
    course.waiver_token_expires_at &&
    new Date(course.waiver_token_expires_at).getTime() < Date.now()
  ) {
    return { ok: false, reason: 'expired' }
  }

  const waiver = await courseWaiverVersion(course.id, admin)
  if (!waiver) return { ok: false, reason: 'no-waiver' }

  return {
    ok: true,
    target: {
      instanceId: course.id,
      courseTitle: courseDisplayName(course.course_type, course.custom_title),
      courseSubtitle: courseSubtitle(course),
      templateName: waiver.templateName,
      body: waiver.body,
      versionId: waiver.versionId,
    },
  }
}
