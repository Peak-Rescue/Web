import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseAccess, courseSubtitle, isAdmin } from '@/lib/course-access'
import { courseDisplayName } from '@/lib/courses'
import { generateSchedulePdf, type SchedulePdfDay } from '@/lib/schedule-pdf'

// The running order as a printable sheet, on the same terms as the gear list:
// the course's own schedule for anyone on the course, a library template for
// admins.

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  // Stated rather than inferred: the select is a concatenated string, which
  // the untyped Supabase client hands back as an opaque row.
  type ScheduleRow = {
    id: string
    name: string
    overview: string | null
    objectives: string[] | null
    instance_id: string | null
    schedule_days: SchedulePdfDay[]
  }

  const { data: schedRow } = await admin
    .from('course_schedules')
    .select(
      'id, name, overview, objectives, instance_id, ' +
      'schedule_days(id, title, location, site_id, notes, objectives, sort_order, ' +
      'sites(name, beta), ' +
      'schedule_blocks(id, parent_id, title, time_label, location, sort_order))'
    )
    .eq('id', id)
    .maybeSingle()
  const sched = schedRow as unknown as ScheduleRow | null
  if (!sched) return new Response('Not found', { status: 404 })

  let courseTitle = sched.name
  let subtitle: string | null = null
  if (sched.instance_id) {
    const { allowed } = await courseAccess(admin, user.id, sched.instance_id)
    if (!allowed) return new Response('Not found', { status: 404 })

    const { data: inst } = await admin
      .from('course_instances')
      .select('course_type, custom_title, starts_at, ends_at, location, client_name')
      .eq('id', sched.instance_id)
      .single()
    if (inst) {
      courseTitle = courseDisplayName(inst.course_type, inst.custom_title)
      subtitle = courseSubtitle(inst)
    }
  } else if (!(await isAdmin(admin, user.id))) {
    return new Response('Not found', { status: 404 })
  }

  const bytes = await generateSchedulePdf({
    courseTitle,
    courseSubtitle: subtitle,
    scheduleName: sched.name,
    overview: sched.overview,
    objectives: sched.objectives ?? [],
    days: sched.schedule_days ?? [],
  })

  const filename = `${courseTitle} - ${sched.name}.pdf`.replace(/[^\w .-]/g, '')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
