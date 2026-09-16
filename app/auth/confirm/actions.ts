'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { linkStaffAccount } from '@/lib/staff-link'

export async function linkInstructorProfile(firstName?: string, lastName?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return

  const admin = createAdminClient()

  await admin.from('profiles').upsert(
    { id: user.id, ...(firstName ? { first_name: firstName } : {}), ...(lastName ? { last_name: lastName } : {}) },
    { onConflict: 'id', ignoreDuplicates: false }
  )

  await linkStaffAccount(admin, user.id, user.email)
}
