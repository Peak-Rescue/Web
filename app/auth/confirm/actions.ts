'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ilikeExact } from '@/lib/email'

export async function linkInstructorProfile(firstName?: string, lastName?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return

  const admin = createAdminClient()

  await admin.from('profiles').upsert(
    { id: user.id, ...(firstName ? { first_name: firstName } : {}), ...(lastName ? { last_name: lastName } : {}) },
    { onConflict: 'id', ignoreDuplicates: false }
  )

  const { data: instructor } = await admin
    .from('instructors')
    .select('id, profile_id')
    .ilike('email', ilikeExact(user.email))
    .maybeSingle()

  if (instructor) {
    await Promise.all([
      ...(!instructor.profile_id
        ? [admin.from('instructors').update({ profile_id: user.id }).eq('id', instructor.id)]
        : []),
      // Never demote an admin who is also listed as an instructor.
      admin.from('profiles').update({ role: 'instructor' }).eq('id', user.id).neq('role', 'admin'),
    ])
  }
}
