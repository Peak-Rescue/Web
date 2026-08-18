import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CourseView, { type Viewer } from './CourseView'

// The course page for people who are on the course. All it does is work out
// who is asking and what that entitles them to — the page itself is
// CourseView, which is handed the answer rather than working it out again.
// That split is what lets a share link render the identical page for someone
// with no account: the only difference between the two routes is how the
// viewer is arrived at.

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ as?: string }>
}) {
  const { id } = await params
  const { as } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Access inputs in one parallel round.
  const [{ data: profile }, { data: instructorAssignment }, { data: enrollment }, { data: lastView }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin
      .from('instance_instructors')
      .select('id, role, instructors!inner(profile_id)')
      .eq('instance_id', id)
      .eq('instructors.profile_id', user.id)
      .maybeSingle(),
    admin.from('enrollments').select('id').eq('instance_id', id).eq('user_id', user.id).maybeSingle(),
    // Read before anything is marked seen — this visit is what shows the dot,
    // and the write CourseView schedules is what clears it for the next one.
    admin.from('course_views').select('last_seen_at').eq('instance_id', id).eq('user_id', user.id).maybeSingle(),
  ])

  const isAdmin = profile?.role === 'admin'
  const isInstructor = !!instructorAssignment
  if (!(isAdmin || isInstructor || enrollment)) redirect('/dashboard')

  // Admins can preview the page as a student or a (non-lead) instructor via
  // ?as=… — purely a display role; the access check above uses the real one.
  const viewAs = isAdmin && (as === 'student' || as === 'instructor') ? as : null

  const viewer: Viewer = {
    userId: user.id,
    isAdmin,
    isInstructor,
    instructorRole: instructorAssignment?.role ?? null,
    viewAs,
    lastSeenAt: lastView?.last_seen_at ?? null,
  }

  return <CourseView id={id} viewer={viewer} />
}
