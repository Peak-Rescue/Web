import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ilikeExact } from '@/lib/email'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Emailed links carry token_hash and land here directly (configured in the
  // Supabase email templates) so the whole sign-in stays on our domain: some
  // corporate networks block *.supabase.co in the browser, which broke both
  // the old hash-fragment links and the /auth/v1/verify redirect hop.
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  if (code || tokenHash) {
    const supabase = await createClient()
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({ type: otpType ?? 'email', token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!)
    if (!error && data.user) {
      const first_name = searchParams.get('first_name') || undefined
      const last_name = searchParams.get('last_name') || undefined
      const admin = createAdminClient()

      await admin
        .from('profiles')
        .upsert(
          { id: data.user.id, first_name, last_name },
          { onConflict: 'id', ignoreDuplicates: false }
        )

      // Link instructor record if this email was invited as an instructor
      if (data.user.email) {
        const { data: instructor } = await admin
          .from('instructors')
          .select('id, profile_id')
          .ilike('email', ilikeExact(data.user.email))
          .maybeSingle()

        if (instructor) {
          await Promise.all([
            // Link profile_id if not already set
            ...(!instructor.profile_id ? [
              admin.from('instructors').update({ profile_id: data.user.id }).eq('id', instructor.id),
            ] : []),
            // Ensure instructors have the instructor role — but never demote an
            // admin (e.g. an operator who is also listed as an instructor).
            admin.from('profiles').update({ role: 'instructor' }).eq('id', data.user.id).neq('role', 'admin'),
          ])
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
