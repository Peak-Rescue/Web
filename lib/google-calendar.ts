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
import { todayHere } from '@/lib/course-clock'
import { crewOrder } from '@/lib/staffing-roles'
import { type createAdminClient } from '@/lib/supabase/admin'
import { courseEventTitle, courseShortName } from '@/lib/courses'

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

type CrewMember = { name: string; email: string | null; invite: boolean }

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
    // Sent on every patch so a trashed event is revived in place rather than
    // replaced. Google keeps a deleted event, marked cancelled, and answers
    // GET and PATCH for it with a cheerful 200 — so without this the portal
    // spends the rest of the course's life updating an event nobody can see.
    // Reviving keeps the event id, which keeps the invite links already
    // emailed and the RSVPs already given; recreating would break both.
    status: 'confirmed',
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
        .select('role, in_charge, instructors(name, email, calendar_invites)')
        .eq('instance_id', instanceId),
    ])
    if (!c) return
    const course = c as CourseRow
    const target = targetCalendar(course)
    const crew: CrewMember[] = (
      (crewRows ?? []) as unknown as {
        role: string
        in_charge: boolean | null
        instructors: { name: string; email: string | null; calendar_invites: boolean } | null
      }[]
    )
      .filter((a) => a.instructors)
      .sort((a, b) => crewOrder({ ...a, name: a.instructors!.name }, { ...b, name: b.instructors!.name }))
      .map((a) => ({
        name: a.instructors!.name,
        email: a.instructors!.email,
        invite: a.instructors!.calendar_invites,
      }))

    // No event should exist (cancelled / dateless): remove if present. The
    // portal has already emailed the crew about whichever change caused it.
    if (!target) {
      if (course.gcal_event_id && course.gcal_calendar_id) {
        await deleteEvent(course.gcal_calendar_id, course.gcal_event_id)
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
    // through our patches, since sending attendees without responseStatus
    // resets them.
    type ExistingEvent = {
      status?: string
      attendees?: { email?: string; responseStatus?: string }[]
    }
    let existing: ExistingEvent | null = null
    // The pointer as the row had it when this run read it. Every branch below
    // that decides "recreate" clears the local copy, so this is the only record
    // of what we were asked to update — and it's what the claim at the end
    // checks against to tell a stale event apart from a concurrent run's work.
    const priorEventId = course.gcal_event_id
    if (course.gcal_event_id && course.gcal_calendar_id) {
      const res = await gcal(
        'GET',
        `/calendars/${encodeURIComponent(course.gcal_calendar_id)}/events/${course.gcal_event_id}`
      )
      if (res.ok) {
        existing = (await res.json()) as ExistingEvent
        // Trashed out from under us. The patch below revives it (buildEvent
        // sends status), so this is only worth saying out loud — a course
        // whose event keeps needing revival is a course someone keeps
        // deleting, and that argues with the portal rather than with Google.
        if (existing.status === 'cancelled') {
          console.warn(`gcal: reviving trashed event for course ${instanceId}`)
        }
      } else if (res.status === 404 || res.status === 410) {
        course.gcal_event_id = null // deleted out from under us — recreate below
      }
    }

    // Attendees only while impersonating (GCAL_INVITE_AS) — the plain service
    // identity is rejected outright for events that carry them. Anyone who has
    // turned calendar invites off in their profile is left off the guest list;
    // they still appear in the title, and the portal still emails them about
    // date changes and cancellations.
    const attendees = canInvite
      ? crew
          .filter((m) => m.email && m.invite)
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

    // Google never emails anyone about a course. Every notice worth sending —
    // staffing, moved dates, cancellation — comes from the portal, which knows
    // the whole crew rather than just the guest list, and can link to the
    // course page. Leaving sendUpdates on would double up on all of it.
    const sendUpdates = 'none'

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
        `/calendars/${encodeURIComponent(target)}/events?sendUpdates=${sendUpdates}`,
        eventBody
      )
      if (!res.ok) {
        console.error(`gcal insert failed (${res.status}): ${await res.text()}`)
        return
      }
      const created = (await res.json()) as { id: string }

      // Claim the pointer only if the row still holds what we started from
      // (or nothing). Nearly every write path fires a sync via after(), so two
      // runs overlap routinely — a course save landing with a staffing change —
      // and each decides create-vs-patch from its own read. Without this the
      // loser's event stays on the calendar forever: the row points at the
      // winner's copy, so the portal never patches or deletes the other one,
      // and the course shows up twice. Losing the race means our insert was
      // redundant, so take it back off the calendar.
      const claim = admin
        .from('course_instances')
        .update({ gcal_event_id: created.id, gcal_calendar_id: target })
        .eq('id', instanceId)
      const { data: claimed } = await (
        priorEventId
          ? claim.or(`gcal_event_id.is.null,gcal_event_id.eq.${priorEventId}`)
          : claim.is('gcal_event_id', null)
      )
        .select('id')
        .maybeSingle()
      if (!claimed) await deleteEvent(target, created.id)
      return
    }

    // Same compare-and-swap as the claim above, for the same reason. If a
    // concurrent run has moved the pointer on since this run read it, leaving
    // the row alone is right: writing our id back unconditionally is how a
    // pointer to an event another run has already deleted gets re-stamped onto
    // a live course, where nothing will ever rebuild it.
    await admin
      .from('course_instances')
      .update({ gcal_event_id: course.gcal_event_id, gcal_calendar_id: target })
      .eq('id', instanceId)
      .eq('gcal_event_id', course.gcal_event_id)
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
      await deleteEvent(c.gcal_calendar_id, c.gcal_event_id)
    }
  } catch (e) {
    console.error('Calendar event removal failed:', e)
  }
}

// Always silent: a course coming off the calendar is announced by the portal,
// which reaches the whole crew rather than just the guest list.
async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = await gcal(
    'DELETE',
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`
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

// ─── Drift detection ────────────────────────────────────────────────────────
//
// The mirror is written by after() hooks on portal writes, so a course whose
// event is deleted on the Google side stays broken until someone next saves
// that course — which for PR-0046 was three weeks of nobody noticing. This
// reads every live course's pointer and reports what doesn't line up. It
// repairs nothing: syncCourseCalendar is the repair, and the caller decides
// whether to run it (lib/notifications.ts runs it nightly and emails).

export type CalendarDrift = {
  instanceId: string
  ref: string
  title: string
  starts_at: string | null
  // trashed: the event still exists, flagged cancelled — Google's trash, which
  //   answers GET with a 200 and so is invisible to the sync's own checks.
  // missing: the event id is gone from Google entirely.
  // wrong-calendar: the row's calendar isn't the one this course now routes to.
  // absent: the course should be mirrored and has no event at all.
  kind: 'trashed' | 'missing' | 'wrong-calendar' | 'absent'
}

export async function findCalendarDrift(
  admin: Admin
): Promise<{ checked: number; drift: CalendarDrift[] } | null> {
  if (!calendarSyncEnabled()) return null

  // Only courses that are still ahead of us. A cancelled or dateless course
  // routes nowhere, so it can't drift by this definition — and a finished one
  // is history nobody is about to show up for.
  const today = todayHere()
  const { data: rows } = await admin
    .from('course_instances')
    .select(COURSE_COLS)
    .neq('status', 'cancelled')
    .not('starts_at', 'is', null)
    .order('starts_at')
  const courses = ((rows ?? []) as CourseRow[]).filter(
    (c) => (c.ends_at ?? c.starts_at!) >= today
  )

  const found: CalendarDrift[] = []
  for (const c of courses) {
    const target = targetCalendar(c)
    if (!target) continue
    const label = {
      instanceId: c.id,
      ref: `PR-${String(c.ref_number).padStart(4, '0')}`,
      title: courseShortName(c.course_type, c.custom_title),
      starts_at: c.starts_at,
    }
    if (!c.gcal_event_id || !c.gcal_calendar_id) {
      found.push({ ...label, kind: 'absent' })
      continue
    }
    const res = await gcal(
      'GET',
      `/calendars/${encodeURIComponent(c.gcal_calendar_id)}/events/${c.gcal_event_id}`
    )
    if (res.status === 404 || res.status === 410) {
      found.push({ ...label, kind: 'missing' })
      continue
    }
    if (!res.ok) {
      // A calendar we can't read tells us nothing — don't call that drift and
      // send the portal rewriting events on a guess.
      console.error(`gcal drift check failed for ${label.ref} (${res.status})`)
      continue
    }
    const event = (await res.json()) as { status?: string }
    if (event.status === 'cancelled') found.push({ ...label, kind: 'trashed' })
    else if (c.gcal_calendar_id !== target) found.push({ ...label, kind: 'wrong-calendar' })
  }
  return { checked: courses.length, drift: found }
}
