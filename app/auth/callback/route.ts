import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
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
          .eq('email', data.user.email)
          .maybeSingle()

        if (instructor && !instructor.profile_id) {
          await Promise.all([
            admin
              .from('instructors')
              .update({ profile_id: data.user.id })
              .eq('id', instructor.id),
            admin
              .from('profiles')
              .update({ role: 'instructor' })
              .eq('id', data.user.id),
          ])
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
