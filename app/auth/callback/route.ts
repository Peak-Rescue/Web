import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { linkStaffAccount } from '@/lib/staff-link'

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

      await linkStaffAccount(admin, data.user.id, data.user.email)

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
