'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { ilikeExact, normalizeEmail } from '@/lib/email'
import { claimWaiversForEmail } from '@/lib/waiver-data'
import { findUserIdByEmail, sendSignInCode } from '@/lib/sign-in-code'
import { courseDisplayName } from '@/lib/courses'

// `signedIn: true` means the session cookies are already set and the caller
// should navigate straight into the portal. `signedIn: false` is the one case
// that still needs a mailbox round-trip — the address already has an account —
// and that trip is a typed code, never a link.
export type JoinResult =
  | { ok: true; signedIn: true }
  | { ok: true; signedIn: false; email: string }
  | { ok: false; error: string }

type Admin = ReturnType<typeof createAdminClient>

type Invite = {
  id: string
  course_type: string
  custom_title: string | null
  starts_at: string | null
  ends_at: string | null
  location: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Every check the join page did at render time, repeated at write time so a
// stale tab or a forged form can't get through.
async function openInvite(
  admin: Admin,
  token: string
): Promise<{ ok: true; instance: Invite } | { ok: false; error: string }> {
  if (!UUID.test(token)) return { ok: false, error: 'This invite link is not valid.' }

  const { data: inst } = await admin
    .from('course_instances')
    .select('id, course_type, custom_title, starts_at, ends_at, location, max_students, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!inst) {
    return { ok: false, error: 'This invite link is not valid. It may have been revoked — check with your course organizer.' }
  }
  if (inst.invite_expires_at && new Date(inst.invite_expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'This invite link has expired. Contact your course organizer for a new one.' }
  }
  if (inst.max_students) {
    const { count } = await admin
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', inst.id)
    if ((count ?? 0) >= inst.max_students) {
      return { ok: false, error: 'This course is full. Contact your course organizer.' }
    }
  }

  return { ok: true, instance: inst }
}

async function enroll(admin: Admin, instanceId: string, userId: string, email?: string) {
  const { error } = await admin
    .from('enrollments')
    .upsert(
      { instance_id: instanceId, user_id: userId },
      { onConflict: 'instance_id,user_id', ignoreDuplicates: true }
    )
  if (error) throw new Error(error.message)

  // A waiver signed at the tailgate under this address, before there was an
  // account to attach it to, now finds its person. Runs after the enrollment
  // exists so it has a seat to point at.
  //
  // Never allowed to break joining: somebody standing at the start of a course
  // needs their seat more than they need the paperwork tidied, and an
  // unclaimed waiver is still a valid signed waiver an admin can attach later.
  if (email) {
    try {
      await claimWaiversForEmail(userId, email, admin)
    } catch (err) {
      console.error('Claiming waivers failed for', email, err)
    }
  }
}

// Signs the browser in without ever putting a token in an email. We mint a
// magic-link token and redeem it server-side in this same request, so the
// session cookies come back on the form response. Emailed one-time links are
// what broke for students behind corporate mail scanners, which fetch (and
// burn) every link before the human ever clicks it.
async function startSession(admin: Admin, email: string): Promise<boolean> {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    console.error('joinCourse session mint failed:', linkError?.message)
    return false
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (error) {
    console.error('joinCourse session redeem failed:', error.message)
    return false
  }
  return true
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// A receipt, not a step: nothing in the flow waits on it. It exists so the
// student can find their way back to the portal weeks later.
async function sendEnrolledReceipt(email: string, firstName: string, instance: Invite) {
  if (!process.env.RESEND_API_KEY) return
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
  const name = courseDisplayName(instance.course_type, instance.custom_title)
  const dates = instance.starts_at
    ? instance.ends_at && instance.ends_at !== instance.starts_at
      ? `${fmtDate(instance.starts_at)} – ${fmtDate(instance.ends_at)}`
      : fmtDate(instance.starts_at)
    : null
  const details = [dates, instance.location].filter(Boolean).join(' · ')

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
      to: [email],
      subject: `You're enrolled — ${name}`,
      text: [
        `${firstName ? firstName + ',' : 'Hello,'}`,
        '',
        `You're enrolled in ${name}${details ? ` (${details})` : ''}.`,
        '',
        `Your course portal has the schedule, gear list, and everything else you'll need:`,
        `${site}/dashboard`,
        '',
        `If you're ever signed out, go to ${site}/login and we'll email you a sign-in link.`,
        '',
        '— Peak Rescue',
      ].join('\n'),
    })
    if (error) console.error(`Enrollment receipt to ${email} failed:`, error)
  } catch (err) {
    console.error('Enrollment receipt failed:', err instanceof Error ? err.message : err)
  }
}

// Public action — the invite token is the sole gate.
export async function joinCourse(
  token: string,
  firstName: string,
  lastName: string,
  email: string
): Promise<JoinResult> {
  const first = firstName.trim()
  const last = lastName.trim()
  const normalizedEmail = normalizeEmail(email)

  if (!first || !last) return { ok: false, error: 'Please enter your first and last name.' }
  if (first.length > 80 || last.length > 80) {
    return { ok: false, error: 'Please shorten your name.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  const admin = createAdminClient()

  // This action creates accounts and sends mail from our domain, so a leaked
  // invite token must not become an open relay: cap per token, per target
  // address, and per IP.
  const ip = await clientIp()
  const withinLimits =
    (await checkRateLimit(admin, 'join_token', token, { limit: 20, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'join_email', normalizedEmail, { limit: 3, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'join_ip', ip, { limit: 10, windowMinutes: 60 }))
  if (!withinLimits) {
    return { ok: false, error: 'Too many sign-up attempts just now. Please try again shortly.' }
  }

  const invite = await openInvite(admin, token)
  if (!invite.ok) return invite
  const { instance } = invite

  try {
    // Staff addresses never get a seat-of-the-pants session: an instructor who
    // hasn't set up their account yet would otherwise be impersonable by
    // anyone holding the cohort's invite link.
    const { data: staff } = await admin
      .from('instructors')
      .select('id')
      .ilike('email', ilikeExact(normalizedEmail))
      .maybeSingle()

    const { data: created, error: createError } = staff
      ? { data: null, error: null }
      : await admin.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: true,
          user_metadata: { first_name: first, last_name: last },
        })

    if (created?.user) {
      await enroll(admin, instance.id, created.user.id, normalizedEmail)

      if (await startSession(admin, normalizedEmail)) {
        await sendEnrolledReceipt(normalizedEmail, first, instance)
        return { ok: true, signedIn: true }
      }

      // Account and seat are real; only the session mint failed. Fall through
      // to the emailed link rather than stranding them.
      const mailError = await sendSignInCode(admin, normalizedEmail)
      return mailError
        ? { ok: false, error: "You're enrolled, but we couldn't sign you in. Request a code from the login page, or contact your course organizer." }
        : { ok: true, signedIn: false, email: normalizedEmail }
    }

    if (createError && !createError.message.includes('already been registered')) {
      console.error('joinCourse account creation failed:', createError.message)
      return { ok: false, error: 'Something went wrong creating your account. Please try again.' }
    }

    // The address already has an account (or belongs to staff). Enroll it, but
    // make them prove the mailbox is theirs before handing over a session —
    // otherwise the invite link would be an impersonation tool. Their existing
    // profile name is left untouched.
    const userId = await findUserIdByEmail(admin, normalizedEmail)
    if (!userId) {
      console.error('joinCourse existing-user lookup failed for', normalizedEmail)
      return { ok: false, error: 'Something went wrong. Please try again.' }
    }

    await enroll(admin, instance.id, userId, normalizedEmail)
    await sendEnrolledReceipt(normalizedEmail, first, instance)

    const mailError = await sendSignInCode(admin, normalizedEmail)
    if (mailError) {
      // They ARE enrolled at this point — only the email failed.
      console.error('joinCourse sign-in code failed:', mailError)
      return {
        ok: false,
        error: "You're enrolled, but we couldn't send your sign-in code. Request one from the login page, or contact your course organizer.",
      }
    }
    return { ok: true, signedIn: false, email: normalizedEmail }
  } catch (err) {
    console.error('joinCourse failed:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

// Already signed in — the invite link itself is the only step. No form, no
// mailbox, no second account for the returning student.
export async function joinAsCurrentUser(token: string): Promise<JoinResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Your session has expired. Enter your details to join.' }
  }

  const admin = createAdminClient()
  const invite = await openInvite(admin, token)
  if (!invite.ok) return invite

  try {
    // Their own address off the session — a returning student who signed at a
    // tailgate under it gets that waiver attached as they take their seat.
    await enroll(admin, invite.instance.id, user.id, user.email ?? undefined)
    return { ok: true, signedIn: true }
  } catch (err) {
    console.error('joinAsCurrentUser failed:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}
