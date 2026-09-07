'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refuse, type ActionResult } from '@/lib/action-result'

// Taking somebody off a course, and taking somebody off the system.
//
// Two very different acts behind two buttons on the same page, because that
// is where the question gets asked: an admin opens a person to check a waiver,
// sees a duplicate account or a student who was never coming, and wants it
// gone. Sending them to the course editor to do half of it and to Supabase for
// the rest is how the wrong row gets deleted.
//
// Admin only — an instructor assigned to the course can read this page, and
// reading a roster is not the same as being able to erase somebody from it.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  return { admin, actorId: user.id }
}

/** Off this course, still a person. Their account and their other courses are
    untouched, and the waiver they signed for this one survives too — it loses
    its seat but keeps their name on it, and lands back in the unmatched queue
    on the course's waiver panel where it can be reattached by hand if they are
    enrolled again. */
export async function removeFromCourse(instanceId: string, enrollmentId: string): Promise<ActionResult> {
  const { admin } = await requireAdmin()

  const { error } = await admin
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)
    .eq('instance_id', instanceId)

  if (error) throw new Error(error.message)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
}

/** Gone: the auth user, the profile, and everything that hangs off it.
    Enrollments, course views and messages cascade away with the profile.
    Signed waivers do not — their profile_id drops to null and the signature
    stays, because a waiver is a record of what somebody agreed to on a day
    and deleting an account is not grounds for losing it.

    Refuses on a staff account and on yourself. This page is reached from a
    student roster, so a staff account turning up here means the wrong person
    is about to be erased — and there is no undo to lean on. Staff are removed
    from the instructors page, deliberately. */
export async function deleteUserEntirely(instanceId: string, enrollmentId: string): Promise<ActionResult> {
  const { admin, actorId } = await requireAdmin()

  // Read the profile through the enrollment rather than trusting an id from
  // the page: the only person this button may delete is the one whose page it
  // is on.
  const { data: enrollment } = await admin
    .from('enrollments')
    .select('user_id')
    .eq('id', enrollmentId)
    .eq('instance_id', instanceId)
    .maybeSingle()

  const profileId = enrollment?.user_id
  if (!profileId) return refuse('That enrollment is no longer on this course.')
  if (profileId === actorId) return refuse('You cannot delete your own account.')

  const [{ data: profile }, { data: instructor }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', profileId).single(),
    admin.from('instructors').select('id').eq('profile_id', profileId).maybeSingle(),
  ])
  if (profile?.role === 'admin' || profile?.role === 'instructor' || instructor) {
    return refuse('That is a staff account, not a student — deleting it here would take their instructor record with it.', {
      href: '/admin/instructors',
      label: 'Instructors',
    })
  }

  // profiles.id references auth.users on delete cascade, so this one call
  // takes the profile and everything keyed to it with it.
  const { error } = await admin.auth.admin.deleteUser(profileId)
  if (error) throw new Error(error.message)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
}
