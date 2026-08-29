'use server'

import { after } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { normalizeEmail } from '@/lib/email'
import { isMinor, matchSignature, missingFieldsMessage, missingWaiverFields, type MatchCandidate } from '@/lib/waiver'
import { loadWaiverPdfData, resolvePublicWaiverToken } from '@/lib/waiver-data'
import type { WaiverInput } from '@/app/portal/[id]/waiver-actions'
import { sendMail } from '@/lib/mailer'

// Signing from the QR code, with no account.
//
// This exists because the alternative is worse. Someone turns up on day one
// who was added late, or whose login is broken, and the choice is between an
// unverified waiver and no waiver — and an unverified waiver is exactly what
// the old public form produced for everybody. So the bar here is the bar we
// already had; the portal path is the one that raised it.
//
// What this must never do is pretend. The row it writes says 'unverified', and
// says it on the PDF too. It also never creates an account: the invite token
// is the only thing that may do that, and a public page that mints users would
// punch straight through it.

export type PublicWaiverResult = {
  signatureId: string
  /** True when we could tie it to an enrolled student without guessing. */
  linked: boolean
}

export async function signWaiverPublicly(
  token: string,
  input: WaiverInput
): Promise<PublicWaiverResult> {
  const admin = createAdminClient()

  // Anyone who can photograph the QR can reach this, so it is capped the same
  // way the join form is: by token, by address, and by origin.
  const ip = await clientIp()
  const email = input.email?.trim() ?? ''
  const withinLimits =
    (await checkRateLimit(admin, 'waiver_token', token, { limit: 60, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'waiver_email', normalizeEmail(email), { limit: 3, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'waiver_ip', ip, { limit: 20, windowMinutes: 60 }))
  if (!withinLimits) {
    throw new Error('Too many attempts just now. Please try again shortly.')
  }

  const resolved = await resolvePublicWaiverToken(token, admin)
  if (!resolved.ok) {
    throw new Error(
      resolved.reason === 'expired'
        ? 'This waiver link has expired — please ask your instructor for a new one.'
        : resolved.reason === 'no-waiver'
        ? 'There is no waiver set up for this course yet.'
        : 'This waiver link is not valid — check with your instructor.'
    )
  }
  const waiver = resolved.target
  const courseId = waiver.instanceId

  // ─── The same rules the portal applies ────────────────────────────────────

  if (!input.esignConsent) throw new Error('Please consent to signing electronically.')

  const missing = missingWaiverFields(input)
  if (missing.length) throw new Error(missingFieldsMessage(missing))

  const firstName = input.firstName.trim().slice(0, 80)
  const lastName = input.lastName.trim().slice(0, 80)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address for your copy.')
  }
  const dob = input.dateOfBirth.trim()

  const signatureImage = input.signatureImage
  if (!signatureImage?.startsWith('data:image/png;base64,')) throw new Error('Please sign before submitting.')
  const initialsImage = input.initialsImage?.startsWith('data:image/png;base64,')
    ? input.initialsImage
    : null
  if (waiver.body.initials_after_clause !== null && !initialsImage) {
    throw new Error('Please add your initials where the waiver asks for them.')
  }

  const minor = isMinor(dob)
  const guardian = input.guardian
  if (minor) {
    if (!guardian?.firstName?.trim() || !guardian?.lastName?.trim() || !guardian?.dateOfBirth) {
      throw new Error('A parent or legal guardian must sign for a participant under 18.')
    }
    if (isMinor(guardian.dateOfBirth)) throw new Error('A parent or legal guardian must be over 18.')
  }

  // ─── Who this might be ────────────────────────────────────────────────────

  const [{ data: enrollments }, { data: alreadySigned }] = await Promise.all([
    admin
      .from('enrollments')
      .select('id, user_id, profiles(first_name, last_name, email)')
      .eq('instance_id', courseId),
    admin
      .from('waiver_signatures')
      .select('enrollment_id')
      .eq('instance_id', courseId)
      .not('enrollment_id', 'is', null),
  ])
  const taken = new Set((alreadySigned ?? []).map((s) => s.enrollment_id))
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

  const match = matchSignature({ email, firstName, lastName }, candidates)
  const linked = match.kind === 'matched' ? match.candidate : null

  const hdrs = await headers()
  const trim = (v: string | undefined | null, max = 200) => v?.trim().slice(0, max) || null

  const { data: inserted, error } = await admin.from('waiver_signatures').insert({
    instance_id: courseId,
    version_id: waiver.versionId,
    // Never 'authenticated' on this path, however confident the match was.
    // Matching tells us who a waiver is *about*; it says nothing about who was
    // holding the phone.
    identity: 'unverified',
    source: 'qr',
    enrollment_id: linked?.enrollmentId ?? null,
    profile_id: linked?.profileId ?? null,
    link_method: match.kind === 'matched' ? match.method : null,
    linked_at: linked ? new Date().toISOString() : null,
    claim_email: normalizeEmail(email),

    signer_role: minor ? 'guardian' : 'adult',
    first_name: firstName,
    middle_name: trim(input.middleName, 80),
    last_name: lastName,
    phone: trim(input.phone, 40),
    date_of_birth: dob,

    guardian_first_name: minor ? trim(guardian!.firstName, 80) : null,
    guardian_middle_name: minor ? trim(guardian!.middleName, 80) : null,
    guardian_last_name: minor ? trim(guardian!.lastName, 80) : null,
    guardian_phone: minor ? trim(guardian!.phone, 40) : null,
    guardian_dob: minor ? guardian!.dateOfBirth : null,

    address_line1: trim(input.addressLine1),
    address_line2: trim(input.addressLine2),
    city: trim(input.city, 100),
    state: trim(input.state, 100),
    postal_code: trim(input.postalCode, 20),
    country: trim(input.country, 100),
    emergency_first_name: trim(input.emergencyFirstName, 80),
    emergency_last_name: trim(input.emergencyLastName, 80),
    emergency_phone: trim(input.emergencyPhone, 40),
    emergency_relationship: trim(input.emergencyRelationship, 80),

    initials_image: initialsImage,
    signature_image: signatureImage,
    esign_consent: true,
    ip_address: ip === 'unknown' ? null : ip,
    user_agent: hdrs.get('user-agent')?.slice(0, 500) ?? null,
  }).select('id').single()

  if (error) throw new Error(`Your waiver could not be saved: ${error.message}`)

  after(async () => {
    await emailPublicCopy(inserted.id, email)
  })

  return { signatureId: inserted.id, linked: Boolean(linked) }
}

const FROM = 'Peak Rescue <noreply@peak-rescue.com>'

/**
 * The signer's own copy. On this path it is the only thing they get — there is
 * no portal page for them to come back to — so it carries the document itself
 * rather than a link to one.
 */
async function emailPublicCopy(signatureId: string, to: string): Promise<void> {
  try {
    const data = await loadWaiverPdfData(signatureId)
    if (!data) return
    const { generateWaiverPdf } = await import('@/lib/waiver-pdf')
    const bytes = await generateWaiverPdf(data)
    const { error } = await sendMail({
      from: FROM,
      to: [to],
      replyTo: 'info@peak-rescue.com',
      subject: `Your signed waiver — ${data.courseTitle}`,
      text: [
        `Thanks — your ${data.templateName} for ${data.courseTitle} is signed.`,
        '',
        'Your copy is attached. Keep hold of it: you signed without a portal',
        'account, so this email is your record until one is set up for you.',
        '',
        '—',
        'Peak Rescue',
      ].join('\n'),
      attachments: [{
        filename: `${data.courseTitle} waiver.pdf`.replace(/[^\w .-]/g, ''),
        content: Buffer.from(bytes).toString('base64'),
      }],
    })
    if (error) console.error(`Public waiver copy to ${to} failed:`, error)
  } catch (e) {
    console.error('Public waiver copy could not be sent:', e)
  }
}
