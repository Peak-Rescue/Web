'use server'

import { revalidatePath } from 'next/cache'
import { requireCourseStaff } from '@/lib/course-access'
import { normalizeDocLink } from '@/lib/doc-links'
import type { UpdateLink, UpdateAttachment } from './update-actions'

const MAX_FIELD = 500

// Where and when to meet, editable from the course page itself.
//
// It lived only in the admin course editor, which is a screen you reach from a
// desk — while the person who needs to change it is the one standing in the
// wrong parking lot at 0530. Same argument as the internal notes, and the same
// gate: any instructor assigned to this course, not just an admin.
//
// Saving does not email. Telling people is the next step and its own decision,
// made in the update composer where the audience, a map link and a photo of
// the trailhead all live.
export async function saveMeetingDetails(
  instanceId: string,
  input: {
    // Empty means day one: the course start already says which day that is,
    // and storing a copy of it would be a second answer to go stale when the
    // course moves.
    meetingDate: string
    meetingPoint: string
    meetingTime: string
    // The dropped pin, the photo of the gate. They belong to the meeting
    // point rather than to the announcement about it: a day later the
    // announcement is somewhere down the updates feed, which is the one place
    // nobody looks when they are already driving.
    links: UpdateLink[]
    attachments: UpdateAttachment[]
  }
): Promise<void> {
  const { admin } = await requireCourseStaff(instanceId)

  const point = input.meetingPoint.trim().slice(0, MAX_FIELD)
  const time = input.meetingTime.trim().slice(0, MAX_FIELD)
  // The field is a date input, so anything else is a fault rather than
  // something a person did.
  const date = input.meetingDate.trim()
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('That meeting date is not a date')

  const links = (input.links ?? []).slice(0, 20).map((l) => {
    const { url, filename } = normalizeDocLink(l.url, l.label ?? '')
    return { label: filename, url }
  })
  const attachments = (input.attachments ?? []).slice(0, 20)

  const { error } = await admin
    .from('course_instances')
    .update({
      meeting_date: date || null,
      meeting_point: point || null,
      meeting_time: time || null,
      meeting_links: links,
      meeting_attachments: attachments,
    })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// The same save, attached to a schedule day instead of the course.
//
// A day has no date of its own — it is the Nth date the course runs, worked
// out from the course's own dates so that a schedule saved to the shelf as a
// template belongs to no calendar. So there is no date to write here, which is
// the only thing that differs from the course-level save above.
export async function saveDayMeetingDetails(
  dayId: string,
  input: {
    meetingPoint: string
    meetingTime: string
    links: UpdateLink[]
    attachments: UpdateAttachment[]
  }
): Promise<void> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const probe = createAdminClient()

  // Which course this day belongs to, asked before anything is authorised:
  // days and blocks only know their parent, and the gate is a fact about the
  // course.
  const { data: parent } = await probe
    .from('schedule_days')
    .select('course_schedules(instance_id)')
    .eq('id', dayId)
    .single()
  const instanceId = (parent?.course_schedules as unknown as { instance_id: string | null } | null)?.instance_id
  if (!instanceId) throw new Error('That day is not on a course')

  const { admin } = await requireCourseStaff(instanceId)

  const links = (input.links ?? []).slice(0, 20).map((l) => {
    const { url, filename } = normalizeDocLink(l.url, l.label ?? '')
    return { label: filename, url }
  })

  const { error } = await admin
    .from('schedule_days')
    .update({
      meeting_point: input.meetingPoint.trim().slice(0, MAX_FIELD) || null,
      meeting_time: input.meetingTime.trim().slice(0, MAX_FIELD) || null,
      meeting_links: links,
      meeting_attachments: (input.attachments ?? []).slice(0, 20),
    })
    .eq('id', dayId)
  if (error) throw new Error(error.message)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
}
