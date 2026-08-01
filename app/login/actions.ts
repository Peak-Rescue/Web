'use server'

import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export type LoginLinkResult = { ok: true } | { ok: false; error: string }

// Runs server-side so the browser never talks to Supabase directly — some
// corporate networks block *.supabase.co, which left the login form hanging
// on "Sending…" for those users.
export async function sendLoginLink(email: string): Promise<LoginLinkResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
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

  const anon = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit' } }
  )
  const { error } = await anon.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      // Accounts are created by invite only — an unknown email here must
      // not create an auth user (and a profile row via trigger).
      shouldCreateUser: false,
    },
  })

  // Deliberately identical outcome whether or not the address has an
  // account: a distinct "no account found" reply would let anyone test which
  // emails belong to Peak Rescue staff and students. Rate-limit errors still
  // surface, since those are actionable for a real user.
  if (error && !error.message.toLowerCase().includes('signup')) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
