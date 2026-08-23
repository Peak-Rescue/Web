import type { SupabaseClient } from '@supabase/supabase-js'

export type MeetingLink = { label: string; url: string }
export type MeetingFile = { path: string; filename: string; url: string }

/** What a student navigates by: the prose, the hour, and the pin. */
export type MeetingDetailsData = {
  meetingPoint: string | null
  meetingTime: string | null
  links: MeetingLink[]
  files: MeetingFile[]
}

const DOC_BUCKET = 'task-documents'

// Attachments live in a private bucket, so their URLs are signed here rather
// than stored — one call for every file on the meeting point, on whichever
// page is showing it.
export async function meetingDetails(
  admin: SupabaseClient,
  row: {
    meeting_point: string | null
    meeting_time: string | null
    meeting_links: MeetingLink[] | null
    meeting_attachments: { path: string; filename: string }[] | null
  }
): Promise<MeetingDetailsData> {
  const attachments = row.meeting_attachments ?? []
  const { data: signed } = attachments.length
    ? await admin.storage.from(DOC_BUCKET).createSignedUrls(attachments.map((a) => a.path), 3600)
    : { data: [] }
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  return {
    meetingPoint: row.meeting_point,
    meetingTime: row.meeting_time,
    links: row.meeting_links ?? [],
    files: attachments.map((a) => ({ ...a, url: byPath.get(a.path) ?? '#' })),
  }
}

export const MEETING_COLUMNS = 'meeting_point, meeting_time, meeting_links, meeting_attachments'
