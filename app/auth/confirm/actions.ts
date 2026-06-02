'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function linkInstructorProfile(firstName?: string, lastName?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return

  const admin = createAdminClient()

  const updates: Promise<unknown>[] = [
    admin.from('profiles').upsert(
      { id: user.id, ...(firstName ? { first_name: firstName } : {}), ...(lastName ? { last_name: lastName } : {}) },
      { onConflict: 'id', ignoreDuplicates: false }
    ),
  ]

  const { data: instructor } = await admin
    .from('instructors')
    .select('id, profile_id')
    .eq('email', user.email)
    .maybeSingle()

  if (instructor) {
    if (!instructor.profile_id) {
      updates.push(
        admin.from('instructors').update({ profile_id: user.id }).eq('id', instructor.id)
      )
    }
    updates.push(
      admin.from('profiles').update({ role: 'instructor' }).eq('id', user.id)
    )
  }

  await Promise.all(updates)
}
