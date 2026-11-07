'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseCapabilityCategories } from '@/lib/capabilities'
import { todayHere } from '@/lib/course-clock'

/** An instructor saying they would work a course nobody has asked them about
    yet. Makes the same row an emailed inquiry makes, so the answer is given on
    the same page and lands in the same staffing panel — the only difference is
    the flag saying who started it. Returns the link to that page. */
export async function startInterest(instanceId: string): Promise<{ token: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in first' }

  const admin = createAdminClient()
  const [{ data: me }, { data: inst }] = await Promise.all([
    admin.from('instructors').select('id, active, instructor_capabilities(category)').eq('profile_id', user.id).maybeSingle(),
    admin
      .from('course_instances')
      .select('id, course_type, custom_categories, status, internal, all_staff, starts_at, ends_at, instance_instructors(instructor_id)')
      .eq('id', instanceId)
      .maybeSingle(),
  ])
  if (!me || me.active === false) return { error: 'Only instructors can do that' }
  if (!inst) return { error: 'That course no longer exists' }

  // The same rule that decides whether the course is on this person's
  // calendar at all — anything looser would let a link do what the page
  // would not show.
  const mine = new Set(((me.instructor_capabilities ?? []) as { category: string }[]).map((c) => c.category))
  const qualified = courseCapabilityCategories(inst.course_type, inst.custom_categories).some((c) => mine.has(c))
  if (!qualified || inst.internal || inst.all_staff) return { error: 'This course isn’t open for interest' }
  if (inst.status === 'cancelled' || inst.status === 'completed') return { error: 'This course isn’t staffing' }
  if ((inst.ends_at ?? inst.starts_at ?? '9999') < todayHere()) return { error: 'This course has already run' }
  if ((inst.instance_instructors ?? []).some((r) => r.instructor_id === me.id)) return { error: 'You’re already on this course' }

  // Whatever row exists wins: answering an inquiry from the calendar is still
  // answering the inquiry.
  const { error } = await admin
    .from('course_interest_invites')
    .upsert(
      { instance_id: instanceId, instructor_id: me.id, self_initiated: true },
      { onConflict: 'instance_id,instructor_id', ignoreDuplicates: true }
    )
  if (error) return { error: 'Something went wrong — please try again' }

  const { data: row } = await admin
    .from('course_interest_invites')
    .select('token')
    .eq('instance_id', instanceId)
    .eq('instructor_id', me.id)
    .single()
  return row ? { token: row.token as string } : { error: 'Something went wrong — please try again' }
}
