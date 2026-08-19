import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseAccess, courseSubtitle, isAdmin } from '@/lib/course-access'
import { courseDisplayName } from '@/lib/courses'
import { generateGearListPdf, type GearPdfEntry } from '@/lib/gear-pdf'
import { GEAR_ENTRY_COLUMNS } from '@/lib/gear'

// The gear list as a printable sheet. Serves the course's own list to anyone
// on the course, and a library template to admins — the same two audiences
// that can see the list on screen.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  // Which sheet this is. The student's — what one person packs — unless it was
  // asked for as the course's, which is the POC's purchasing and pull sheet.
  // Asked for, not inferred: the same list serves both, and the only thing that
  // knows which one you want is the page you printed it from.
  const wantsCourse = new URL(req.url).searchParams.get('for') === 'course'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  // The select is built from a shared column string, which the untyped
  // Supabase client can't infer a row shape from — so the shape is stated.
  type ListRow = {
    id: string
    name: string
    audience: 'student' | 'instructor'
    intro: string | null
    instance_id: string | null
    gear_list_entries: GearPdfEntry[]
  }

  const { data: listRow } = await admin
    .from('gear_lists')
    .select(
      `id, name, audience, intro, instance_id, ` +
      `gear_list_entries(id, ${GEAR_ENTRY_COLUMNS}, gear_items(name, brand, url), gear_entry_options(sort_order, gear_items(name, brand)))`
    )
    .eq('id', id)
    .maybeSingle()
  const list = listRow as unknown as ListRow | null
  if (!list) return new Response('Not found', { status: 404 })

  // A template belongs to the library, which is admins only. A course's list
  // follows the course, and the instructor list stays with the staff even when
  // a student can reach the course.
  let courseTitle = list.name
  let subtitle: string | null = null
  let students: number | null = null
  // A template has no course, so no roster: its rows print their rules. Only
  // staff ever reach one, so nothing is gated on the reading there.
  let isStaff = true
  if (list.instance_id) {
    const access = await courseAccess(admin, user.id, list.instance_id)
    if (!access.allowed) return new Response('Not found', { status: 404 })
    if (list.audience === 'instructor' && !access.isStaff) return new Response('Not found', { status: 404 })
    isStaff = access.isStaff

    const { data: inst } = await admin
      .from('course_instances')
      .select('course_type, custom_title, starts_at, ends_at, location, client_name, max_students')
      .eq('id', list.instance_id)
      .single()
    if (inst) {
      courseTitle = courseDisplayName(inst.course_type, inst.custom_title)
      subtitle = courseSubtitle(inst)
      students = (inst.max_students as number | null) ?? null
    }
  } else if (!(await isAdmin(admin, user.id))) {
    return new Response('Not found', { status: 404 })
  }

  const entries = list.gear_list_entries ?? []

  // A line that names a type with no model ticked prints a few of the models
  // under it, so it has to know what they are.
  const typeIds = [...new Set(entries.map((e) => e.gear_item_id).filter(Boolean))] as string[]
  const { data: models } = typeIds.length
    ? await admin.from('gear_items').select('name, parent_id').in('parent_id', typeIds).eq('active', true).order('name')
    : { data: [] }
  const modelsByType = new Map<string, string[]>()
  for (const m of (models ?? []) as { name: string; parent_id: string }[]) {
    modelsByType.set(m.parent_id, [...(modelsByType.get(m.parent_id) ?? []), m.name])
  }

  const bytes = await generateGearListPdf({
    courseTitle,
    courseSubtitle: subtitle,
    listName: list.name,
    intro: list.intro,
    entries,
    modelsByType,
    // A student asking for the course's totals gets their own sheet instead:
    // the roster size is staff's to know, and a sheet saying "× 12" is not the
    // list they were given.
    view: wantsCourse && isStaff ? 'course' : 'person',
    students,
  })

  const filename = `${courseTitle} - ${list.name}.pdf`.replace(/[^\w .-]/g, '')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
