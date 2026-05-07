'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null
  const starts_at        = (formData.get('starts_at') as string) || null
  const ends_at          = (formData.get('ends_at') as string) || null

  const displayName = course_type === 'custom' ? (custom_title ?? 'custom') : course_type
  const slug = await generateSlug([displayName, client_name, location, starts_at])

  const { data, error } = await admin
    .from('course_instances')
    .insert({ course_category, course_type, custom_title, status, starts_at, ends_at, location, client_name, contact_name, contact_phone, contact_email, notes, max_students, instructor_slots, slug })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  redirect(`/admin/courses/${data.id}`)
}

export async function updateInstanceDetails(id: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const course_category  = (formData.get('course_category') as string) || 'tactical'
  const course_type      = (formData.get('course_type') as string) || 'custom'
  const custom_title     = (formData.get('custom_title') as string) || null
  const status           = formData.get('status') as string
  const location         = (formData.get('location') as string) || null
  const client_name      = (formData.get('client_name') as string) || null
  const contact_name     = (formData.get('contact_name') as string) || null
  const contact_phone    = (formData.get('contact_phone') as string) || null
  const contact_email    = (formData.get('contact_email') as string) || null
  const notes            = (formData.get('notes') as string) || null
  const max_students     = formData.get('max_students') ? Number(formData.get('max_students')) : null
  const instructor_slots = formData.get('instructor_slots') ? Number(formData.get('instructor_slots')) : null

  const { error } = await admin
    .from('course_instances')
    .update({ course_category, course_type, custom_title, status, location, client_name, contact_name, contact_phone, contact_email, notes, max_students, instructor_slots })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${id}`)
  revalidatePath('/admin/courses')
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
  const off_date = formData.get('off_date') as string
  const end_date = (formData.get('end_date') as string) || null
  if (!off_date) throw new Error('Date is required')

  const { error } = await createAdminClient()
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

  const { error } = await admin
    .from('instance_instructors')
    .upsert({ instance_id: instanceId, instructor_id, role }, { onConflict: 'instance_id,instructor_id' })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
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
