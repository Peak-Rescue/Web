'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Who may edit a running order, in two steps: who is asking, then whether
// this particular schedule is theirs to touch.
//
// It is two steps because the answer depends on the course behind the row, and
// days and blocks only know their parent — so the instance has to be looked up
// before the question can be asked. Every write resolves it first and then
// authorizes, rather than authorizing on the way past.
async function whoIsAsking() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  return { admin, userId: user.id, isSiteAdmin: profile?.role === 'admin' }
}

type Asker = Awaited<ReturnType<typeof whoIsAsking>>

// A course's running order belongs to the people running that course. An
// assigned instructor sets tomorrow's plan far more often than an admin does,
// and making them ask for it is how the plan ends up in a text message instead
// of on the page everyone is reading.
//
// A template belongs to no course, which is exactly why it stays admin-only:
// editing one reaches every course built from it afterwards, and that is not a
// blast radius to hand out with a course assignment. Null instance means
// template — the same test, deliberately, so a new caller that forgets to
// resolve its course is refused rather than waved through.
async function mayEdit(asker: Asker, instanceId: string | null) {
  if (asker.isSiteAdmin) return
  if (!instanceId) throw new Error('Not authorized')
  const { data } = await asker.admin
    .from('instance_instructors')
    .select('id, instructors!inner(profile_id)')
    .eq('instance_id', instanceId)
    .eq('instructors.profile_id', asker.userId)
    .maybeSingle()
  if (!data) throw new Error('Not authorized')
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
  const asker = await whoIsAsking()
  // A template is nobody's course, so asking for one asks for admin.
  await mayEdit(asker, input.isTemplate ? null : input.instanceId ?? null)
  const admin = asker.admin
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
  const asker = await whoIsAsking()
  const admin = asker.admin
  const instanceId = await instanceOfSchedule(admin, id)
  await mayEdit(asker, instanceId)
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
  const { error } = await admin.from('course_schedules').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

export async function deleteSchedule(id: string) {
  const asker = await whoIsAsking()
  const admin = asker.admin
  const instanceId = await instanceOfSchedule(admin, id)
  await mayEdit(asker, instanceId)
  const { error } = await admin.from('course_schedules').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// ─── Days ───────────────────────────────────────────────────────────────────

export async function addScheduleDay(scheduleId: string, title?: string) {
  const asker = await whoIsAsking()
  const admin = asker.admin
  const instanceId = await instanceOfSchedule(admin, scheduleId)
  await mayEdit(asker, instanceId)
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
  touch(instanceId)
}

export async function updateScheduleDay(
  id: string,
  patch: {
    title?: string
    location?: string | null
    site_id?: string | null
    notes?: string | null
    objectives?: string[]
    // The morning: the hour we meet, an override of the site's place for this
    // day only, and the sentence that is true of this morning and no other.
    meeting_point?: string | null
    meeting_point_id?: string | null
    meeting_time?: string | null
  }
) {
  const asker = await whoIsAsking()
  const admin = asker.admin
  const instanceId = await instanceOfDay(admin, id)
  await mayEdit(asker, instanceId)
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 200) || 'Day'
  if (patch.location !== undefined) update.location = patch.location?.trim() || null
  if (patch.site_id !== undefined) update.site_id = patch.site_id || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  if (patch.objectives !== undefined) {
    update.objectives = patch.objectives.map((o) => o.trim().slice(0, 300)).filter(Boolean)
  }
  if (patch.meeting_point !== undefined) update.meeting_point = patch.meeting_point?.trim() || null
  if (patch.meeting_point_id !== undefined) update.meeting_point_id = patch.meeting_point_id || null
  if (patch.meeting_time !== undefined) update.meeting_time = patch.meeting_time?.trim().slice(0, 40) || null
  const { error } = await admin.from('schedule_days').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// Swap a day with the one beside it.
//
// Order is the only thing that moves. A day's date is not stored — it is read
// off its position in the running order — so the dates, the "Day N" gutter
// labels and the folding of days already behind us all follow the swap on
// their own. Everything else about a day (its outline, its morning, its site,
// its attachments) hangs off the row and travels with it.
//
// The two rows are written one at a time, which means a reader landing between
// the writes sees two days sharing a sort_order. Days are read with a sort
// that has no tie-break, so the worst that page shows is the pair in an
// arbitrary order for a few milliseconds — not a lost day. Parking one row on
// a sentinel first would cost a third write to close a window nobody can act
// inside.
export async function moveScheduleDay(dayId: string, direction: 'up' | 'down') {
  const asker = await whoIsAsking()
  const admin = asker.admin
  const instanceId = await instanceOfDay(admin, dayId)
  await mayEdit(asker, instanceId)

  const { data: me } = await admin
    .from('schedule_days').select('id, schedule_id, sort_order, title').eq('id', dayId).single()
  if (!me) throw new Error('That day no longer exists')

  // The neighbour is the nearest day on that side, not sort_order ± 1 — gaps
  // open up every time a day is deleted, and an off-by-one gap would make the
  // arrow do nothing rather than move the day.
  const up = direction === 'up'
  const { data: neighbour } = await admin
    .from('schedule_days')
    .select('id, sort_order, title')
    .eq('schedule_id', me.schedule_id)
    .filter('sort_order', up ? 'lt' : 'gt', me.sort_order)
    .order('sort_order', { ascending: !up })
    .limit(1)
    .maybeSingle()
  // Already at the end. The arrows are disabled there, so this is a stale page
  // or a second click, and neither is worth an error.
  if (!neighbour) return

  // Days seeded by "add a day" are titled "Day 3", and a card whose title
  // already begins that way prints no gutter number — so a bare swap would
  // leave "Day 3" sitting in slot four. A title still on its default follows
  // its new position; a title someone actually wrote is theirs, and is left
  // exactly as it is.
  const renumber = (title: string, order: number) =>
    /^day\s*\d+$/i.test(title.trim()) ? `Day ${order + 1}` : title

  for (const [row, order] of [[me, neighbour.sort_order], [neighbour, me.sort_order]] as const) {
    const { error } = await admin
      .from('schedule_days')
      .update({ sort_order: order, title: renumber(row.title as string, order as number) })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
  }

  touch(instanceId)
}

export async function removeScheduleDay(id: string) {
  const asker = await whoIsAsking()
  const admin = asker.admin
  const instanceId = await instanceOfDay(admin, id)
  await mayEdit(asker, instanceId)
  const { error } = await admin.from('schedule_days').delete().eq('id', id)
  if (error) throw new Error(error.message)
  touch(instanceId)
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

// ─── Templates ──────────────────────────────────────────────────────────────

const SOURCE_SELECT =
  'name, overview, objectives, schedule_days(id, title, location, site_id, notes, objectives, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))'

type BlockRow = { id: string; parent_id: string | null; title: string; time_label: string | null; location: string | null; sort_order: number }
type DayRow = { id: string; title: string; location: string | null; site_id: string | null; notes: string | null; objectives: string[] | null; sort_order: number; schedule_blocks: BlockRow[] }

// Lay one schedule's days onto another. Shared by "start from a template" and
// "save back into a template" so the two carry the same thing.
async function copyDaysInto(admin: Admin, source: { schedule_days?: unknown }, scheduleId: string) {
  const days = ((source.schedule_days ?? []) as unknown as DayRow[]).sort((a, b) => a.sort_order - b.sort_order)

  for (const d of days) {
    const { data: newDay, error } = await admin
      .from('schedule_days')
      .insert({
        schedule_id: scheduleId, title: d.title, location: d.location, site_id: d.site_id,
        notes: d.notes, objectives: d.objectives ?? [], sort_order: d.sort_order,
      })
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
  const asker = await whoIsAsking()
  const admin = asker.admin
  // The target is what gets written, so the target is what is authorized —
  // starting a course from a template is a write to the course, not to the
  // template. Asking for a new template asks for admin.
  await mayEdit(asker, target.isTemplate ? null : target.instanceId ?? null)

  const { data: src } = await admin
    .from('course_schedules').select(`is_template, instance_id, ${SOURCE_SELECT}`).eq('id', sourceId).single()
  if (!src) throw new Error('Schedule not found')
  // And the source is read, so it has to be a source this person could already
  // read: the shelf's templates, or a course they are on. Guessing a uuid is
  // not a realistic attack, but "copy any schedule by id" is not a capability
  // worth leaving lying around either.
  if (!src.is_template) await mayEdit(asker, src.instance_id as string | null)

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
  const asker = await whoIsAsking()
  const admin = asker.admin
  // The write lands on a template, which every future course reads.
  await mayEdit(asker, null)
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

// The outline editor hands back a whole day at once — every row, in order,
// each one either a topic or a sub-topic of the topic above it. Blocks carry
// no identity anything else points at, so replacing them wholesale is both
// simpler and safer than diffing rows that were reordered mid-sentence.
export async function replaceDayOutline(
  dayId: string,
  rows: { title: string; timeLabel?: string | null; location?: string | null; depth: number }[],
  // Mid-sentence saves stay quiet. Revalidating tells the router the course
  // page is stale, and re-rendering that page means re-reading its gear
  // catalog, roster and staffing — a second of work nobody asked for while
  // you're still typing. The outline on screen is already right; the rest of
  // the page finds out when you're done with it.
  opts?: { quiet?: boolean }
) {
  const asker = await whoIsAsking()
  const admin = asker.admin
  // Resolved even on a quiet save: what quiet skips is telling the pages to
  // re-render, not finding out whose day this is.
  const instanceId = await instanceOfDay(admin, dayId)
  await mayEdit(asker, instanceId)

  const clean = rows
    .map((r) => ({
      title: r.title.trim().slice(0, 300),
      time: r.timeLabel?.trim().slice(0, 60) || null,
      // Carried through the rewrite. The day is deleted and re-inserted on
      // every save, so a column the caller doesn't send is a column erased.
      location: r.location?.trim().slice(0, 120) || null,
      depth: r.depth > 0 ? 1 : 0,
    }))
    .filter((r) => r.title)

  const { error: eDel } = await admin.from('schedule_blocks').delete().eq('day_id', dayId)
  if (eDel) throw new Error(eDel.message)

  // A sub-topic before any topic is a typo, not a structure — it lands as a
  // topic rather than disappearing.
  const topics: { row: (typeof clean)[number]; order: number }[] = []
  const kids: { parentOrder: number; row: (typeof clean)[number]; order: number }[] = []
  for (const r of clean) {
    if (r.depth === 0 || !topics.length) topics.push({ row: r, order: topics.length })
    else {
      const parentOrder = topics[topics.length - 1].order
      kids.push({ parentOrder, row: r, order: kids.filter((k) => k.parentOrder === parentOrder).length })
    }
  }

  if (topics.length) {
    const { data: inserted, error } = await admin
      .from('schedule_blocks')
      .insert(topics.map((t) => ({
        day_id: dayId, parent_id: null, title: t.row.title, time_label: t.row.time,
        location: t.row.location, sort_order: t.order,
      })))
      .select('id, sort_order')
    if (error) throw new Error(error.message)

    // Read the ids back by sort_order rather than trusting insert order.
    const byOrder = new Map((inserted ?? []).map((b) => [b.sort_order as number, b.id as string]))
    if (kids.length) {
      const { error: e2 } = await admin.from('schedule_blocks').insert(
        kids.map((k) => ({
          day_id: dayId,
          parent_id: byOrder.get(k.parentOrder) ?? null,
          title: k.row.title,
          time_label: k.row.time,
          location: k.row.location,
          sort_order: k.order,
        }))
      )
      if (e2) throw new Error(e2.message)
    }
  }

  if (!opts?.quiet) touch(instanceId)
}

// The other half of a quiet save: once the typing stops, tell the pages that
// read this day about it, without writing anything.
export async function touchDay(dayId: string) {
  const asker = await whoIsAsking()
  const instanceId = await instanceOfDay(asker.admin, dayId)
  await mayEdit(asker, instanceId)
  touch(instanceId)
}
