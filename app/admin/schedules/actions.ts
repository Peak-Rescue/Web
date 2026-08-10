'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

function touch(instanceId?: string | null) {
  // Templates are browsed on the library's schedule shelf, so every edit has to
  // reach that page — a template has no course to refresh instead.
  revalidatePath('/admin/library')
  if (instanceId) {
    revalidatePath(`/admin/courses/${instanceId}`)
    revalidatePath(`/portal/${instanceId}`)
  }
}

type Admin = ReturnType<typeof createAdminClient>

// Every write reaches for the course the edit belongs to so the course and
// portal pages both refresh — days and blocks only know their parent.
async function instanceOfSchedule(admin: Admin, scheduleId: string) {
  const { data } = await admin.from('course_schedules').select('instance_id').eq('id', scheduleId).single()
  return data?.instance_id ?? null
}

async function instanceOfDay(admin: Admin, dayId: string) {
  const { data } = await admin
    .from('schedule_days')
    .select('course_schedules(instance_id)')
    .eq('id', dayId)
    .single()
  return (data?.course_schedules as unknown as { instance_id: string | null } | null)?.instance_id ?? null
}

// ─── Schedules ──────────────────────────────────────────────────────────────

export async function createSchedule(input: {
  name?: string
  instanceId?: string | null
  courseType?: string | null
  isTemplate?: boolean
  days?: number
}) {
  const admin = await requireAdmin()
  const { data, error } = await admin
    .from('course_schedules')
    .insert({
      name: input.name?.trim().slice(0, 120) || 'Schedule',
      instance_id: input.instanceId ?? null,
      course_type: input.courseType ?? null,
      is_template: input.isTemplate ?? false,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // A schedule with no days is a dead end — seed the days the course runs so
  // there's somewhere to type.
  const days = Math.min(Math.max(input.days ?? 0, 0), 30)
  if (days > 0) {
    const { error: e2 } = await admin.from('schedule_days').insert(
      Array.from({ length: days }, (_, i) => ({
        schedule_id: data.id,
        title: `Day ${i + 1}`,
        sort_order: i,
      }))
    )
    if (e2) throw new Error(e2.message)
  }

  touch(input.instanceId)
  return { id: data.id }
}

export async function updateSchedule(
  id: string,
  patch: {
    name?: string
    overview?: string | null
    objectives?: string[]
    // Library metadata — how a template is found on the shelf.
    description?: string | null
    courseType?: string | null
    disciplines?: string[]
    topics?: string[]
  }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || 'Schedule'
  if (patch.overview !== undefined) update.overview = patch.overview?.trim() || null
  if (patch.objectives !== undefined) {
    update.objectives = patch.objectives.map((o) => o.trim()).filter(Boolean)
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.courseType !== undefined) update.course_type = patch.courseType || null
  if (patch.disciplines !== undefined) update.disciplines = [...new Set(patch.disciplines)]
  if (patch.topics !== undefined) {
    update.topics = [...new Set(patch.topics.map((t) => t.trim()).filter(Boolean))]
  }
  const { data, error } = await admin
    .from('course_schedules').update(update).eq('id', id).select('instance_id').single()
  if (error) throw new Error(error.message)
  touch(data?.instance_id)
}

export async function deleteSchedule(id: string) {
  const admin = await requireAdmin()
  const instanceId = await instanceOfSchedule(admin, id)
  const { error } = await admin.from('course_schedules').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// ─── Days ───────────────────────────────────────────────────────────────────

export async function addScheduleDay(scheduleId: string, title?: string) {
  const admin = await requireAdmin()
  const { data: last } = await admin
    .from('schedule_days').select('sort_order')
    .eq('schedule_id', scheduleId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const next = last ? (last.sort_order as number) + 1 : 0

  const { error } = await admin.from('schedule_days').insert({
    schedule_id: scheduleId,
    title: title?.trim() || `Day ${next + 1}`,
    sort_order: next,
  })
  if (error) throw new Error(error.message)
  touch(await instanceOfSchedule(admin, scheduleId))
}

export async function updateScheduleDay(
  id: string,
  patch: { title?: string; location?: string | null; notes?: string | null }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 200) || 'Day'
  if (patch.location !== undefined) update.location = patch.location?.trim() || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  const { error } = await admin.from('schedule_days').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  touch(await instanceOfDay(admin, id))
}

export async function removeScheduleDay(id: string) {
  const admin = await requireAdmin()
  const instanceId = await instanceOfDay(admin, id)
  const { error } = await admin.from('schedule_days').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

export async function addScheduleBlock(
  dayId: string,
  input: { title: string; parentId?: string | null; timeLabel?: string | null; location?: string | null }
) {
  const admin = await requireAdmin()
  const title = input.title.trim()
  if (!title) throw new Error('Give the block a title')

  // Sort within siblings: a sub-topic orders against its parent's children,
  // a topic against the day's other topics.
  const q = admin.from('schedule_blocks').select('sort_order').eq('day_id', dayId)
  const { data: last } = await (input.parentId ? q.eq('parent_id', input.parentId) : q.is('parent_id', null))
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { error } = await admin.from('schedule_blocks').insert({
    day_id: dayId,
    parent_id: input.parentId ?? null,
    title: title.slice(0, 300),
    time_label: input.timeLabel?.trim() || null,
    location: input.location?.trim() || null,
    sort_order: last ? (last.sort_order as number) + 1 : 0,
  })
  if (error) throw new Error(error.message)
  touch(await instanceOfDay(admin, dayId))
}

// Paste a block of lines as topics — the fastest way to move an existing
// outline in, since that's how these were written in the first place. A line
// indented with spaces, a tab, or a bullet becomes a sub-topic of the line
// above it.
export async function addScheduleBlocks(dayId: string, text: string) {
  const admin = await requireAdmin()
  const lines = text.split('\n').filter((l) => l.trim())
  if (!lines.length) return

  const { data: last } = await admin
    .from('schedule_blocks').select('sort_order')
    .eq('day_id', dayId).is('parent_id', null)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  let order = last ? (last.sort_order as number) + 1 : 0

  const clean = (l: string) => l.replace(/^[\s ]*[-*•○·]?\s*/, '').trim().slice(0, 300)

  let parentId: string | null = null
  let childOrder = 0
  for (const line of lines) {
    const indented = /^(\s{2,}|\t|\s*[○·])/.test(line)
    const title = clean(line)
    if (!title) continue

    if (indented && parentId) {
      const { error } = await admin.from('schedule_blocks').insert({
        day_id: dayId, parent_id: parentId, title, sort_order: childOrder++,
      })
      if (error) throw new Error(error.message)
      continue
    }
    const { data, error } = await admin
      .from('schedule_blocks')
      .insert({ day_id: dayId, parent_id: null, title, sort_order: order++ })
      .select('id').single()
    if (error) throw new Error(error.message)
    parentId = data.id
    childOrder = 0
  }
  touch(await instanceOfDay(admin, dayId))
}

export async function updateScheduleBlock(
  id: string,
  patch: { title?: string; timeLabel?: string | null; location?: string | null }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 300) || 'Untitled'
  if (patch.timeLabel !== undefined) update.time_label = patch.timeLabel?.trim() || null
  if (patch.location !== undefined) update.location = patch.location?.trim() || null
  const { data, error } = await admin
    .from('schedule_blocks').update(update).eq('id', id).select('day_id').single()
  if (error) throw new Error(error.message)
  if (data?.day_id) touch(await instanceOfDay(admin, data.day_id))
}

export async function removeScheduleBlock(id: string) {
  const admin = await requireAdmin()
  const { data } = await admin.from('schedule_blocks').select('day_id').eq('id', id).single()
  const { error } = await admin.from('schedule_blocks').delete().eq('id', id)
  if (error) throw new Error(error.message)
  if (data?.day_id) touch(await instanceOfDay(admin, data.day_id))
}

// ─── Templates ──────────────────────────────────────────────────────────────

const SOURCE_SELECT =
  'name, overview, objectives, schedule_days(id, title, location, notes, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))'

type BlockRow = { id: string; parent_id: string | null; title: string; time_label: string | null; location: string | null; sort_order: number }
type DayRow = { id: string; title: string; location: string | null; notes: string | null; sort_order: number; schedule_blocks: BlockRow[] }

// Lay one schedule's days onto another. Shared by "start from a template" and
// "save back into a template" so the two carry the same thing.
async function copyDaysInto(admin: Admin, source: { schedule_days?: unknown }, scheduleId: string) {
  const days = ((source.schedule_days ?? []) as unknown as DayRow[]).sort((a, b) => a.sort_order - b.sort_order)

  for (const d of days) {
    const { data: newDay, error } = await admin
      .from('schedule_days')
      .insert({ schedule_id: scheduleId, title: d.title, location: d.location, notes: d.notes, sort_order: d.sort_order })
      .select('id').single()
    if (error) throw new Error(error.message)

    // Parents before children, so a copied sub-topic can point at its new
    // parent rather than the original's.
    const blocks = (d.schedule_blocks ?? []).sort((a, b) => a.sort_order - b.sort_order)
    const idMap = new Map<string, string>()
    for (const pass of [blocks.filter((b) => !b.parent_id), blocks.filter((b) => b.parent_id)]) {
      for (const b of pass) {
        const { data: nb, error: e2 } = await admin
          .from('schedule_blocks')
          .insert({
            day_id: newDay.id,
            parent_id: b.parent_id ? idMap.get(b.parent_id) ?? null : null,
            title: b.title, time_label: b.time_label, location: b.location, sort_order: b.sort_order,
          })
          .select('id').single()
        if (e2) throw new Error(e2.message)
        idMap.set(b.id, nb.id)
      }
    }
  }
  return days.length
}

// Copy a schedule — a template onto a course, or a course's schedule into a
// brand new template. Days and blocks are copied, not referenced, so the two
// drift apart from here.
export async function copySchedule(
  sourceId: string,
  target: { instanceId?: string | null; isTemplate?: boolean; name?: string; courseType?: string | null }
) {
  const admin = await requireAdmin()

  const { data: src } = await admin
    .from('course_schedules').select(SOURCE_SELECT).eq('id', sourceId).single()
  if (!src) throw new Error('Schedule not found')

  const { data: created, error } = await admin
    .from('course_schedules')
    .insert({
      name: target.name?.trim() || src.name,
      overview: src.overview,
      objectives: src.objectives ?? [],
      instance_id: target.instanceId ?? null,
      is_template: target.isTemplate ?? false,
      course_type: target.courseType ?? null,
    })
    .select('id').single()
  if (error) throw new Error(error.message)

  const days = await copyDaysInto(admin, src, created.id)

  touch(target.instanceId)
  return { id: created.id, days }
}

// Push a run's schedule back over the template it came from. Explicit click
// only, and it replaces the days wholesale — what stays is the template's shelf
// identity: name, description, tags. Courses already built from it keep their
// own copy.
export async function saveScheduleIntoTemplate(sourceId: string, templateId: string) {
  const admin = await requireAdmin()
  if (sourceId === templateId) throw new Error('That schedule is the template')

  const { data: target } = await admin
    .from('course_schedules').select('id, name, is_template').eq('id', templateId).single()
  if (!target) throw new Error('That template no longer exists')
  if (!target.is_template) throw new Error('That isn’t a template')

  const { data: src } = await admin
    .from('course_schedules').select(SOURCE_SELECT).eq('id', sourceId).single()
  if (!src) throw new Error('Schedule not found')

  // Days cascade to their blocks, so this clears the whole running order.
  const { error: e1 } = await admin.from('schedule_days').delete().eq('schedule_id', templateId)
  if (e1) throw new Error(e1.message)

  const days = await copyDaysInto(admin, src, templateId)

  // The overview and objectives describe the course, not the delivery, so they
  // travel with the days.
  const { error: e2 } = await admin
    .from('course_schedules')
    .update({ overview: src.overview, objectives: src.objectives ?? [], updated_at: new Date().toISOString() })
    .eq('id', templateId)
  if (e2) throw new Error(e2.message)

  touch()
  return { name: target.name as string, days }
}
