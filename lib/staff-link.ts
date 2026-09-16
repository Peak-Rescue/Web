// Making a signed-in staff account *be* staff.
//
// Two things have to be true before an instructor sees anything but the
// student empty state: their instructors row has to point at their profile,
// and their profile's role has to say 'instructor' — /admin gates on the role
// alone, and /dashboard only ever lists enrollments, which an instructor has
// none of. Get one without the other and they are locked in a loop: bounced
// out of /admin, and told they are "not enrolled on a course yet".
//
// This lived in three copies, all of them on link-clicking routes
// (/auth/confirm, /auth/callback, the admin invite button's already-registered
// fallback). Sign-in moved to a typed code precisely because mail scanners
// burn links — and the code path promoted nobody, so every instructor who
// signed in that way stayed a student. Erica Pacal reported it in Sept 2026;
// three others were sitting in the same loop without saying so.
//
// Matching is by profile_id first and email second: two instructors are listed
// under a work address but signed up with a personal one, so email alone finds
// neither of them again.

import { type createAdminClient } from '@/lib/supabase/admin'
import { ilikeExact, normalizeEmail } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

export async function linkStaffAccount(
  admin: Admin,
  userId: string,
  email: string | null | undefined
): Promise<void> {
  const { data: byProfile } = await admin
    .from('instructors')
    .select('id, profile_id')
    .eq('profile_id', userId)
    .limit(1)

  let instructor = byProfile?.[0]

  if (!instructor && email) {
    const { data: byEmail } = await admin
      .from('instructors')
      .select('id, profile_id')
      .ilike('email', ilikeExact(normalizeEmail(email)))
      .limit(1)
    instructor = byEmail?.[0]
  }

  // Not staff. A student signing in is the common case, and it ends here.
  if (!instructor) return

  await Promise.all([
    ...(instructor.profile_id
      ? []
      : [admin.from('instructors').update({ profile_id: userId }).eq('id', instructor.id)]),
    // Never demote an admin who is also listed as an instructor.
    admin.from('profiles').update({ role: 'instructor' }).eq('id', userId).neq('role', 'admin'),
  ])
}
