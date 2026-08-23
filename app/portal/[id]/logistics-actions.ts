'use server'

import { revalidatePath } from 'next/cache'
import { requireCourseStaff } from '@/lib/course-access'

const MAX_FIELD = 500

/** Whether there was a plan before this save, and whether this save moved it —
    the difference between "here's where we're meeting" and "we're not meeting
    where I told you", which are not the same news. */
export type MeetingSaveResult = { had: boolean; changed: boolean }

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
  input: { meetingPoint: string; meetingTime: string }
): Promise<MeetingSaveResult> {
  const { admin } = await requireCourseStaff(instanceId)

  const point = input.meetingPoint.trim().slice(0, MAX_FIELD)
  const time = input.meetingTime.trim().slice(0, MAX_FIELD)

  // Read before write so the announcement can say whether this is the plan
  // arriving or the plan moving.
  const { data: before } = await admin
    .from('course_instances')
    .select('meeting_point, meeting_time')
    .eq('id', instanceId)
    .single()
  const had = Boolean(before?.meeting_point || before?.meeting_time)
  const changed =
    (before?.meeting_point ?? null) !== (point || null) ||
    (before?.meeting_time ?? null) !== (time || null)

  const { error } = await admin
    .from('course_instances')
    .update({ meeting_point: point || null, meeting_time: time || null })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)

  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
  return { had, changed }
}
