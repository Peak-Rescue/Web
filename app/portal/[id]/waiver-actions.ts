'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/rate-limit'
import { isMinor } from '@/lib/waiver'
import { normalizeEmail } from '@/lib/email'
import { courseWaiverVersion, loadWaiverPdfData, syncProfileFromWaiver } from '@/lib/waiver-data'

// Signing a waiver from inside the portal.
//
// The whole flow exists to produce one row that can be defended years later,
// so almost everything here is refusing to write a row that couldn't be. What
// the browser sends is treated as the signer's words; what the record is
// worth — who they are, when it happened, where from — is decided here, where
// a client can't reach it.

export type WaiverInput = {
  firstName: string
  middleName?: string
  lastName: string
  phone?: string
  dateOfBirth: string
  email: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  emergencyFirstName?: string
  emergencyLastName?: string
  emergencyPhone?: string
  emergencyRelationship?: string
  initialsImage: string | null
  signatureImage: string
  esignConsent: boolean
  // Present only when the participant is under 18.
  guardian?: {
    firstName: string
    middleName?: string
    lastName: string
    phone?: string
    dateOfBirth: string
  }
}

// Roughly 120KB of base64, which is generous for a 420×120 PNG and still small
// enough that a pasted screenshot won't land in the column.
const MAX_IMAGE_CHARS = 160_000

function requirePng(value: string | null, field: string): string | null {
  if (!value) return null
  if (!value.startsWith('data:image/png;base64,')) {
    throw new Error(`That ${field} didn't come through — please try again.`)
  }
  if (value.length > MAX_IMAGE_CHARS) {
    throw new Error(`That ${field} is too large — please clear it and sign again.`)
  }
  return value
}

const trim = (v: string | undefined | null, max = 200) => v?.trim().slice(0, max) || null

/**
 * Record a signature for the signed-in student.
 *
 * Identity comes from the session, never from the form: the email typed here
 * is where the copy goes and nothing more, so someone entering a personal
 * address doesn't detach their waiver from their enrollment. That is the whole
 * reason this path can claim 'authenticated' while the QR path cannot.
 */
export async function signWaiver(instanceId: string, input: WaiverInput): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again to sign your waiver.')

  const admin = createAdminClient()

  // Enrollment is the authorization: a waiver is for a course you're on, and
  // this is also the row the signature gets attached to.
  const { data: enrollment } = await admin
    .from('enrollments')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!enrollment) throw new Error('You are not enrolled on this course.')

  const waiver = await courseWaiverVersion(instanceId)
  if (!waiver) throw new Error('This course has no waiver set up yet — please tell your instructor.')

  // ─── What makes the row valid ─────────────────────────────────────────────

  if (!input.esignConsent) {
    throw new Error('Please consent to signing electronically before submitting.')
  }
  const firstName = trim(input.firstName, 80)
  const lastName = trim(input.lastName, 80)
  if (!firstName || !lastName) throw new Error('Please enter your first and last name.')

  const email = trim(input.email, 200)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address for your copy.')
  }

  const dob = trim(input.dateOfBirth, 10)
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new Error('Please enter a valid date of birth.')

  const signatureImage = requirePng(input.signatureImage, 'signature')
  if (!signatureImage) throw new Error('Please sign before submitting.')
  const initialsImage = requirePng(input.initialsImage, 'initials')
  if (waiver.body.initials_after_clause !== null && !initialsImage) {
    throw new Error('Please add your initials where the waiver asks for them.')
  }

  // A minor's own signature binds nobody, so the guardian block isn't a nicety
  // — without it there is no agreement to record at all.
  const minor = isMinor(dob)
  const guardian = input.guardian
  if (minor) {
    if (!guardian?.firstName?.trim() || !guardian?.lastName?.trim() || !guardian?.dateOfBirth) {
      throw new Error(
        'A parent or legal guardian must sign for a participant under 18. Please have them complete the guardian section.'
      )
    }
    if (isMinor(guardian.dateOfBirth)) {
      throw new Error('A parent or legal guardian must be over 18.')
    }
  }

  const hdrs = await headers()
  const ip = await clientIp()

  const { data: inserted, error } = await admin.from('waiver_signatures').insert({
    instance_id: instanceId,
    version_id: waiver.versionId,
    // Signed in, so we know exactly who this is — the one path that can say so.
    identity: 'authenticated',
    source: 'portal',
    enrollment_id: enrollment.id,
    profile_id: user.id,
    link_method: 'session',
    linked_at: new Date().toISOString(),
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

  // The waiver just asked for a phone number and a next-of-kin, and the answers
  // are fresher than whatever the profile has been carrying. Carried over so an
  // instructor looking someone up mid-course finds the number they just gave us,
  // and so next year's waiver comes prefilled with it.
  //
  // A guardian's details are not copied: the profile belongs to the participant.
  await syncProfileFromWaiver(user.id, {
    phone: input.phone,
    emergencyFirstName: input.emergencyFirstName,
    emergencyLastName: input.emergencyLastName,
    emergencyPhone: input.emergencyPhone,
    emergencyRelationship: input.emergencyRelationship,
  }, admin)

  // The copy goes out after the response does. Rendering a PDF and handing it
  // to Resend is several seconds of work that the person who just signed
  // should not be made to watch, and none of it can change whether they signed.
  after(async () => {
    await emailSignedCopy(inserted.id, email)
  })

  revalidatePath(`/portal/${instanceId}`)
}

const FROM = 'Peak Rescue <noreply@peak-rescue.com>'

/**
 * Send the signer their own copy, the way the old waiver did — except attached
 * rather than behind a link that expires in three days.
 *
 * Failure is logged and dropped. The signature is already recorded and the
 * copy can always be downloaded from the course page, so a bounced email is
 * an inconvenience; an exception thrown here would be a signed waiver the
 * signer is told didn't work.
 */
async function emailSignedCopy(signatureId: string, to: string): Promise<void> {
  try {
    const data = await loadWaiverPdfData(signatureId)
    if (!data) return

    const { generateWaiverPdf } = await import('@/lib/waiver-pdf')
    const bytes = await generateWaiverPdf(data)

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      replyTo: 'info@peak-rescue.com',
      subject: `Your signed waiver — ${data.courseTitle}`,
      text: [
        `Thanks — your ${data.templateName} for ${data.courseTitle} is signed.`,
        '',
        'Your copy is attached. It stays available on your course page too, so',
        'there is nothing to keep hold of.',
        '',
        '—',
        'Peak Rescue',
      ].join('\n'),
      attachments: [{
        filename: `${data.courseTitle} waiver.pdf`.replace(/[^\w .-]/g, ''),
        content: Buffer.from(bytes).toString('base64'),
      }],
    })
    if (error) console.error(`Waiver copy to ${to} failed:`, error)
  } catch (e) {
    console.error('Waiver copy could not be sent:', e)
  }
}
