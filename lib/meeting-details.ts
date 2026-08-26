import type { SupabaseClient } from '@supabase/supabase-js'

export type MeetingLink = { label: string; url: string }
export type MeetingFile = { path: string; filename: string; url: string }

/** What a student navigates by: the day, the prose, the hour, and the pin. */
export type MeetingDetailsData = {
  meetingDate: string | null
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
    meeting_date?: string | null
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
    meetingDate: row.meeting_date ?? null,
    meetingPoint: row.meeting_point,
    meetingTime: row.meeting_time,
    links: row.meeting_links ?? [],
    files: attachments.map((a) => ({ ...a, url: byPath.get(a.path) ?? '#' })),
  }
}

export const MEETING_COLUMNS =
  'meeting_date, meeting_point, meeting_time, meeting_links, meeting_attachments'

// The day the plan is for, in words. Null meeting_date means day one — the
// fallback lives here rather than in the column so that a course whose dates
// move takes its meeting day along with it, which is what "day one" meant when
// nobody set a date.
//
// Long form heads the block and the announcement; short form goes in an email
// subject, where it sits beside the course name and has to earn its width.
export function meetingDayLabel(
  meetingDate: string | null,
  startsAt: string | null,
  form: 'long' | 'short' = 'long'
): string | null {
  const iso = meetingDate ?? startsAt
  if (!iso) return null
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US',
    form === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric' })
}

// Whether day one has been and gone.
//
// Where to meet is the most important thing on the page right up until the
// moment everyone has met, and dead weight from then on — so the block that
// carries it folds itself away once the course has started. Compared as plain
// YYYY-MM-DD strings against the local day, because "has the course started"
// is a question about the calendar and not about the hour.
export function courseHasStarted(startsAt: string | null): boolean {
  if (!startsAt) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return startsAt <= today
}
