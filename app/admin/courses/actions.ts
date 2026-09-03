'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contactsFromForm } from '@/lib/contacts'
import { syncCourseCalendar, removeCourseEvent } from '@/lib/google-calendar'
import { isValidRegion } from '@/lib/regions'
import { requireCourseStaff } from '@/lib/course-access'
import { sendMail } from '@/lib/mailer'
import { announcesChanges } from '@/lib/course-notify'
import { clampOffDays, dayShift, strokeOffDays, type OffSpan } from '@/lib/courses'

const fmtLong = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// Off-day rows as spans, and back: the table stores a nullable end date, the
// arithmetic wants two dates.
function toSpans(rows: { off_date: string; end_date: string | null; instructors_paid?: boolean | null }[]): OffSpan[] {
  return rows.map((o) => ({ from: o.off_date, to: o.end_date ?? o.off_date, paid: Boolean(o.instructors_paid) }))
}

function toRow(instance_id: string, b: OffSpan) {
  return { instance_id, off_date: b.from, end_date: b.to === b.from ? null : b.to, instructors_paid: b.paid }
}

const sameSpan = (a: OffSpan, b: OffSpan) => a.from === b.from && a.to === b.to && a.paid === b.paid

/** Make the stored breaks say what `next` says. Rows that already say one of
    those spans are left alone — their ids are what the list on the screen
    deletes and flips, and rewriting a row nobody asked about would churn them
    for nothing. */
async function applyOffDays(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  rows: { id: string; off_date: string; end_date: string | null; instructors_paid?: boolean | null }[],
  next: OffSpan[]
) {
  const wanted = [...next]
  const stale: string[] = []
  for (const r of rows) {
    const i = wanted.findIndex((k) => sameSpan(k, toSpans([r])[0]))
    if (i === -1) stale.push(r.id)
    else wanted.splice(i, 1)
  }
  if (stale.length > 0) {
    const { error } = await admin.from('instance_off_days').delete().in('id', stale)
    if (error) throw new Error(error.message)
  }
  if (wanted.length > 0) {
    const { error } = await admin
      .from('instance_off_days')
      .insert(wanted.map((b) => toRow(instanceId, b)))
    if (error) throw new Error(error.message)
  }
}

function dateRange(starts: string | null, ends: string | null): string {
  if (!starts) return 'dates TBD'
  return ends && ends !== starts ? `${fmtLong(starts)} – ${fmtLong(ends)}` : fmtLong(starts)
}

// Every instructor staffed on a course, for the emails the portal sends about
// it. Not the calendar guest list — someone who has turned calendar invites
// off still needs to hear that their course moved.
async function assignedEmails(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string
): Promise<string[]> {
  const { data } = await admin
    .from('instance_instructors')
    .select('instructors(email)')
    .eq('instance_id', instanceId)
  return (data ?? [])
    .map((a) => (a.instructors as unknown as { email: string | null } | null)?.email)
    .filter((e): e is string => Boolean(e))
}

// A course stops existing in two ways: cancelled (the row stays, marked) or
// deleted outright. The instructors staffed on it can't tell the difference
// and don't need to — either way it's off their schedule.
async function emailCourseOff(
  recipients: string[],
  course: {
    courseName: string
    client_name: string | null
    location: string | null
    when: string
  }
) {
  if (recipients.length === 0 || !process.env.RESEND_API_KEY) return
  try {
    await sendMail({
      from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
      to: recipients,
      subject: `Cancelled — ${course.courseName} (${course.when})`,
      text: [
        `The following course has been cancelled:`,
        '',
        `Course: ${course.courseName}${course.client_name ? ` · ${course.client_name}` : ''}`,
        `Dates: ${course.when}`,
        course.location ? `Location: ${course.location}` : null,
        '',
        'It has been removed from your upcoming courses in the portal, and from your calendar. Any open tasks for it no longer need to be done.',
      ].filter((l): l is string => l !== null).join('\n'),
    })
  } catch (e) {
    console.error('Course cancellation email failed:', e)
  }
}

function toSlugPart(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function generateSlug(
  parts: (string | null | undefined)[],
  // The course being renamed holds the slug it is trying to keep, so without
  // this it collides with itself and every save appends another -1.
  excludeId?: string,
): Promise<string> {
  const admin = createAdminClient()
  const base = parts.filter(Boolean).map(p => toSlugPart(p!)).filter(Boolean).join('-')

  // Check for collisions and append suffix if needed
  let candidate = base
  let attempt = 0
  while (true) {
    const { data } = await admin.from('course_instances').select('id').eq('slug', candidate).maybeSingle()
    if (!data || data.id === excludeId) return candidate
    attempt++
    candidate = `${base}-${attempt}`
  }
}

// The slug was written once at creation and never again, so changing the course
// type, client, location or dates afterwards left it describing a course that
// no longer exists — a canyoneering course in Maui still reading
// "jungle-mobility-131-rqs-maui". Nothing resolves by slug (every route uses
// the id, and the only lookup is the collision check above), so it is a label,
// and a label that can lie is worse than no label.
//
// If it ever becomes a URL this has to stop: then a stable slug beats an
// accurate one, and renames need redirects.
async function resyncSlug(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data: inst } = await admin
    .from('course_instances')
    .select('slug, course_type, custom_title, client_name, location, starts_at')
    .eq('id', id)
    .single()
  if (!inst) return

  const displayName = inst.course_type === 'custom' ? (inst.custom_title ?? 'custom') : inst.course_type
  const next = await generateSlug([displayName, inst.client_name, inst.location, inst.starts_at], id)
  if (next !== inst.slug) {
    await admin.from('course_instances').update({ slug: next }).eq('id', id)
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
  const internal         = formData.get('internal') !== null
  const location         = (formData.get('location') as string) || null
  const regionRaw        = (formData.get('region') as string) || ''
  const region           = isValidRegion(regionRaw) ? regionRaw : null
  const venue_id         = (formData.get('venue_id') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contacts         = contactsFromForm(formData.get('contacts_json'))
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null
  const starts_at        = (formData.get('starts_at') as string) || null
  const ends_at          = (formData.get('ends_at') as string) || null

  // A course identical to one made moments ago is a double submit, not a second
  // course. Two MARSOC jungle courses in Oahu on the same dates were created
  // three seconds apart this way, and nothing downstream noticed: the slug
  // collision quietly became a -1 suffix, and the calendar got a second event.
  //
  // Bounded by time rather than rejected outright, because running the same
  // course for the same client twice is legitimate — doing it within a minute
  // is not.
  let duplicate = admin
    .from('course_instances')
    .select('id')
    .eq('course_type', course_type)
    .eq('status', status)
    .gt('created_at', new Date(Date.now() - 60_000).toISOString())

  // eq() never matches a null column, and most of these are routinely null —
  // a custom_title on a typed course, a location not yet decided — so a null
  // has to be compared as one or the guard silently never fires.
  for (const [column, value] of [
    ['custom_title', custom_title],
    ['client_name', client_name],
    ['location', location],
    ['starts_at', starts_at],
  ] as const) {
    duplicate = value === null ? duplicate.is(column, null) : duplicate.eq(column, value)
  }

  const { data: alreadyMade } = await duplicate.limit(1).maybeSingle()
  if (alreadyMade) redirect(`/admin/courses/${alreadyMade.id}`)

  const displayName = course_type === 'custom' ? (custom_title ?? 'custom') : course_type
  const slug = await generateSlug([displayName, client_name, location, starts_at])

  const { data, error } = await admin
    .from('course_instances')
    .insert({ course_category, course_type, custom_title, custom_categories, status, internal, starts_at, ends_at, location, region, venue_id, client_name, contacts, notes, max_students, instructor_slots, slug })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  after(() => syncCourseCalendar(admin, data.id))

  redirect(`/admin/courses/${data.id}`)
}

// The internal note on its own action, because it is no longer in the details
// form. Dates belong above it and a form can't nest, so the note left the form
// rather than updateInstanceDetails learning to write half a course — that one
// also sends the cancellation email off `status`, and a partial save with no
// status in it is not a thing it should ever have to reason about.
export async function updateInstanceNotes(id: string, formData: FormData) {
  await requireAdmin()
  const { error } = await createAdminClient()
    .from('course_instances')
    .update({ notes: ((formData.get('notes') as string) || '').trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${id}`)
  revalidatePath(`/portal/${id}`)
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
  const internal         = formData.get('internal') !== null
  const location         = (formData.get('location') as string) || null
  const regionRaw        = (formData.get('region') as string) || ''
  const region           = isValidRegion(regionRaw) ? regionRaw : null
  const venue_id         = (formData.get('venue_id') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contactsRaw      = formData.get('contacts_json')
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null

  const { error } = await admin
    .from('course_instances')
    // Only what this form actually carried. `notes` is written by its own
    // form and has never been a field here — but it was in this list, so every
    // save of the details form read it as absent and wrote null over whatever
    // was there. A course's intake notes are the one thing on the page nobody
    // can reconstruct, and they were being deleted by editing the client name.
    //
    // Guarded field by field rather than just for notes: any field this form
    // stops carrying should stop being written, not start being erased.
    .update({
      ...(formData.has('course_type') ? { course_category, course_type, custom_title, custom_categories } : {}),
      ...(formData.has('status') ? { status, internal } : {}),
      ...(formData.has('location') ? { location } : {}),
      ...(formData.has('region') ? { region } : {}),
      ...(formData.has('venue_id') ? { venue_id } : {}),
      ...(formData.has('client_name') ? { client_name } : {}),
      ...(formData.has('notes') ? { notes } : {}),
      ...(formData.has('max_students') ? { max_students } : {}),
      ...(formData.has('instructor_slots') ? { instructor_slots } : {}),
      ...(contactsRaw !== null ? { contacts: contactsFromForm(contactsRaw) } : {}),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  await resyncSlug(admin, id)

  // Course cancelled → tell every assigned instructor (best-effort). It
  // disappears from their portal home, so silence would leave them planning
  // around a course that no longer exists. Only if it was confirmed when it
  // died: a tentative course that falls through was never on anyone's
  // calendar to take off it.
  if (status === 'cancelled' && announcesChanges(before?.status)) {
    after(async () => {
      const { courseShortName } = await import('@/lib/courses')
      const { data: dates } = await admin
        .from('course_instances')
        .select('starts_at, ends_at')
        .eq('id', id)
        .single()
      await emailCourseOff(await assignedEmails(admin, id), {
        courseName: courseShortName(course_type, custom_title),
        client_name,
        location,
        when: dateRange(dates?.starts_at ?? null, dates?.ends_at ?? null),
      })
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

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('course_instances')
    .select('starts_at, ends_at, status, course_type, custom_title, client_name, location')
    .eq('id', id)
    .single()

  const { error } = await admin
    .from('course_instances')
    .update({ starts_at, ends_at })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Breaks live strictly inside the window, so moving the window can strand
  // one: a rest day now outside the course, or overlapping its first or last
  // day. Trimmed to the part that still falls inside, and dropped when none of
  // it does — the alternative is an off-day the course no longer contains,
  // which every reader of the dates then has to explain away.
  if (starts_at && ends_at) {
    const { data: offs } = await admin
      .from('instance_off_days')
      .select('id, off_date, end_date, instructors_paid')
      .eq('instance_id', id)
    if (offs && offs.length > 0) {
      await applyOffDays(admin, id, offs, clampOffDays(toSpans(offs), starts_at, ends_at))
    }
  }

  // Moved dates → tell every assigned instructor. They plan travel and time
  // off around these dates, and the calendar event changes under them
  // silently: the sync never emails, precisely so this can (best-effort).
  //
  // Confirmed courses only. A tentative course's dates slide around while
  // the client makes up their mind, and a mail for each slide is what makes
  // the one that matters unreadable.
  const moved =
    before !== null &&
    announcesChanges(before.status) &&
    (before.starts_at !== starts_at || before.ends_at !== ends_at)

  if (moved && process.env.RESEND_API_KEY) {
    after(async () => {
      try {
        const recipients = await assignedEmails(admin, id)
        if (recipients.length === 0) return

        const { courseShortName } = await import('@/lib/courses')
        const courseName = courseShortName(before.course_type, before.custom_title)
        const wasScheduled = Boolean(before.starts_at)
        const when = dateRange(starts_at, ends_at)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'

        await sendMail({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: `${starts_at ? (wasScheduled ? 'New dates' : 'Dates set') : 'Dates removed'} — ${courseName} (${when})`,
          text: [
            starts_at
              ? `${courseName} is now scheduled for ${when}.`
              : `${courseName} no longer has dates on the calendar.`,
            wasScheduled ? `Previously: ${dateRange(before.starts_at, before.ends_at)}` : null,
            '',
            `Course: ${courseName}${before.client_name ? ` · ${before.client_name}` : ''}`,
            before.location ? `Location: ${before.location}` : null,
            '',
            `Details: ${siteUrl}/portal/${id}`,
          ].filter((l): l is string => l !== null).join('\n'),
        })
      } catch (e) {
        console.error('Course date-change email failed:', e)
      }
    })
  }

  // The start date is part of the slug, so moving a course has to rewrite it.
  await resyncSlug(admin, id)

  after(() => syncCourseCalendar(createAdminClient(), id))
  revalidatePath(`/admin/courses/${id}`)
  revalidatePath(`/portal/${id}`)
}

export async function addOffDay(instanceId: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()
  const off_date = formData.get('off_date') as string
  const end_date = (formData.get('end_date') as string) || null
  // Paid unless the form says otherwise, which it no longer does: a break
  // here nearly always means the crew stays put and stays on the clock, so
  // the question is not worth asking twice on the way in. The rare unpaid one
  // is marked on its own row afterwards, where the answer is about a break
  // that exists rather than about the next one drawn.
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
    .insert({ instance_id: instanceId, off_date, end_date: end_date ?? null, instructors_paid: true })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

// Answered wrong, or the plan changed — flipped in place rather than by
// deleting the break and entering it again, which loses the dates to a retype.
export async function setOffDayPaid(instanceId: string, offDayId: string, instructors_paid: boolean) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instance_off_days')
    .update({ instructors_paid })
    .eq('id', offDayId)
    .eq('instance_id', instanceId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

export async function removeOffDay(instanceId: string, offDayId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instance_off_days')
    .delete()
    .eq('id', offDayId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

// Breaks as they are drawn on the calendar: a stroke over a run of days either
// marks them off or rubs them out, rather than a form describing one range.
// The gesture is the whole vocabulary, so the arithmetic that a form left to
// the person filling it in — this range meets that one, this click lands in
// the middle of a five-day break — happens here.
//
// `paint` false erases, and can split a break into the two ends that survive.
// A painted stroke swallows every break it touches or abuts into one row, and
// that row is paid if the stroke or anything it swallowed was: two breaks that
// disagree already read as paid everywhere else (see computeBlocks), and a
// stroke must not quietly take pay away from days that had it.
export async function paintOffDays(
  instanceId: string,
  a: string,
  b: string,
  paint: boolean,
  instructors_paid: boolean
) {
  await requireAdmin()
  const admin = createAdminClient()

  let from = a < b ? a : b
  let to = a < b ? b : a

  const { data: inst } = await admin
    .from('course_instances')
    .select('starts_at, ends_at')
    .eq('id', instanceId)
    .single()
  if (!inst?.starts_at || !inst?.ends_at) {
    throw new Error('Set the course start and end dates first — breaks are days inside that window')
  }

  // A break can only be drawn between the first day and the last: those two
  // are what the course *is*, so a stroke that overshoots them is clipped
  // rather than allowed to move them behind your back. Erasing is left
  // unclipped — a stroke that overshoots still clears everything it covered.
  if (paint) {
    const first = dayShift(inst.starts_at, 1)
    const last = dayShift(inst.ends_at, -1)
    if (from < first) from = first
    if (to > last) to = last
    if (to < from) return
  }

  const { data: rows } = await admin
    .from('instance_off_days')
    .select('id, off_date, end_date, instructors_paid')
    .eq('instance_id', instanceId)

  const next = strokeOffDays(toSpans(rows ?? []), from, to, paint, instructors_paid)
  await applyOffDays(admin, instanceId, rows ?? [], next)

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

export async function addModule(instanceId: string, formData: FormData) {
  await requireCourseStaff(instanceId)
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
  await requireCourseStaff(instanceId)

  const { error } = await createAdminClient()
    .from('course_modules')
    .delete()
    .eq('id', moduleId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// A section's audience was fixed at creation, so a curriculum block put in as
// instructors-only could never be opened up without deleting and rebuilding
// it. The pill on the section header is the control now, so it needs this.
export async function setModuleAudience(
  instanceId: string,
  moduleId: string,
  audience: 'internal' | 'shared'
) {
  await requireCourseStaff(instanceId)

  // course_modules keeps the older three-value enum, where 'both' is the
  // shared case and 'instructor' the internal one. moduleAudience() folds
  // them the same way on the way out.
  const { error } = await createAdminClient()
    .from('course_modules')
    .update({ audience: audience === 'internal' ? 'instructor' : 'both' })
    .eq('id', moduleId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

export async function addItem(instanceId: string, moduleId: string, formData: FormData) {
  await requireCourseStaff(instanceId)
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

// Per-delivery logistics — the welcome, and once the meeting point and time.
// Participant facing by definition, and the one part of course content that
// must be rewritten every delivery rather than pulled from the library.
//
// Only the fields the form actually submitted are written. Meeting point and
// time moved out to their own control, and blanket-writing every column would
// have had a save of the welcome text quietly null the meeting point — on the
// morning of, on a course where that is the one thing nobody can guess.
export async function updateCourseLogistics(id: string, formData: FormData) {
  // The welcome is delivery content — it is what a student reads first, and it
  // is written by whoever is running the course. Same gate as the notes and
  // the schedule beside it.
  const { requireCourseStaff } = await import('@/lib/course-access')
  await requireCourseStaff(id)
  const patch: Record<string, string | null> = {}
  for (const field of ['intro', 'meeting_point', 'meeting_time']) {
    if (!formData.has(field)) continue
    patch[field] = ((formData.get(field) as string) || '').trim() || null
  }
  if (Object.keys(patch).length === 0) return

  const { error } = await createAdminClient()
    .from('course_instances')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${id}`)
  revalidatePath(`/portal/${id}`)
}

// Library material for a course's pickers, fetched on demand. Loading ~700
// items on every course-page render cost about half a second whether or not
// anyone opened a picker — and every delete revalidates the page.
export async function loadPickerItems(instanceId: string) {
  await requireCourseStaff(instanceId)
  const admin = createAdminClient()

  const [{ data: inst }, { data: rows }] = await Promise.all([
    admin.from('course_instances').select('course_type, custom_categories, location, venue_id, region').eq('id', instanceId).single(),
    admin
      .from('library_items')
      .select('id, title, url, kind, audience, disciplines, topics, venue_id, region, bucket, source_class, venues(name)')
      .eq('status', 'published')
      .order('title')
      .limit(1000),
  ])
  if (!inst) return []

  const { courseCapabilityCategories } = await import('@/lib/capabilities')
  const matching = courseCapabilityCategories(inst.course_type, inst.custom_categories)

  // Place match, best signal first: the venue the course is actually set to,
  // then the region code. The old substring compare of location against venue
  // name is the last resort, kept only for courses with no venue set yet.
  const loc = (inst.location ?? '').toLowerCase().trim()

  return ((rows ?? []) as unknown as {
    id: string; title: string; url: string | null; kind: string; audience: 'internal' | 'shared'
    disciplines: string[]; topics: string[]; venue_id: string | null; region: string | null; bucket: string
    source_class: string | null; venues: { name: string } | null
  }[]).map((l) => {
    const venueName = l.venues?.name ?? null
    const venueMatches = inst.venue_id
      ? l.venue_id === inst.venue_id
      : Boolean(venueName && loc && (loc.includes(venueName.toLowerCase()) || venueName.toLowerCase().includes(loc)))
    const regionMatches = Boolean(inst.region && l.region && l.region === inst.region)
    return {
      id: l.id, title: l.title, url: l.url, kind: l.kind, audience: l.audience,
      disciplines: l.disciplines, topics: l.topics, venue_id: l.venue_id, bucket: l.bucket,
      venueName, sourceClass: l.source_class,
      suggested: venueMatches || regionMatches || l.disciplines.some((d) => matching.includes(d as never)),
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
// can be re-run after the template gains material. Items deselected in the
// preview arrive as excludeItemIds; a new section whose every item was
// deselected is not created at all.
export async function applyCourseTemplate(instanceId: string, templateId: string, excludeItemIds: string[] = []) {
  await requireAdmin()
  const admin = createAdminClient()
  const excluded = new Set(excludeItemIds)

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
    const allWanted = ((sec.course_template_items ?? []) as { item_id: string; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
    const wanted = allWanted.filter((w) => !excluded.has(w.item_id))

    let moduleId = byTitle.get(sec.title.toLowerCase())
    if (!moduleId && allWanted.length > 0 && wanted.length === 0) continue
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
  await requireCourseStaff(instanceId)
  const { error } = await createAdminClient()
    .from('course_items')
    .update({ audience })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

export async function deleteItem(instanceId: string, itemId: string) {
  await requireCourseStaff(instanceId)

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
        await sendMail({
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

  // Who to tell, and what to tell them, has to be read before the delete —
  // the assignments cascade away with the row.
  const [{ data: course }, recipients] = await Promise.all([
    admin
      .from('course_instances')
      .select('course_type, custom_title, client_name, location, starts_at, ends_at, status')
      .eq('id', instanceId)
      .single(),
    assignedEmails(admin, instanceId),
  ])

  // Remove the mirrored Google event before the row (and its pointers) go.
  await removeCourseEvent(admin, instanceId)

  const { error } = await admin
    .from('course_instances')
    .delete()
    .eq('id', instanceId)

  if (error) throw new Error(error.message)

  // A deleted course reads the same as a cancelled one from the crew's side,
  // and follows the same rule: only a confirmed course is announced going
  // away. An already-cancelled one they have heard about; a tentative one
  // they were never promised.
  if (course && announcesChanges(course.status)) {
    after(async () => {
      const { courseShortName } = await import('@/lib/courses')
      await emailCourseOff(recipients, {
        courseName: courseShortName(course.course_type, course.custom_title),
        client_name: course.client_name,
        location: course.location,
        when: dateRange(course.starts_at, course.ends_at),
      })
    })
  }
  revalidatePath('/admin/courses')
  revalidatePath('/admin/expenses')
}

// ─── Student invite links ─────────────────────────────────────────────────────

// Creates (or rotates) the unique student signup link for a course instance.
// expiresIn: days from now, 'never' for no expiry, or omitted for the default —
// valid through the course plus a week of margin; 30 days from now when the
// course has no end date or already ended.
// When a link should die. Shared by the invite link and the view-only links,
// because "valid until a week after the course" is the same sensible default
// whichever kind you just minted, and two copies of it drift.
async function linkExpiry(instanceId: string, expiresIn?: number | 'never'): Promise<Date | null> {
  const admin = createAdminClient()
  const { data: inst } = await admin
    .from('course_instances')
    .select('ends_at')
    .eq('id', instanceId)
    .single()
  if (!inst) throw new Error('Course not found')

  const dayMs = 24 * 60 * 60 * 1000
  if (expiresIn === 'never') return null
  if (expiresIn != null) {
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 365) {
      throw new Error('Expiry must be between 1 and 365 days')
    }
    return new Date(Date.now() + expiresIn * dayMs)
  }
  const fromCourseEnd = inst.ends_at
    ? new Date(new Date(inst.ends_at + 'T00:00:00').getTime() + 7 * dayMs)
    : null
  return fromCourseEnd && fromCourseEnd.getTime() > Date.now()
    ? fromCourseEnd
    : new Date(Date.now() + 30 * dayMs)
}

// Read-only links to the student page, for people who shouldn't have an
// account: the client's POC, an instructor being sounded out. One row per
// person you send it to, so revoking one doesn't kill the others.
export async function createViewShare(
  instanceId: string,
  label: string,
  expiresIn?: number | 'never'
) {
  const user = await requireAdmin()
  const admin = createAdminClient()

  const expires = await linkExpiry(instanceId, expiresIn)
  const { error } = await admin.from('course_view_shares').insert({
    instance_id: instanceId,
    label: label.trim().slice(0, 120) || null,
    created_by: user.id,
    expires_at: expires ? expires.toISOString() : null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Revoked rather than deleted: a link that stopped working is a thing you may
// have to account for later, and a row that is gone answers no questions.
export async function revokeViewShare(shareId: string, instanceId: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('course_view_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function generateInviteLink(instanceId: string, expiresIn?: number | 'never') {
  await requireAdmin()
  const admin = createAdminClient()

  const expires = await linkExpiry(instanceId, expiresIn)

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
