'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireCourseStaff } from '@/lib/course-access'
import { syncCourseCalendar } from '@/lib/google-calendar'

const MAX_NOTES = 8000

// The internal notes, editable from the course page itself.
//
// They were read-only here and editable only in the admin course editor, which
// meant an instructor who noticed the gate code was wrong had nowhere to write
// it down — and admins had to leave the page they were reading it on. Same
// column, same text, two places to type it.
export async function saveCourseNotes(instanceId: string, notes: string) {
  const { admin } = await requireCourseStaff(instanceId)

  const text = notes.trim().slice(0, MAX_NOTES)
  const { error } = await admin
    .from('course_instances')
    .update({ notes: text || null })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)

  // The notes are the body of the calendar event, so an edit here has to reach
  // Google the same way the admin editor's does — otherwise the crew keeps
  // reading a gate code that was corrected days ago.
  after(() => syncCourseCalendar(admin, instanceId))

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
}
