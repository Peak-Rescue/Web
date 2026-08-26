'use server'

import { revalidatePath } from 'next/cache'
import { requireCourseStaff } from '@/lib/course-access'
import { normalizeDocLink } from '@/lib/doc-links'
import type { UpdateLink, UpdateAttachment } from './update-actions'

const MAX_FIELD = 500

/** Whether this day has already been announced — the difference between
    "here's where we're meeting" and "we're not meeting where I told you",
    which are not the same news.

    Deliberately not a comparison of the fields with their previous values: on
    a course that posts tomorrow's plan every evening nothing has changed, it
    is simply a different day, and a week of "the plan has changed" would spend
    the one phrase that needs to make people re-read. */
export type MeetingSaveResult = { announced: boolean }

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
): Promise<MeetingSaveResult> {
  const { admin } = await requireCourseStaff(instanceId)

  const point = input.meetingPoint.trim().slice(0, MAX_FIELD)
  const time = input.meetingTime.trim().slice(0, MAX_FIELD)
  // The field is a date input, so anything else is a fault rather than
  // something a person did.
  const date = input.meetingDate.trim()
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('That meeting date is not a date')

  // Which day this plan is for, and whether the course has heard about that
  // day already. An empty date means day one, which the course start answers —
  // the same fallback the block reads with.
  const { data: before } = await admin
    .from('course_instances')
    .select('starts_at, meeting_announced_dates')
    .eq('id', instanceId)
    .single()
  const day = date || (before?.starts_at as string | null) || null
  const announced = Boolean(day && (before?.meeting_announced_dates ?? []).includes(day))

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
  return { announced }
}

// Written once the announcement has actually gone out, which is why it is its
// own step rather than part of the save: saving is not telling anyone, and a
// composer closed without sending must not make the next send read as a
// correction.
export async function noteMeetingAnnounced(instanceId: string, meetingDate: string) {
  const { admin } = await requireCourseStaff(instanceId)

  const { data: row } = await admin
    .from('course_instances')
    .select('starts_at, meeting_announced_dates')
    .eq('id', instanceId)
    .single()
  const day = meetingDate.trim() || (row?.starts_at as string | null) || null
  if (!day) return

  const dates: string[] = row?.meeting_announced_dates ?? []
  if (dates.includes(day)) return

  const { error } = await admin
    .from('course_instances')
    .update({ meeting_announced_dates: [...dates, day].sort() })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)
}
