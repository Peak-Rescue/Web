// Google Calendar mirror. The portal is the source of truth for courses; the
// three course calendars (Military Programs / Civilian Courses / Prospective
// Classes) are one-way projections:
//
//   tentative, quoted            → Prospective Classes
//   confirmed/completed tactical → Military Programs
//   confirmed/completed civilian → Civilian Courses
//   cancelled / dateless         → no event
//
// Status or designation changes MOVE the event between calendars. All entry
// points are safe no-ops when the env isn't configured, and never throw —
// they're invoked via after() from actions, and a Google hiccup must never
// break a portal write. The general Peak Rescue (admin) calendar is never a
// sync target — the import tool only retires legacy course events from it.

import { createSign } from 'crypto'
import { type createAdminClient } from '@/lib/supabase/admin'
import { courseEventTitle } from '@/lib/courses'

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const API = 'https://www.googleapis.com/calendar/v3'

type ServiceKey = { client_email: string; private_key: string }

function serviceKey(): ServiceKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    const k = JSON.parse(raw)
    return k.client_email && k.private_key ? k : null
  } catch {
    return null
  }
}

function calendarIds() {
  return {
    military: process.env.GCAL_MILITARY_CALENDAR_ID || null,
    civilian: process.env.GCAL_CIVILIAN_CALENDAR_ID || null,
    prospective: process.env.GCAL_PROSPECTIVE_CALENDAR_ID || null,
    // The admin calendar. Not required for sync to be considered on — an
    // internal course falls back to the client calendars if it's unset.
    general: process.env.GCAL_GENERAL_CALENDAR_ID || null,
  }
}

export function calendarSyncEnabled(): boolean {
  const ids = calendarIds()
  return Boolean(serviceKey() && ids.military && ids.civilian && ids.prospective)
}

// ─── Auth (JWT → access token, cached per identity until near expiry) ───────
//
// With GCAL_INVITE_AS set (a Workspace user, via domain-wide delegation) the
// portal acts as that user, which is what lets events carry attendees — plain
// service accounts can't send invites. If impersonation fails (delegation
// revoked/misconfigured), we fall back to the service identity and simply
// write events without attendees rather than breaking sync.

const cached = new Map<string, { token: string; exp: number }>()
let impersonationBroken = false

async function getToken(sub: string | null): Promise<string> {
  const cacheKey = sub ?? ''
  const hit = cached.get(cacheKey)
  if (hit && hit.exp > Date.now() + 60_000) return hit.token
  const key = serviceKey()
  if (!key) throw new Error('Calendar sync not configured')

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    ...(sub ? { sub } : {}),
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`Google auth failed: ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached.set(cacheKey, { token: data.access_token, exp: Date.now() + data.expires_in * 1000 })
  return data.access_token
}

async function activeAuth(): Promise<{ token: string; canInvite: boolean }> {
  const sub = process.env.GCAL_INVITE_AS || null
  if (sub && !impersonationBroken) {
    try {
      return { token: await getToken(sub), canInvite: true }
    } catch (e) {
      impersonationBroken = true
      console.error('gcal impersonation failed — falling back to service identity (no invites):', e)
    }
  }
  return { token: await getToken(null), canInvite: false }
}

async function gcal(method: string, path: string, body?: unknown): Promise<Response> {
  const { token } = await activeAuth()
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

// ─── Routing + event shape ──────────────────────────────────────────────────

type CourseRow = {
  id: string
  ref_number: number
  course_type: string
  course_category: string | null
  custom_title: string | null
  client_name: string | null
  location: string | null
  starts_at: string | null
  ends_at: string | null
  status: string
  internal?: boolean | null
  notes: string | null
  gcal_event_id: string | null
  gcal_calendar_id: string | null
}

const COURSE_COLS =
  'id, ref_number, course_type, course_category, custom_title, client_name, location, starts_at, ends_at, status, internal, notes, gcal_event_id, gcal_calendar_id'

function targetCalendar(c: CourseRow): string | null {
  if (c.status === 'cancelled' || !c.starts_at) return null
  const ids = calendarIds()
  // Work of our own with no client at all belongs on the admin calendar
  // whatever its type or status says — it keeps CE days and instructor
  // training off the two calendars people scan to see what we're selling.
  // A consultation has no students either but is still a client job, so it
  // stays on that client's calendar.
  if (c.internal && !c.client_name && ids.general) return ids.general
  if (c.status === 'tentative' || c.status === 'quoted') return ids.prospective
  // confirmed / completed: military vs civilian by course designation
  return c.course_category === 'tactical' ? ids.military : ids.civilian
}

type CrewMember = { name: string; email: string | null }

function buildEvent(c: CourseRow, crew: CrewMember[]) {
  const ref = `PR-${String(c.ref_number).padStart(4, '0')}`
  // Calendar events are shared with people outside this dev environment, so the
  // portal link must always target the live site — never NEXT_PUBLIC_SITE_URL,
  // which is localhost during local development.
  const siteUrl = 'https://peak-rescue.com'
  // All-day events; Google's end date is exclusive.
  const endExclusive = new Date(Date.parse(c.ends_at ?? c.starts_at!) + 86_400_000)
    .toISOString()
    .slice(0, 10)
  return {
    // crew arrives lead-first; first names match the team's long-standing
    // manual event convention.
    summary: courseEventTitle(c, crew.map((m) => m.name.split(' ')[0]))
      + (c.status === 'tentative' || c.status === 'quoted' ? ` (${c.status})` : ''),
    location: c.location ?? undefined,
    // Course notes lead; the footer's "managed by the Peak Rescue portal"
    // marker must stay — the import tool uses it to recognize synced events.
    description: [
      c.notes?.trim() || null,
      [`${ref} · managed by the Peak Rescue portal`, `${siteUrl}/portal/${c.id}`].join('\n'),
    ]
      .filter(Boolean)
      .join('\n\n'),
    start: { date: c.starts_at },
    end: { date: endExclusive },
    guestsCanModify: false,
    guestsCanInviteOthers: false,
  }
}

// ─── Sync entry points (never throw) ────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>

export async function syncCourseCalendar(admin: Admin, instanceId: string): Promise<void> {
  if (!calendarSyncEnabled()) return
  try {
    const [{ data: c }, { data: crewRows }] = await Promise.all([
      admin.from('course_instances').select(COURSE_COLS).eq('id', instanceId).maybeSingle(),
      admin
        .from('instance_instructors')
        .select('role, instructors(name, email)')
        .eq('instance_id', instanceId),
    ])
    if (!c) return
    const course = c as CourseRow
    const target = targetCalendar(course)
    const crew: CrewMember[] = (
      (crewRows ?? []) as unknown as { role: string; instructors: { name: string; email: string | null } | null }[]
    )
      .filter((a) => a.instructors)
      .sort((a, b) => (a.role === 'lead' ? 0 : 1) - (b.role === 'lead' ? 0 : 1))
      .map((a) => ({ name: a.instructors!.name, email: a.instructors!.email }))

    // No event should exist (cancelled / dateless): remove if present, telling
    // any invited instructors the event is off.
    if (!target) {
      if (course.gcal_event_id && course.gcal_calendar_id) {
        await deleteEvent(course.gcal_calendar_id, course.gcal_event_id, true)
        await admin
          .from('course_instances')
          .update({ gcal_event_id: null, gcal_calendar_id: null })
          .eq('id', instanceId)
      }
      return
    }

    const { canInvite } = await activeAuth()
    const event = buildEvent(course, crew)

    // Current Google copy, fetched before any move: RSVPs must be carried
    // through our patches (sending attendees without responseStatus resets
    // them), and comparing it tells us whether this change warrants emailing
    // attendees or can be applied silently.
    type ExistingEvent = {
      attendees?: { email?: string; responseStatus?: string }[]
      start?: { date?: string }
      end?: { date?: string }
    }
    let existing: ExistingEvent | null = null
    if (course.gcal_event_id && course.gcal_calendar_id) {
      const res = await gcal(
        'GET',
        `/calendars/${encodeURIComponent(course.gcal_calendar_id)}/events/${course.gcal_event_id}`
      )
      if (res.ok) {
        existing = (await res.json()) as ExistingEvent
      } else if (res.status === 404 || res.status === 410) {
        course.gcal_event_id = null // deleted out from under us — recreate below
      }
    }

    // Attendees only while impersonating (GCAL_INVITE_AS) — the plain service
    // identity is rejected outright for events that carry them.
    const attendees = canInvite
      ? crew
          .filter((m) => m.email)
          .map((m) => {
            const prev = existing?.attendees?.find(
              (a) => a.email?.toLowerCase() === m.email!.toLowerCase()
            )
            return {
              email: m.email!,
              displayName: m.name,
              ...(prev?.responseStatus ? { responseStatus: prev.responseStatus } : {}),
            }
          })
      : null
    const eventBody = attendees ? { ...event, attendees } : event

    // Email attendees only for changes worth their attention: a new event or
    // moved dates. Everything else — including crew changes, which rewrite the
    // title — applies silently; Google can't email just the affected person,
    // so a crew-change notification would blast the whole existing crew too.
    const datesChanged =
      existing !== null &&
      (existing.start?.date !== event.start.date || existing.end?.date !== event.end.date)
    const sendUpdates = existing === null || datesChanged ? 'all' : 'none'

    // Existing event on the wrong calendar → move it silently (the follow-up
    // patch sends the notification if the change is meaningful).
    if (course.gcal_event_id && course.gcal_calendar_id && course.gcal_calendar_id !== target) {
      const moved = await gcal(
        'POST',
        `/calendars/${encodeURIComponent(course.gcal_calendar_id)}/events/${course.gcal_event_id}/move?destination=${encodeURIComponent(target)}&sendUpdates=none`
      )
      if (!moved.ok) {
        // Move can fail across sharing edge cases — fall back to delete + recreate.
        console.error(`gcal move failed (${moved.status}): ${await moved.text()}`)
        await deleteEvent(course.gcal_calendar_id, course.gcal_event_id)
        course.gcal_event_id = null
      }
      course.gcal_calendar_id = target
    }

    if (course.gcal_event_id) {
      const res = await gcal(
        'PATCH',
        `/calendars/${encodeURIComponent(target)}/events/${course.gcal_event_id}?sendUpdates=${sendUpdates}`,
        eventBody
      )
      if (res.status === 404 || res.status === 410) {
        course.gcal_event_id = null // event was deleted out from under us — recreate
      } else if (!res.ok) {
        console.error(`gcal patch failed (${res.status}): ${await res.text()}`)
        return
      }
    }

    if (!course.gcal_event_id) {
      const res = await gcal(
        'POST',
        `/calendars/${encodeURIComponent(target)}/events?sendUpdates=all`,
        eventBody
      )
      if (!res.ok) {
        console.error(`gcal insert failed (${res.status}): ${await res.text()}`)
        return
      }
      const created = (await res.json()) as { id: string }
      course.gcal_event_id = created.id
    }

    await admin
      .from('course_instances')
      .update({ gcal_event_id: course.gcal_event_id, gcal_calendar_id: target })
      .eq('id', instanceId)
  } catch (e) {
    console.error('Calendar sync failed:', e)
  }
}

// Call BEFORE deleting the instance row (the event pointers die with it).
export async function removeCourseEvent(admin: Admin, instanceId: string): Promise<void> {
  if (!calendarSyncEnabled()) return
  try {
    const { data: c } = await admin
      .from('course_instances')
      .select('gcal_event_id, gcal_calendar_id')
      .eq('id', instanceId)
      .maybeSingle()
    if (c?.gcal_event_id && c.gcal_calendar_id) {
      await deleteEvent(c.gcal_calendar_id, c.gcal_event_id, true)
    }
  } catch (e) {
    console.error('Calendar event removal failed:', e)
  }
}

// notify=true emails any invited attendees a cancellation; imports and
// internal cleanup stay silent.
async function deleteEvent(calendarId: string, eventId: string, notify = false): Promise<void> {
  const res = await gcal(
    'DELETE',
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${notify ? 'all' : 'none'}`
  )
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.error(`gcal delete failed (${res.status}): ${await res.text()}`)
  }
}

// ─── Import support (read-only listing + manual-event cleanup) ──────────────

export type GcalEvent = {
  id: string
  summary: string
  start: string // yyyy-mm-dd
  end: string // inclusive
  location: string | null
  description: string | null
  attachments: { title: string; url: string }[]
}

// Upcoming events on a calendar, normalized to all-day date ranges. Returns
// null when the calendar isn't readable (not shared with the service account).
export async function listUpcomingEvents(calendarId: string): Promise<GcalEvent[] | null> {
  try {
    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    })
    const res = await gcal('GET', `/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      items?: {
        id: string
        summary?: string
        location?: string
        description?: string
        start?: { date?: string; dateTime?: string }
        end?: { date?: string; dateTime?: string }
        attachments?: { fileUrl?: string; title?: string }[]
      }[]
    }
    return (data.items ?? [])
      .filter((e) => e.start && e.end)
      .map((e) => {
        const startDate = e.start!.date ?? e.start!.dateTime!.slice(0, 10)
        // All-day ends are exclusive; timed events end same day.
        const endRaw = e.end!.date
          ? new Date(Date.parse(e.end!.date) - 86_400_000).toISOString().slice(0, 10)
          : e.end!.dateTime!.slice(0, 10)
        return {
          id: e.id,
          summary: e.summary ?? '(untitled)',
          start: startDate,
          end: endRaw >= startDate ? endRaw : startDate,
          location: e.location ?? null,
          description: e.description ?? null,
          attachments: (e.attachments ?? [])
            .filter((a) => a.fileUrl)
            .map((a) => ({ title: a.title || 'Attachment', url: a.fileUrl! })),
        }
      })
  } catch (e) {
    console.error('gcal list failed:', e)
    return null
  }
}

// Removes a manual event after it has been imported as a portal course.
export async function deleteImportedEvent(calendarId: string, eventId: string): Promise<void> {
  try {
    await deleteEvent(calendarId, eventId)
  } catch (e) {
    console.error('imported event cleanup failed:', e)
  }
}
