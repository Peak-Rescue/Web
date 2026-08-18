'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { normalizeEmail } from '@/lib/email'
import { redeemSignInCode, sendSignInCode } from '@/lib/sign-in-code'

export type LoginResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Runs server-side so the browser never talks to Supabase directly — some
// corporate networks block *.supabase.co, which left the login form hanging
// on "Sending…" for those users.
export async function sendLoginCode(email: string): Promise<LoginResult> {
  const normalizedEmail = normalizeEmail(email)
  if (!EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  // Public endpoint that sends mail — same abuse caps as course signup.
  const admin = createAdminClient()
  const ip = await clientIp()
  const withinLimits =
    (await checkRateLimit(admin, 'login_email', normalizedEmail, { limit: 5, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'login_ip', ip, { limit: 15, windowMinutes: 60 }))
  if (!withinLimits) {
    return { ok: false, error: 'Too many sign-in attempts just now. Please try again shortly.' }
  }

  const error = await sendSignInCode(admin, normalizedEmail)

  // An address with no account gets the same reply as one with an account:
  // a distinct "no account found" would let anyone test which addresses
  // belong to Peak Rescue staff and students.
  return error ? { ok: false, error } : { ok: true }
}

// Capped separately from sending: the code is eight digits, and without a
// ceiling on guesses a caller could work through them.
export async function verifyLoginCode(email: string, code: string): Promise<LoginResult> {
  const normalizedEmail = normalizeEmail(email)
  const digits = code.replace(/\D/g, '')
  if (!EMAIL_RE.test(normalizedEmail) || digits.length < 6) {
    return { ok: false, error: 'Enter the code from your email.' }
  }

  const admin = createAdminClient()
  const ip = await clientIp()
  const withinLimits =
    (await checkRateLimit(admin, 'login_verify_email', normalizedEmail, { limit: 10, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'login_verify_ip', ip, { limit: 30, windowMinutes: 60 }))
  if (!withinLimits) {
    return { ok: false, error: 'Too many attempts. Please request a new code shortly.' }
  }

  const error = await redeemSignInCode(normalizedEmail, digits)
  return error ? { ok: false, error } : { ok: true }
}
