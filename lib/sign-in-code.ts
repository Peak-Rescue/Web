// Sign-in by typed code, not by clicked link.
//
// Corporate and military mail security (Proofpoint, Safe Links) fetches every
// URL in an inbound message before the recipient sees it. Our sign-in links
// were single-use, so the scanner spent them and the human's own click landed
// back on the login page — the loop a USCG student reported in Aug 2026.
//
// A code beside a link fixes nothing: Supabase issues ONE token per request
// and the link and the code are two encodings of it, so a scanned link kills
// the code too (verified against production). The only shape that survives is
// an email with no URL in it at all. Nothing to pre-click.
//
// The code itself comes from generateLink, which mints the token without
// sending anything; we deliver it ourselves through Resend.

import { type createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ilikeExact } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

const FROM = 'Peak Rescue Portal <noreply@peak-rescue.com>'

// generateLink CREATES the account when the address is unknown, which would
// turn the public login form into an open sign-up endpoint. Every caller must
// confirm the person already exists first.
export async function findUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', ilikeExact(email))
    .maybeSingle()
  if (profile) return profile.id

  // profiles.email is only populated from signup onward (migration 068), so
  // fall back to the auth list for anyone who predates it.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) return null
  return data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null
}

// Returns an error message, or null when there is nothing for the caller to
// report — including the deliberate no-op for an address with no account. A
// distinct "no account found" reply would let anyone test which addresses
// belong to Peak Rescue staff and students.
export async function sendSignInCode(admin: Admin, email: string): Promise<string | null> {
  const userId = await findUserIdByEmail(admin, email)
  if (!userId) return null

  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const code = link?.properties?.email_otp
  if (error || !code) {
    console.error('sign-in code mint failed:', error?.message)
    return 'We could not send a code just now. Please try again shortly.'
  }

  // No mailer in local dev: print the code to the terminal so the flow can be
  // walked end to end. Guarded on NODE_ENV — if production ever lost its key
  // this would tell people a code was sent and quietly drop it.
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n  ✉  sign-in code for ${email}: ${code}\n`)
      return null
    }
    console.error('sign-in code not sent: RESEND_API_KEY missing')
    return 'Email is not configured on this environment.'
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: mailError } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: `${code} is your Peak Rescue sign-in code`,
    text: [
      'Your Peak Rescue sign-in code:',
      '',
      code,
      '',
      'Enter it on the sign-in page. It works once.',
      '',
      "If you didn't ask to sign in, ignore this.",
    ].join('\n'),
  })
  if (mailError) {
    console.error(`sign-in code to ${email} failed:`, mailError)
    return "We couldn't send your code. Please try again, or contact your course organizer."
  }

  return null
}

// Redeems the code against the *server* client so the session cookies are set
// on this response. Returns an error message, or null on success.
export async function redeemSignInCode(email: string, code: string): Promise<string | null> {
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'magiclink' })
  if (error) {
    return 'That code is not right, or it has expired. Request a new one.'
  }
  return null
}
