'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCourseCalendar, deleteImportedEvent } from '@/lib/google-calendar'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

// Turns a manual calendar event into a portal course: creates the instance,
// removes the manual event (where the calendar is writable), and lets the
// sync engine write the portal-managed replacement to the right calendar.
export async function importCourseFromEvent(formData: FormData) {
  const admin = await requireAdmin()

  const course_category = (formData.get('course_category') as string) || 'tactical'
  const course_type = (formData.get('course_type') as string) || 'custom'
  const custom_title = (formData.get('custom_title') as string) || (formData.get('summary') as string) || null
  const custom_categories = course_type === 'custom' ? (formData.getAll('custom_categories') as string[]) : null
  const status = (formData.get('status') as string) || 'confirmed'
  const client_name = (formData.get('client_name') as string) || null
  const location = (formData.get('location') as string) || null
  const starts_at = (formData.get('starts_at') as string) || null
  const ends_at = (formData.get('ends_at') as string) || null
  const sourceCalendarId = (formData.get('source_calendar_id') as string) || null
  const sourceEventId = (formData.get('source_event_id') as string) || null

  const { data, error } = await admin
    .from('course_instances')
    .insert({
      course_category,
      course_type,
      custom_title: course_type === 'custom' ? custom_title : (formData.get('custom_title') as string) || null,
      custom_categories,
      status,
      starts_at,
      ends_at,
      location,
      client_name,
      // The event id in the notes lets the import page recognize already-
      // imported events on calendars we can't delete from (the general one).
      notes: sourceEventId ? `Imported from Google Calendar (event ${sourceEventId}).` : null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create the course')

  // The general Peak Rescue calendar is read-only to the portal — imported
  // events there must be deleted by hand in Google Calendar.
  const fromGeneral = Boolean(sourceCalendarId && sourceCalendarId === process.env.GCAL_GENERAL_CALENDAR_ID)

  after(async () => {
    // Retire the manual event first so the portal-managed one isn't a duplicate.
    if (sourceCalendarId && sourceEventId && !fromGeneral) {
      await deleteImportedEvent(sourceCalendarId, sourceEventId)
    }
    await syncCourseCalendar(admin, data.id)
  })

  revalidatePath('/admin/courses')
  revalidatePath('/admin/courses/import')
  redirect(`/admin/courses/import?imported=${data.id}${fromGeneral ? '&manual=1' : ''}`)
}

// For manual events whose course already exists in the portal: just remove the
// event so it stops cluttering the calendar and this page.
export async function dismissImportedEvent(formData: FormData) {
  await requireAdmin()
  const calendarId = formData.get('source_calendar_id') as string
  const eventId = formData.get('source_event_id') as string
  if (calendarId && eventId) await deleteImportedEvent(calendarId, eventId)
  revalidatePath('/admin/courses/import')
  redirect('/admin/courses/import')
}
