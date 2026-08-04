'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contactsFromForm } from '@/lib/contacts'
import { syncCourseCalendar, removeCourseEvent } from '@/lib/google-calendar'

function toSlugPart(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function generateSlug(parts: (string | null | undefined)[]): Promise<string> {
  const admin = createAdminClient()
  const base = parts.filter(Boolean).map(p => toSlugPart(p!)).filter(Boolean).join('-')

  // Check for collisions and append suffix if needed
  let candidate = base
  let attempt = 0
  while (true) {
    const { data } = await admin.from('course_instances').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
    attempt++
    candidate = `${base}-${attempt}`
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user
}

export async function createInstance(formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const course_category  = (formData.get('course_category') as string) || 'tactical'
  const course_type      = (formData.get('course_type') as string) || 'custom'
  const custom_title     = (formData.get('custom_title') as string) || null
  const custom_categories = course_type === 'custom' ? (formData.getAll('custom_categories') as string[]) : null
  const status           = (formData.get('status') as string) || 'tentative'
  const location         = (formData.get('location') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contacts         = contactsFromForm(formData.get('contacts_json'))
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null
  const starts_at        = (formData.get('starts_at') as string) || null
  const ends_at          = (formData.get('ends_at') as string) || null

  const displayName = course_type === 'custom' ? (custom_title ?? 'custom') : course_type
  const slug = await generateSlug([displayName, client_name, location, starts_at])

  const { data, error } = await admin
    .from('course_instances')
    .insert({ course_category, course_type, custom_title, custom_categories, status, starts_at, ends_at, location, client_name, contacts, notes, max_students, instructor_slots, slug })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  after(() => syncCourseCalendar(admin, data.id))

  redirect(`/admin/courses/${data.id}`)
}

export async function updateInstanceDetails(id: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('course_instances')
    .select('status')
    .eq('id', id)
    .single()

  const course_category  = (formData.get('course_category') as string) || 'tactical'
  const course_type      = (formData.get('course_type') as string) || 'custom'
  const custom_title     = (formData.get('custom_title') as string) || null
  const custom_categories = course_type === 'custom' ? (formData.getAll('custom_categories') as string[]) : null
  const status           = formData.get('status') as string
  const location         = (formData.get('location') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contactsRaw      = formData.get('contacts_json')
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null

  const { error } = await admin
    .from('course_instances')
    .update({ course_category, course_type, custom_title, custom_categories, status, location, client_name, notes, max_students, instructor_slots, ...(contactsRaw !== null ? { contacts: contactsFromForm(contactsRaw) } : {}) })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Course cancelled → tell every assigned instructor (best-effort). It
  // disappears from their portal home, so silence would leave them planning
  // around a course that no longer exists.
  if (status === 'cancelled' && before?.status !== 'cancelled' && process.env.RESEND_API_KEY) {
    after(async () => {
    try {
      const { data: assigned } = await admin
        .from('instance_instructors')
        .select('instructors(name, email)')
        .eq('instance_id', id)
      const recipients = (assigned ?? [])
        .map((a) => (a.instructors as unknown as { name: string; email: string | null } | null)?.email)
        .filter((e): e is string => Boolean(e))

      if (recipients.length > 0) {
        const { courseShortName } = await import('@/lib/courses')
        const courseName = courseShortName(course_type, custom_title)
        const { data: dates } = await admin
          .from('course_instances')
          .select('starts_at, ends_at')
          .eq('id', id)
          .single()
        const when = dates?.starts_at
          ? `${dates.starts_at}${dates.ends_at && dates.ends_at !== dates.starts_at ? ` – ${dates.ends_at}` : ''}`
          : 'dates TBD'
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: `Cancelled — ${courseName} (${when})`,
          text: [
            `The following course has been cancelled:`,
            '',
            `Course: ${courseName}${client_name ? ` · ${client_name}` : ''}`,
            `Dates: ${when}`,
            location ? `Location: ${location}` : null,
            '',
            'It has been removed from your upcoming courses in the portal. Any open tasks for it no longer need to be done.',
          ].filter((l): l is string => l !== null).join('\n'),
        })
      }
    } catch (e) {
      console.error('Course cancellation email failed:', e)
    }
    })
  }

  after(() => syncCourseCalendar(admin, id))

  revalidatePath(`/admin/courses/${id}`)
  revalidatePath('/admin/courses')
  revalidatePath(`/portal/${id}`)
  revalidatePath('/admin')
}

// Quote-page hero override: only photos from the curated pool or the gallery;
// framing (position/scale) only alongside a photo, in the avatar-editor format.
export async function updateQuoteHero(id: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const heroRaw = (formData.get('hero_image') as string) || null
  let hero_image: string | null = null
  if (heroRaw) {
    const { HERO_CHOICES } = await import('@/lib/quote-heroes')
    if (HERO_CHOICES.some((c) => c.value === heroRaw)) {
      hero_image = heroRaw
    } else {
      const { data: galleryHit } = await admin.from('gallery_images').select('id').eq('url', heroRaw).maybeSingle()
      if (galleryHit) hero_image = heroRaw
    }
  }
  const posRaw = (formData.get('hero_position') as string) || null
  const hero_position = hero_image && posRaw && /^\d{1,3}% \d{1,3}%$/.test(posRaw) ? posRaw : null
  const scaleRaw = Number(formData.get('hero_scale'))
  const hero_scale = hero_image && Number.isFinite(scaleRaw) && scaleRaw > 1 && scaleRaw <= 3 ? String(scaleRaw) : null

  const { error } = await admin
    .from('course_instances')
    .update({ hero_image, hero_position, hero_scale })
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/courses/${id}`)
}

export async function updateInstanceDates(id: string, formData: FormData) {
  await requireAdmin()

  const starts_at = (formData.get('starts_at') as string) || null
  const ends_at   = (formData.get('ends_at') as string) || null

  const { error } = await createAdminClient()
    .from('course_instances')
    .update({ starts_at, ends_at })
    .eq('id', id)

  if (error) throw new Error(error.message)
  after(() => syncCourseCalendar(createAdminClient(), id))
  revalidatePath(`/admin/courses/${id}`)
}

export async function addOffDay(instanceId: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()
  const off_date = formData.get('off_date') as string
  const end_date = (formData.get('end_date') as string) || null
  if (!off_date) throw new Error('Date is required')
  if (end_date && end_date < off_date) throw new Error('Off-day end date must be on or after its start date')

  // Guard against the classic mistake: entering the course dates here.
  // Off-days must fall strictly inside the course window.
  const { data: inst } = await admin
    .from('course_instances')
    .select('starts_at, ends_at')
    .eq('id', instanceId)
    .single()
  if (!inst?.starts_at || !inst?.ends_at) {
    throw new Error('Set the course start and end dates first — off-days are breaks inside that window')
  }
  const last = end_date ?? off_date
  if (off_date <= inst.starts_at || last >= inst.ends_at) {
    throw new Error(
      `Off-days must fall inside the course (${inst.starts_at} – ${inst.ends_at}), not on its first/last day. ` +
        'If you meant to set the course dates, use Course start/end above.'
    )
  }

  const { error } = await admin
    .from('instance_off_days')
    .insert({ instance_id: instanceId, off_date, end_date: end_date ?? null })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function removeOffDay(instanceId: string, offDayId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instance_off_days')
    .delete()
    .eq('id', offDayId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function addModule(instanceId: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const title    = formData.get('title') as string
  const audience = (formData.get('audience') as string) || 'both'

  const { data: existing } = await admin
    .from('course_modules')
    .select('order')
    .eq('instance_id', instanceId)
    .order('order', { ascending: false })
    .limit(1)
    .single()

  const order = existing ? (existing.order as number) + 1 : 0

  const { error } = await admin
    .from('course_modules')
    .insert({ instance_id: instanceId, title, audience, order })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function deleteModule(instanceId: string, moduleId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('course_modules')
    .delete()
    .eq('id', moduleId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function addItem(instanceId: string, moduleId: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const title       = formData.get('title') as string
  const type        = formData.get('type') as string
  const url         = formData.get('url') as string
  const description = (formData.get('description') as string) || null

  const { data: existing } = await admin
    .from('course_items')
    .select('order')
    .eq('module_id', moduleId)
    .order('order', { ascending: false })
    .limit(1)
    .single()

  const order = existing ? (existing.order as number) + 1 : 0

  const { error } = await admin
    .from('course_items')
    .insert({ module_id: moduleId, title, type, url, description, order })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Attach published library items to a section. Stores references, not
// copies — editing the library entry updates every course pointing at it.
export async function addLibraryItems(instanceId: string, moduleId: string, itemIds: string[]) {
  await requireAdmin()
  const admin = createAdminClient()
  if (itemIds.length === 0) return

  const { data: existing } = await admin
    .from('course_items')
    .select('order, library_item_id')
    .eq('module_id', moduleId)
  const have = new Set((existing ?? []).map((c) => c.library_item_id).filter(Boolean))
  let order = Math.max(-1, ...(existing ?? []).map((c) => c.order as number)) + 1

  // Title is denormalised only so legacy free-typed rows and references can
  // share a NOT NULL column; the reference's real title comes from the library.
  const { data: lib } = await admin
    .from('library_items')
    .select('id, title')
    .in('id', itemIds)
    .eq('status', 'published')

  const rows = (lib ?? []).filter((l) => !have.has(l.id)).map((l) => ({
    module_id: moduleId,
    library_item_id: l.id,
    title: l.title,
    order: order++,
  }))
  if (rows.length === 0) return

  const { error } = await admin.from('course_items').insert(rows)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

// Per-delivery logistics — meeting point, time, running order. Participant
// facing by definition, and the one part of course content that must be
// rewritten every delivery rather than pulled from the library.
export async function updateCourseLogistics(id: string, formData: FormData) {
  await requireAdmin()
  const { error } = await createAdminClient()
    .from('course_instances')
    .update({
      intro: ((formData.get('intro') as string) || '').trim() || null,
      meeting_point: ((formData.get('meeting_point') as string) || '').trim() || null,
      meeting_time: ((formData.get('meeting_time') as string) || '').trim() || null,
      schedule: ((formData.get('schedule') as string) || '').trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${id}`)
  revalidatePath(`/portal/${id}`)
}

// Library material for a course's pickers, fetched on demand. Loading ~700
// items on every course-page render cost about half a second whether or not
// anyone opened a picker — and every delete revalidates the page.
export async function loadPickerItems(instanceId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const [{ data: inst }, { data: rows }] = await Promise.all([
    admin.from('course_instances').select('course_type, custom_categories, location').eq('id', instanceId).single(),
    admin
      .from('library_items')
      .select('id, title, url, kind, audience, disciplines, topics, venue_id, source_class, venues(name)')
      .eq('status', 'published')
      .order('title')
      .limit(1000),
  ])
  if (!inst) return []

  const { courseCapabilityCategories } = await import('@/lib/capabilities')
  const matching = courseCapabilityCategories(inst.course_type, inst.custom_categories)
  const loc = (inst.location ?? '').toLowerCase()

  return ((rows ?? []) as unknown as {
    id: string; title: string; url: string | null; kind: string; audience: 'internal' | 'shared'
    disciplines: string[]; topics: string[]; venue_id: string | null; source_class: string | null
    venues: { name: string } | null
  }[]).map((l) => {
    const venueName = l.venues?.name ?? null
    const venueMatches = Boolean(
      venueName && loc && (loc.includes(venueName.toLowerCase()) || venueName.toLowerCase().includes(loc))
    )
    return {
      id: l.id, title: l.title, url: l.url, kind: l.kind, audience: l.audience,
      disciplines: l.disciplines, topics: l.topics, venue_id: l.venue_id,
      venueName, sourceClass: l.source_class,
      suggested: venueMatches || l.disciplines.some((d) => matching.includes(d as never)),
    }
  })
}

// What a template would add to this course — for the preview, so applying
// isn't a leap of faith. Sections already present are marked, and items
// already on the course are excluded from the counts.
export async function previewCourseTemplate(instanceId: string, templateId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const [{ data: sections }, { data: existingModules }, { data: onCourse }] = await Promise.all([
    admin
      .from('course_template_sections')
      .select('id, title, audience, sort_order, course_template_items(item_id, sort_order, library_items(id, title, kind, audience))')
      .eq('template_id', templateId)
      .order('sort_order'),
    admin.from('course_modules').select('title').eq('instance_id', instanceId),
    admin.from('course_items').select('library_item_id, course_modules!inner(instance_id)').eq('course_modules.instance_id', instanceId),
  ])

  const haveSections = new Set((existingModules ?? []).map((m) => (m.title as string).toLowerCase()))
  const haveItems = new Set((onCourse ?? []).map((c) => c.library_item_id).filter(Boolean))

  return ((sections ?? []) as unknown as {
    title: string
    audience: 'internal' | 'shared'
    course_template_items: { library_items: { id: string; title: string; kind: string; audience: string } | null }[]
  }[]).map((s) => ({
    title: s.title,
    audience: s.audience,
    sectionExists: haveSections.has(s.title.toLowerCase()),
    items: s.course_template_items
      .map((i) => i.library_items)
      .filter((i): i is { id: string; title: string; kind: string; audience: string } => Boolean(i))
      .map((i) => ({ ...i, alreadyOnCourse: haveItems.has(i.id) })),
  }))
}

// Applying a template rebuilds a known course shape: its sections in order,
// each holding references to the same library items. Idempotent — sections
// that already exist are reused and items already present are skipped, so it
// can be re-run after the template gains material.
export async function applyCourseTemplate(instanceId: string, templateId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: sections } = await admin
    .from('course_template_sections')
    .select('id, title, audience, sort_order, course_template_items(item_id, sort_order)')
    .eq('template_id', templateId)
    .order('sort_order')
  if (!sections?.length) return { sections: 0, items: 0 }

  const { data: existingModules } = await admin
    .from('course_modules')
    .select('id, title, "order"')
    .eq('instance_id', instanceId)
  const byTitle = new Map((existingModules ?? []).map((m) => [m.title.toLowerCase(), m.id]))
  let nextOrder = Math.max(-1, ...(existingModules ?? []).map((m) => m.order as number)) + 1

  let madeSections = 0
  let addedItems = 0

  for (const sec of sections) {
    let moduleId = byTitle.get(sec.title.toLowerCase())
    if (!moduleId) {
      const { data, error } = await admin
        .from('course_modules')
        .insert({
          instance_id: instanceId,
          title: sec.title,
          audience: sec.audience === 'internal' ? 'instructor' : 'both',
          order: nextOrder++,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      moduleId = data.id
      madeSections++
    }

    const wanted = ((sec.course_template_items ?? []) as { item_id: string; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
    if (wanted.length === 0) continue

    // Only published items, and only ones not already in this section.
    const [{ data: live }, { data: current }] = await Promise.all([
      admin.from('library_items').select('id, title').in('id', wanted.map((w) => w.item_id)).eq('status', 'published'),
      admin.from('course_items').select('order, library_item_id').eq('module_id', moduleId),
    ])
    const have = new Set((current ?? []).map((c) => c.library_item_id).filter(Boolean))
    let order = Math.max(-1, ...(current ?? []).map((c) => c.order as number)) + 1
    const titleById = new Map((live ?? []).map((l) => [l.id, l.title]))

    const rows = wanted
      .filter((w) => titleById.has(w.item_id) && !have.has(w.item_id))
      .map((w) => ({
        module_id: moduleId!,
        library_item_id: w.item_id,
        title: titleById.get(w.item_id)!,
        order: order++,
      }))
    if (rows.length === 0) continue

    const { error } = await admin.from('course_items').insert(rows)
    if (error) throw new Error(error.message)
    addedItems += rows.length
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
  return { sections: madeSections, items: addedItems }
}

// Bulk-apply library material to a course: each group becomes a section (or
// merges into one that already exists), holding the items ticked under it.
// Sections carry their own audience, so a whole group can be held back to
// instructors — venue and instructor-info groups usually are.
export async function applyLibrarySelection(
  instanceId: string,
  groups: {
    title: string
    audience: 'internal' | 'shared'
    // Per-item audience: set only where it differs from the section, which is
    // how a single item stays instructor-only inside a shared section.
    items: { id: string; audience?: 'internal' | 'shared' }[]
  }[]
) {
  await requireAdmin()
  const admin = createAdminClient()

  const wanted = groups.filter((g) => g.items.length > 0)
  if (wanted.length === 0) return { sections: 0, items: 0 }

  const { data: existingModules } = await admin
    .from('course_modules')
    .select('id, title, "order"')
    .eq('instance_id', instanceId)
  const byTitle = new Map((existingModules ?? []).map((m) => [m.title.toLowerCase(), m]))
  let nextOrder = Math.max(-1, ...(existingModules ?? []).map((m) => m.order as number)) + 1

  let items = 0
  let sections = 0

  for (const g of wanted) {
    let moduleId = byTitle.get(g.title.toLowerCase())?.id
    if (!moduleId) {
      const { data, error } = await admin
        .from('course_modules')
        .insert({
          instance_id: instanceId,
          title: g.title.slice(0, 120),
          audience: g.audience === 'internal' ? 'instructor' : 'both',
          order: nextOrder++,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      moduleId = data.id
      sections++
    }

    const { data: lib } = await admin
      .from('library_items')
      .select('id, title')
      .in('id', g.items.map((i) => i.id))
      .eq('status', 'published')
    const overrideById = new Map(g.items.map((i) => [i.id, i.audience]))

    // The duplicate guard is a partial unique index, which PostgREST can't use
    // for ON CONFLICT inference — so skip existing rows explicitly.
    const { data: current } = await admin
      .from('course_items')
      .select('order, library_item_id')
      .eq('module_id', moduleId)
    const have = new Set((current ?? []).map((c) => c.library_item_id).filter(Boolean))
    let order = Math.max(-1, ...(current ?? []).map((c) => c.order as number)) + 1

    const rows = (lib ?? []).filter((l) => !have.has(l.id)).map((l) => {
      const own = overrideById.get(l.id)
      return {
        module_id: moduleId!,
        library_item_id: l.id,
        title: l.title,
        // Only store an override when it differs from the section's level.
        audience: own && own !== g.audience ? own : null,
        order: order++,
      }
    })
    if (rows.length === 0) continue

    const { error } = await admin.from('course_items').insert(rows)
    if (error) throw new Error(error.message)
    items += rows.length
  }

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
  return { sections, items }
}

// Bulk-remove items from a course's sections. Removes the link, never the
// library entry.
export async function removeCourseItems(instanceId: string, itemIds: string[]) {
  await requireAdmin()
  if (itemIds.length === 0) return
  const { error } = await createAdminClient().from('course_items').delete().in('id', itemIds)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

// Per-course visibility override; null restores the library item's own level.
export async function setItemAudience(instanceId: string, itemId: string, audience: 'internal' | 'shared' | null) {
  await requireAdmin()
  const { error } = await createAdminClient()
    .from('course_items')
    .update({ audience })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

export async function deleteItem(instanceId: string, itemId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('course_items')
    .delete()
    .eq('id', itemId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function assignInstructor(instanceId: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const instructor_id = formData.get('instructor_id') as string
  const role          = (formData.get('role') as string) || 'assist'

  if (!instructor_id) return

  // Distinguish a new assignment from a role change so only the former emails.
  const { data: existing } = await admin
    .from('instance_instructors')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('instructor_id', instructor_id)
    .maybeSingle()

  const { error } = await admin
    .from('instance_instructors')
    .upsert({ instance_id: instanceId, instructor_id, role }, { onConflict: 'instance_id,instructor_id' })

  if (error) throw new Error(error.message)

  // Best-effort notification on new assignments — deferred with after() so
  // the assign click doesn't wait on the email provider.
  if (!existing && process.env.RESEND_API_KEY) {
    after(async () => {
    try {
      const [{ data: instructor }, { data: inst }] = await Promise.all([
        admin.from('instructors').select('name, email').eq('id', instructor_id).single(),
        admin.from('course_instances').select('course_type, custom_title, client_name, location, starts_at, ends_at').eq('id', instanceId).single(),
      ])
      if (instructor?.email && inst) {
        const { courseShortName } = await import('@/lib/courses')
        const courseName = courseShortName(inst.course_type, inst.custom_title)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'
        const dates = inst.starts_at
          ? `${inst.starts_at}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${inst.ends_at}` : ''}`
          : 'dates TBD'
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: [instructor.email],
          subject: `You're assigned to ${courseName} (${role})`,
          text: [
            `${instructor.name}, you've been assigned as ${role} instructor.`,
            '',
            `Course: ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}`,
            `Dates: ${dates}`,
            inst.location ? `Location: ${inst.location}` : null,
            '',
            `Course details and tasks: ${siteUrl}/portal/${instanceId}`,
          ].filter((l): l is string => l !== null).join('\n'),
        })
      }
    } catch (e) {
      console.error('Instructor assignment email failed:', e)
    }
    })
  }

  // New assignments also check medical certs: if theirs will be expired by the
  // course's last day, they get told to update it in the portal.
  if (!existing) {
    after(async () => {
      const { sendAssignmentCertAlert } = await import('@/lib/notifications')
      await sendAssignmentCertAlert(admin, instanceId, instructor_id)
    })
  }

  // The crew is part of the Google event title, so assignments re-sync it.
  after(() => syncCourseCalendar(admin, instanceId))

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
  revalidatePath('/admin')
}

export async function removeInstructor(instanceId: string, instructorId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { error } = await admin
    .from('instance_instructors')
    .delete()
    .eq('instance_id', instanceId)
    .eq('instructor_id', instructorId)

  if (error) throw new Error(error.message)

  after(() => syncCourseCalendar(admin, instanceId))

  revalidatePath(`/admin/courses/${instanceId}`)
}

// Deletes a course instance. Enrollments, instructor assignments, date
// ranges, and modules cascade away; expense items keep their rows but lose
// the course link (instance_id is on delete set null).
export async function deleteInstance(instanceId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  // Remove the mirrored Google event before the row (and its pointers) go.
  await removeCourseEvent(admin, instanceId)

  const { error } = await admin
    .from('course_instances')
    .delete()
    .eq('id', instanceId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/courses')
  revalidatePath('/admin/expenses')
}

// ─── Student invite links ─────────────────────────────────────────────────────

// Creates (or rotates) the unique student signup link for a course instance.
// expiresIn: days from now, 'never' for no expiry, or omitted for the default —
// valid through the course plus a week of margin; 30 days from now when the
// course has no end date or already ended.
export async function generateInviteLink(instanceId: string, expiresIn?: number | 'never') {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: inst } = await admin
    .from('course_instances')
    .select('ends_at')
    .eq('id', instanceId)
    .single()
  if (!inst) throw new Error('Course not found')

  const dayMs = 24 * 60 * 60 * 1000
  let expires: Date | null
  if (expiresIn === 'never') {
    expires = null
  } else if (expiresIn != null) {
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 365) {
      throw new Error('Expiry must be between 1 and 365 days')
    }
    expires = new Date(Date.now() + expiresIn * dayMs)
  } else {
    const fromCourseEnd = inst.ends_at
      ? new Date(new Date(inst.ends_at + 'T00:00:00').getTime() + 7 * dayMs)
      : null
    expires = fromCourseEnd && fromCourseEnd.getTime() > Date.now()
      ? fromCourseEnd
      : new Date(Date.now() + 30 * dayMs)
  }

  const { error } = await admin
    .from('course_instances')
    .update({ invite_token: crypto.randomUUID(), invite_expires_at: expires ? expires.toISOString() : null })
    .eq('id', instanceId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function revokeInviteLink(instanceId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('course_instances')
    .update({ invite_token: null, invite_expires_at: null })
    .eq('id', instanceId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function removeEnrollment(instanceId: string, enrollmentId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)
    .eq('instance_id', instanceId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// One-click backfill/repair: pushes every course to its correct calendar.
// Used after initial setup and any time the mirrors need reconciling.
export async function syncAllCoursesToCalendar() {
  await requireAdmin()
  const admin = createAdminClient()

  const { calendarSyncEnabled } = await import('@/lib/google-calendar')
  if (!calendarSyncEnabled()) {
    throw new Error('Calendar sync is not configured yet (service account key and calendar IDs)')
  }

  const { data: instances } = await admin
    .from('course_instances')
    .select('id')
    .order('created_at')
  for (const i of instances ?? []) {
    await syncCourseCalendar(admin, i.id)
  }
  revalidatePath('/admin/courses')
}
