'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertTemplateTasks } from '@/lib/course-tasks'

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
  const status           = (formData.get('status') as string) || 'tentative'
  const location         = (formData.get('location') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contact_name     = (formData.get('contact_name') as string) || null
  const contact_phone    = (formData.get('contact_phone') as string) || null
  const contact_email    = (formData.get('contact_email') as string) || null
  const contact2_name    = (formData.get('contact2_name') as string) || null
  const contact2_phone   = (formData.get('contact2_phone') as string) || null
  const contact2_email   = (formData.get('contact2_email') as string) || null
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null
  const starts_at        = (formData.get('starts_at') as string) || null
  const ends_at          = (formData.get('ends_at') as string) || null

  const displayName = course_type === 'custom' ? (custom_title ?? 'custom') : course_type
  const slug = await generateSlug([displayName, client_name, location, starts_at])

  const { data, error } = await admin
    .from('course_instances')
    .insert({ course_category, course_type, custom_title, status, starts_at, ends_at, location, client_name, contact_name, contact_phone, contact_email, contact2_name, contact2_phone, contact2_email, notes, max_students, instructor_slots, slug })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Every new course starts with the standard ops checklist.
  await insertTemplateTasks(admin, data.id, null)

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
  const status           = formData.get('status') as string
  const location         = (formData.get('location') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contact_name     = (formData.get('contact_name') as string) || null
  const contact_phone    = (formData.get('contact_phone') as string) || null
  const contact_email    = (formData.get('contact_email') as string) || null
  const contact2_name    = (formData.get('contact2_name') as string) || null
  const contact2_phone   = (formData.get('contact2_phone') as string) || null
  const contact2_email   = (formData.get('contact2_email') as string) || null
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null

  const { error } = await admin
    .from('course_instances')
    .update({ course_category, course_type, custom_title, status, location, client_name, contact_name, contact_phone, contact_email, contact2_name, contact2_phone, contact2_email, notes, max_students, instructor_slots })
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

  revalidatePath(`/admin/courses/${id}`)
  revalidatePath('/admin/courses')
  revalidatePath(`/portal/${id}`)
  revalidatePath('/admin')
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
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.peakrescuemountainguides.com'
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

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
  revalidatePath('/admin')
}

export async function removeInstructor(instanceId: string, instructorId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instance_instructors')
    .delete()
    .eq('instance_id', instanceId)
    .eq('instructor_id', instructorId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Deletes a course instance. Enrollments, instructor assignments, date
// ranges, and modules cascade away; expense items keep their rows but lose
// the course link (instance_id is on delete set null).
export async function deleteInstance(instanceId: string) {
  await requireAdmin()
  const admin = createAdminClient()

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
