// Who may read a course's material, asked once.
//
// The portal page works this out for itself because it needs the answer in
// several shades — admin, instructor, enrolled, previewing-as. A download
// route only needs the yes or no plus "is this person staff", which decides
// whether the instructor-audience documents are theirs to have.

import type { SupabaseClient } from '@supabase/supabase-js'

export type CourseAccess = { allowed: boolean; isStaff: boolean }

export async function courseAccess(
  admin: SupabaseClient,
  userId: string,
  instanceId: string
): Promise<CourseAccess> {
  const [{ data: profile }, { data: assignment }, { data: enrollment }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', userId).single(),
    admin
      .from('instance_instructors')
      .select('id, instructors!inner(profile_id)')
      .eq('instance_id', instanceId)
      .eq('instructors.profile_id', userId)
      .maybeSingle(),
    admin.from('enrollments').select('id').eq('instance_id', instanceId).eq('user_id', userId).maybeSingle(),
  ])

  const isStaff = profile?.role === 'admin' || !!assignment
  return { allowed: isStaff || !!enrollment, isStaff }
}

export async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

// The line under the title on a printed handout: dates, then where, then who
// it's for. A template has no course behind it, so it gets nothing.
export function courseSubtitle(inst: {
  starts_at: string | null
  ends_at: string | null
  location: string | null
  client_name: string | null
}): string | null {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const dates = inst.starts_at
    ? inst.ends_at && inst.ends_at !== inst.starts_at
      ? `${fmt(inst.starts_at)} – ${fmt(inst.ends_at)}`
      : fmt(inst.starts_at)
    : null
  return [dates, inst.location, inst.client_name].filter(Boolean).join('  ·  ') || null
}
