import React from 'react'
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { moduleAudience, KIND_META, type LibraryKind } from '@/lib/library'
import { GEAR_ENTRY_COLUMNS, gearLabel, gearQuantity, isChoice, placeSets, productName } from '@/lib/gear'
import { courseDisplayName, computeBlocks } from '@/lib/courses'
import CourseTasksPanel, { type CourseTask, type TaskPerson } from '@/components/CourseTasksPanel'
import PdfLink from '@/components/PdfLink'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'
import { AudiencePills } from '@/components/AudiencePills'
import PortalSectionNav from './PortalSectionNav'
import CourseUpdates, { type CourseUpdate, type NotifyCounts } from './CourseUpdates'
import CourseNotes from './CourseNotes'
import MeetingDetails from './MeetingDetails'
import type { UpdateAudience } from './update-actions'
import CourseMessages, { type CourseMessage } from './CourseMessages'
import WaiverPanel from './WaiverPanel'
import WaiverQrPanel, { type WaiverQr } from '@/components/WaiverQrPanel'
import UnmatchedWaivers from '@/components/UnmatchedWaivers'
import { loadUnmatchedWaivers } from '@/lib/waiver-data'
import { loadStudentWaiver } from '@/lib/waiver-data'
import { notifyCountsFrom } from '@/lib/course-notify'
import { meetingDetails, courseHasStarted } from '@/lib/meeting-details'
import { Section, SubHead, InstructorCard, StudentCard, SECTION_LABEL, type SectionKey } from './sections'
import { PURPOSE_META, PURPOSE_ORDER, linkLabel, type CourseLink } from '@/lib/course-links'

// Status is a sales/ops state — "quoted", "confirmed" — and means nothing to a
// student, who by definition only sees courses they're enrolled on. The one
// exception is cancelled, which they do need to know.
const STATUS_LABEL: Record<string, string> = {
  tentative: 'Tentative',
  quoted:     'Quoted',
  confirmed:  'Confirmed',
  completed:  'Completed',
  cancelled:  'Cancelled',
}

const ITEM_ICON: Record<string, React.ReactElement> = {
  video: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400 mt-0.5">
      <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.361a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
    </svg>
  ),
  doc: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400 mt-0.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  link: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400 mt-0.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
}

// Who is looking, decided by whoever let them in. The portal works it out from
// the session; a share link asserts the one role it is allowed to assert. This
// component never asks — being handed a viewer is what makes the same page
// renderable for someone with no account at all.
export type Viewer = {
  // Null for a share link. Everything personal — the unread dot, "your own post
  // isn't news to you" — is keyed on this, so a guest simply has none of it.
  userId: string | null
  isAdmin: boolean
  isInstructor: boolean
  // The course role, not the site role: a lead gets the manage controls.
  instructorRole: string | null
  // Admin previewing as someone else. A guest can't preview anything.
  viewAs: 'student' | 'instructor' | null
  lastSeenAt: string | null
}

// A share link's viewer. Named rather than written inline at the call site so
// that widening it is one edit in one place, seen by everyone reviewing it.
export const GUEST: Viewer = {
  userId: null,
  isAdmin: false,
  isInstructor: false,
  instructorRole: null,
  viewAs: null,
  lastSeenAt: null,
}

export default async function CourseView({
  id,
  viewer,
}: {
  id: string
  viewer: Viewer
}) {
  const admin = createAdminClient()

  const { userId, isAdmin, isInstructor, viewAs } = viewer
  const showAsAdmin = viewAs ? false : isAdmin
  const showAsInstructor = viewAs ? viewAs === 'instructor' : isInstructor
  // Instructor preview keeps your real course role, so a lead previewing
  // still gets the lead's manage controls (just not the admin-only rows).
  const canManageTasks = viewAs
    ? viewAs === 'instructor' && viewer.instructorRole === 'lead'
    : isAdmin || viewer.instructorRole === 'lead'

  // Everything else in a second parallel round (roles known, filters set).
  const showTasks = showAsAdmin || showAsInstructor
  const audienceFilter = showTasks ? null : ['student', 'both']

  let modulesQuery = admin
    .from('course_modules')
    .select('id, title, audience, order, course_items(id, title, type, url, description, order, audience, library_items(id, title, url, kind, audience, drive_file_id))')
    .eq('instance_id', id)
    .order('order')
  if (audienceFilter) {
    modulesQuery = modulesQuery.in('audience', audienceFilter)
  }

  const [{ data: inst }, { data: offDays }, { data: modules }, { data: instructors }, taskRows, { data: peopleRows }, { data: templateRows }, { data: courseDocRows }, { data: taskDocRows }, { data: mapRows }, { data: resourceRows }, { data: linkRows }, { data: updateRows }, { data: enrollmentRows }, { data: messageRows }] =
    await Promise.all([
      admin.from('course_instances')
        .select('course_type, custom_title, status, location, client_name, notes, ref_number, starts_at, ends_at, meeting_point, meeting_time, meeting_links, meeting_attachments, intro, max_students, internal, waiver_template_id, waiver_token, waiver_token_expires_at')
        .eq('id', id)
        .single(),
      admin.from('instance_off_days')
        .select('off_date, end_date')
        .eq('instance_id', id)
        .order('off_date'),
      modulesQuery,
      admin.from('instance_instructors')
        .select('role, instructors(name, email, profile_id, slug, active, title, avatar, avatar_position, avatar_scale)')
        .eq('instance_id', id),
      showTasks ? loadTasksWithDocs(admin, id) : Promise.resolve([]),
      showTasks
        ? admin.from('profiles').select('id, first_name, last_name, role').in('role', ['admin', 'instructor']).order('first_name')
        : Promise.resolve({ data: [] }),
      showTasks
        ? admin.from('course_task_templates').select('id, title, default_line, sort_order').eq('active', true).order('sort_order')
        : Promise.resolve({ data: [] }),
      showTasks
        ? admin.from('course_documents').select('id, path, filename, url, created_at').eq('instance_id', id)
        : Promise.resolve({ data: [] }),
      showTasks
        ? admin.from('course_task_documents').select('id, path, filename, url, created_at, course_tasks!inner(title, instance_id)').eq('course_tasks.instance_id', id)
        : Promise.resolve({ data: [] }),
      // Maps: the team sees every one, students only those shared with them.
      // This reads with the service role, so the audience filter is applied
      // here rather than by RLS.
      (showTasks
        ? admin.from('course_maps').select('id, url, label, audience, library_items(title, url, edit_url, audience)').eq('instance_id', id).order('sort_order')
        : admin.from('course_maps').select('id, url, label, audience, library_items(title, url, audience)').eq('instance_id', id).eq('audience', 'shared').order('sort_order')),
      // The resources shelf — med plan, permits, tech notes for this place.
      // Same audience rule as maps, and read the same way: a student sees
      // only the rows shared with them.
      (showTasks
        ? admin.from('course_resources').select('id, url, label, audience, library_items(id, title, url, kind, audience)').eq('instance_id', id).order('sort_order')
        : admin.from('course_resources').select('id, url, label, audience, library_items(id, title, url, kind, audience)').eq('instance_id', id).eq('audience', 'shared').order('sort_order')),
      // Links added for this delivery — the photo album, the client's
      // paperwork. Same audience rule as maps.
      (showTasks
        ? admin.from('course_links').select('id, url, label, audience, purpose').eq('instance_id', id).order('purpose').order('sort_order')
        : admin.from('course_links').select('id, url, label, audience, purpose').eq('instance_id', id).eq('audience', 'shared').order('purpose').order('sort_order')),
      // Read whole, filtered below: staff see every update, a student sees the
      // ones addressed to them. Same rule as maps and resources, and applied
      // here for the same reason — this reads with the service role, so RLS
      // isn't the thing standing between a crew-only note and a student.
      admin.from('course_updates')
        .select('id, body, audience, created_at, updated_at, created_by, sent_count, recipient_count, notify_count, emailed_at, links, attachments, profiles(first_name, last_name)')
        .eq('instance_id', id)
        .order('created_at', { ascending: false }),
      // The roster. Staff-only, and the same read answers both questions the
      // page asks of it: who is on the course, and how many inboxes "emails 12
      // students" is promising before the button is pressed.
      showTasks
        ? admin.from('enrollments')
            .select('id, enrolled_at, profiles(first_name, last_name, email, phone)')
            .eq('instance_id', id)
            .order('enrolled_at')
        : Promise.resolve({ data: [] }),
      // The outbox — staff only, and never loaded for a student.
      showTasks
        ? admin.from('course_messages')
            .select('id, subject, body, audience, created_at, recipient_count, sent_count, profiles(first_name, last_name)')
            .eq('instance_id', id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

  if (!inst) notFound()

  // Every attachment on the course — task documents (even from completed
  // tasks, where they'd otherwise be folded away) plus general course files —
  // gathered into one glanceable rail for the team. Uploads live in the
  // private task-documents bucket and need signing; links carry their URL.
  type PortalDocRow = { id: string; path: string | null; filename: string | null; url: string | null; created_at: string }
  const docRows: (PortalDocRow & { course_tasks?: unknown })[] = [...(courseDocRows ?? []), ...(taskDocRows ?? [])]
  const docPaths = docRows.map((r) => r.path).filter((p): p is string => Boolean(p))
  const { data: signedDocs } = docPaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(docPaths, 3600)
    : { data: [] }
  const docUrl = new Map((signedDocs ?? []).map((s) => [s.path, s.signedUrl]))
  const courseDocs = docRows
    .map((r) => ({
      id: r.id,
      filename: r.filename ?? 'document',
      url: r.url ?? (r.path ? docUrl.get(r.path) : undefined) ?? '#',
      external: Boolean(r.url),
      taskTitle: (r.course_tasks as { title: string } | null | undefined)?.title ?? null,
      created_at: r.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  // Library maps take their title and link from the library item; the edit
  // twin (CalTopo edit URL) is only ever handed to the team.
  // A library item's audience is the ceiling, and it is enforced here rather
  // than trusted from the row: the row can be stale — the item was marked
  // instructors-only after a course shared it — and a stale row must not be
  // what decides a student sees an evac plan.
  const maps = (mapRows ?? []).map((r) => {
    const item = r.library_items as unknown as { title: string; url: string | null; edit_url?: string | null; audience?: string } | null
    return {
      id: r.id,
      label: item?.title ?? r.label ?? 'Map',
      url: item?.url ?? r.url,
      editUrl: showTasks ? item?.edit_url ?? null : null,
      internal: r.audience !== 'shared' || item?.audience === 'internal',
    }
  }).filter((m) => (m.url || m.editUrl) && (showTasks || !m.internal))

  // The resources shelf. A Drive document goes through the portal's own proxy
  // rather than out to Google — the same rule the curriculum follows, and the
  // only reason a student can open one at all: Drive would send them to the
  // request-access screen.
  const resources = (resourceRows ?? []).map((r) => {
    const item = r.library_items as unknown as { id: string; title: string; url: string | null; kind: string; audience?: string } | null
    const isDrive = /drive\.google\.com|docs\.google\.com/.test(item?.url ?? '')
    return {
      id: r.id,
      label: item?.title ?? r.label ?? 'Document',
      kind: item ? KIND_META[item.kind as LibraryKind] ?? null : null,
      url: item && isDrive ? `/api/library/${item.id}` : item?.url ?? r.url,
      internal: r.audience !== 'shared' || item?.audience === 'internal',
    }
  }).filter((r) => r.url && (showTasks || !r.internal))

  const blocks = inst.starts_at && inst.ends_at
    ? computeBlocks(inst.starts_at, inst.ends_at, offDays ?? [])
    : []

  // Only tasks assigned to someone show on the course page, for everyone.
  const tasks: CourseTask[] = taskRows.filter((t) => t.assigned_to)
  const staffedProfileIds = new Set(
    (instructors ?? [])
      .map((r) => (r.instructors as unknown as { profile_id: string | null } | null)?.profile_id)
      .filter(Boolean)
  )
  const taskPeople: TaskPerson[] = (peopleRows ?? [])
    .map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' '),
      onCourse: p.role === 'admin' || staffedProfileIds.has(p.id),
    }))
    .filter((p) => p.name)

  const fmtLong = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })

  // The gear list participants get. Instructors see theirs too; students only
  // ever see the student one.
  const { data: gearRows } = await admin
    .from('gear_lists')
    .select(`id, name, audience, intro, gear_list_entries(id, ${GEAR_ENTRY_COLUMNS}, gear_items(name, brand, url, category), gear_entry_options(sort_order, gear_items(name, brand)))`)
    .eq('instance_id', id)
  type GearRow = {
    id: string; name: string; audience: string; intro: string | null
    gear_list_entries: {
      id: string; gear_item_id: string | null; name: string | null; note: string | null; url: string | null
      section: string | null; group_type: 'personal' | 'group'; quantity: string | null
      qty_each: number | null; qty_per_students: number | null; sort_order: number
      joined_above: 'and' | 'or' | 'or_if_needed' | null
      gear_items: { name: string; brand: string | null; url: string | null; category: string | null } | null
      gear_entry_options: { sort_order: number; gear_items: { name: string; brand: string | null } | null }[]
    }[]
  }
  const gearAll = (gearRows ?? []) as unknown as GearRow[]

  // Which models sit under each type. A line that ticked nothing accepts any
  // of them, and saying so is the whole point of the catalog — before this the
  // student read a bare "Hand ascender" and had to guess what to buy.
  const gearList = showTasks
    ? gearAll.find((g) => g.audience === 'instructor') ?? gearAll[0]
    : gearAll.find((g) => g.audience === 'student')

  // The running order, same for everyone on the course.
  const { data: schedRows } = await admin
    .from('course_schedules')
    .select('id, name, overview, objectives, schedule_days(id, title, location, notes, objectives, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
    .eq('instance_id', id)
    .limit(1)
  type SchedBlock = { id: string; parent_id: string | null; title: string; time_label: string | null; location: string | null; sort_order: number }
  type SchedDay = { id: string; title: string; location: string | null; notes: string | null; objectives: string[] | null; sort_order: number; schedule_blocks: SchedBlock[] }
  const sched = ((schedRows ?? []) as unknown as {
    id: string; name: string; overview: string | null; objectives: string[]; schedule_days: SchedDay[]
  }[])[0]
  const schedDays = [...(sched?.schedule_days ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  // Staff see instructor-only sections first — the same order they had in
  // Classroom. Students never receive those sections at all.
  const orderedModules = [...(modules ?? [])].sort((a, b) => {
    const ai = moduleAudience(a.audience) === 'internal' ? 0 : 1
    const bi = moduleAudience(b.audience) === 'internal' ? 0 : 1
    return ai - bi || (a.order as number) - (b.order as number)
  })

  // Which named sections this course actually has — drives both the jump bar
  // and the order things render in, so the two can never disagree.
  // Staff get this block whether or not anything is in it. An unset meeting
  // point is the thing they most need to notice, and hiding it hides the only
  // place they can fix it.
  const meeting = await meetingDetails(admin, inst)
  const hasSchedule = Boolean(sched && schedDays.length > 0)
  const hasCurriculum = orderedModules.length > 0
  const hasGear = Boolean(gearList && gearList.gear_list_entries.length > 0)
  const hasResources = resources.length > 0 || (showTasks && courseDocs.length > 0)
  // Staff get the notes section whether or not there is anything in it — it is
  // where the first note gets written, and an empty section that says so beats
  // sending someone to the admin editor to type one line.
  const hasNotes = showTasks
  // Everyone on the course sees updates; staff also get the box to write one,
  // so the section shows for them even when there's nothing posted yet.
  type UpdateRow = {
    id: string; body: string; audience: UpdateAudience
    created_at: string; updated_at: string | null; created_by: string | null
    sent_count: number; recipient_count: number; notify_count: number; emailed_at: string | null
    links: { label: string; url: string }[] | null
    attachments: { path: string; filename: string }[] | null
    profiles: { first_name: string | null; last_name: string | null } | null
  }
  const updateRowsTyped = ((updateRows ?? []) as unknown as UpdateRow[])
    .filter((u) => showTasks || u.audience !== 'instructors')

  // Attachments sit in the private bucket, so they're signed here — one call
  // for every update on the page rather than one per file.
  const updatePaths = updateRowsTyped.flatMap((u) => (u.attachments ?? []).map((a) => a.path))
  const { data: signedUpdateDocs } = updatePaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(updatePaths, 3600)
    : { data: [] }
  const updateDocUrl = new Map((signedUpdateDocs ?? []).map((s) => [s.path, s.signedUrl]))

  const courseUpdates: CourseUpdate[] = updateRowsTyped.map((u) => ({
    id: u.id,
    body: u.body,
    audience: u.audience,
    created_at: u.created_at,
    updated_at: u.updated_at,
    created_by: u.created_by,
    sent_count: u.sent_count,
    recipient_count: u.recipient_count,
    notify_count: u.notify_count,
    emailed_at: u.emailed_at,
    links: u.links ?? [],
    attachments: (u.attachments ?? []).map((a) => ({ ...a, url: updateDocUrl.get(a.path) ?? '#' })),
    authorName: [u.profiles?.first_name, u.profiles?.last_name].filter(Boolean).join(' ').trim() || null,
  }))
  // Marked seen after the response goes out, so the write never delays the
  // page. A previewing admin is excluded: ?as=student is a look at someone
  // else's view, not a visit, and shouldn't clear your own dot.
  if (!viewAs && userId) {
    after(async () => {
      await createAdminClient()
        .from('course_views')
        .upsert(
          { user_id: userId, instance_id: id, last_seen_at: new Date().toISOString() },
          { onConflict: 'user_id,instance_id' }
        )
    })
  }

  // First visit isn't "everything is new" — that would put a dot on a page
  // the reader has never had a chance to fall behind on.
  const lastSeen = viewer.lastSeenAt
  // Your own post isn't news to you — you were there when it was written.
  const isNew = (u: { created_at: string; created_by: string | null }) =>
    Boolean(lastSeen) && u.created_at > lastSeen! && u.created_by !== userId
  const unreadUpdates = courseUpdates.filter(isNew).length

  // Any instructor on the course can post, not just the lead — a meeting point
  // moves and the person who needs to say so is the one standing there.
  const canPostUpdates = showTasks
  const courseMessages: CourseMessage[] = ((messageRows ?? []) as unknown as {
    id: string; subject: string; body: string; audience: CourseMessage['audience']; created_at: string
    recipient_count: number; sent_count: number
    profiles: { first_name: string | null; last_name: string | null } | null
  }[]).map((m) => ({
    id: m.id,
    subject: m.subject,
    body: m.body,
    audience: m.audience,
    created_at: m.created_at,
    recipient_count: m.recipient_count,
    sent_count: m.sent_count,
    authorName: [m.profiles?.first_name, m.profiles?.last_name].filter(Boolean).join(' ').trim() || null,
  }))
  // Counted by address, not by head: the button says "Send to 5" before an
  // irreversible action, so it has to mean five inboxes. A crew member with no
  // email on file gets no mail and shouldn't be in the number.
  const crewCount = new Set(
    (instructors ?? [])
      .map((r) => (r.instructors as unknown as { email: string | null } | null)?.email)
      .filter(Boolean)
      .map((e) => e!.trim().toLowerCase())
  ).size
  // How many inboxes an update reaches: the students plus the rest of the
  // crew, minus your own — the same set the action emails, worked out here so
  // the button can promise a number before it sends anything.
  const crewEmails = (instructors ?? []).map((r) => r.instructors as unknown as {
    email: string | null; profile_id: string | null
  } | null)
  const ownEmail = crewEmails.find((p) => p?.profile_id && p.profile_id === userId)?.email?.trim().toLowerCase() ?? null

  // The roster, in the order people enrolled. Names come from the profile the
  // student made on the invite link, so a half-filled one is normal and the
  // row says so rather than rendering a blank.
  const roster = ((enrollmentRows ?? []) as unknown as {
    id: string; enrolled_at: string | null
    profiles: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null
  }[]).map((e) => ({
    id: e.id,
    name: [e.profiles?.first_name, e.profiles?.last_name].filter(Boolean).join(' ').trim() || 'Unnamed',
    email: e.profiles?.email ?? null,
    phone: e.profiles?.phone ?? null,
    enrolledAt: e.enrolled_at,
  }))
  const enrolledCount = roster.length

  // Who has signed, for the staff roster. Read only when staff are looking and
  // only when the course actually has a waiver to sign — a column of "not
  // signed" on a course that never asked for one is a false alarm.
  const waiverOnCourse = Boolean(inst.waiver_template_id)
  const { data: rosterSigRows } = showTasks && waiverOnCourse
    ? await admin
        .from('waiver_signatures')
        .select('enrollment_id, identity, signed_at')
        .eq('instance_id', id)
        .not('enrollment_id', 'is', null)
        .order('signed_at', { ascending: false })
    : { data: [] }
  // The code an instructor holds up at the trailhead, rendered here because
  // that is the page they have open — the admin editor is somewhere they may
  // not be able to reach and, more to the point, aren't standing in front of.
  let waiverQr: WaiverQr | null = null
  if (showTasks && inst.waiver_token) {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/waiver/${inst.waiver_token}`
    const QRCode = (await import('qrcode')).default
    waiverQr = {
      url,
      svg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 148 }),
      expiresAt: (inst.waiver_token_expires_at as string | null) ?? null,
    }
  }

  // Walk-ups the matcher wouldn't decide on. Loaded for staff beside the QR
  // that creates them, so the person who ran the code is the one who resolves
  // what it couldn't work out.
  const unmatchedWaivers = showTasks && inst.waiver_template_id
    ? await loadUnmatchedWaivers(id, admin)
    : []

  const signedByEnrollment = new Map<string, { unverified: boolean }>()
  for (const r of (rosterSigRows ?? []) as { enrollment_id: string; identity: string }[]) {
    if (!signedByEnrollment.has(r.enrollment_id)) {
      signedByEnrollment.set(r.enrollment_id, { unverified: r.identity === 'unverified' })
    }
  }
  const notifyCounts: NotifyCounts = notifyCountsFrom(
    roster.map((r) => r.email),
    crewEmails.map((p) => p?.email),
    ownEmail
  )

  // The viewer's own waiver. Only ever their own — a waiver carries a date of
  // birth and a home address, so the course page shows you yours and nobody
  // else's. Staff track who has signed from the admin side.
  //
  // Being enrolled is the whole gate, and it is enough. Instructors and admins
  // aren't enrolled on the courses they run, so they are never asked; enroll
  // one and they are asked, which is how you get a waiver out of an instructor
  // who is taking the course rather than teaching it.
  //
  // Nothing here reads a job title. A rule about who someone *is* would have to
  // guess at the case this handles by asking what they are *doing on this
  // course*, which the enrollment already says.
  const waiver = userId ? await loadStudentWaiver(id, userId) : null

  // The meeting block lives in here, so a course with no posts yet still has
  // an Updates section for a student to find the meeting point in.
  const hasUpdates = canPostUpdates || courseUpdates.length > 0 ||
    Boolean(meeting.meetingPoint || meeting.meetingTime || meeting.links.length || meeting.files.length)
  const hasDocuments = showTasks && courseDocs.length > 0
  // Shown to staff even when empty: "nobody has enrolled yet" is the answer an
  // instructor came for, and a missing section reads as a missing feature. The
  // exception is an internal course, where the attendees are the crew already
  // named at the top of the page — unless somebody did enroll, in which case
  // hiding them would be hiding the truth.
  const hasRoster = showTasks && (!inst.internal || roster.length > 0)
  const hasTasks = showTasks && (tasks.length > 0 || canManageTasks || hasNotes)

  // Who is on this course, and what it is. Staff get it regardless: an empty
  // one is where they fill it in.
  const hasDetails = Boolean(inst.intro || (instructors ?? []).length) || showTasks
  // Day one decides whether the meeting block leads the updates or folds to a
  // line under them.
  const started = courseHasStarted(inst.starts_at as string | null)

  const navSections = ([
    'details',
    hasUpdates && 'updates',
    waiver && 'waiver',
    // The only block left that is team-only end to end. The rest of what staff
    // see is a block inside a section students also read.
    hasTasks && 'tasks',
    hasSchedule && 'schedule',
    hasResources && 'resources',
    hasCurriculum && 'curriculum',
    hasGear && 'gear',
  ].filter(Boolean) as SectionKey[]).map((id) => ({
    id,
    label: SECTION_LABEL[id],
    team: id === 'tasks',
    unread: id === 'updates' && unreadUpdates > 0,
  }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {isAdmin && (
          <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
            <Link
              href={`/admin/courses/${id}`}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
              Edit course
            </Link>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-600 mr-1">Viewing as</span>
              {([
                ['', 'Admin', 'Everything, unfiltered'],
                ['instructor', 'Instructor', 'What an assigned instructor sees (uses your real role on this course)'],
                ['student', 'Student', 'What an enrolled student sees'],
              ] as const).map(([key, label, hint]) => (
                <Link
                  key={label}
                  href={key ? `/portal/${id}?as=${key}` : `/portal/${id}`}
                  title={hint}
                  className={`px-2 py-1 rounded font-medium transition-colors ${
                    (viewAs ?? '') === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Title, dates, status. Not the "Details" anchor any more — that now
            names the block below the nav holding where to meet and who's on
            the course, and an id can only belong to one of them. */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-sm text-zinc-500">
            <span className="font-mono text-xs">PR-{String(inst.ref_number).padStart(4, '0')}</span>
            {(showTasks || inst.status === 'cancelled') && (
              <>
                <span>·</span>
                <span className={inst.status === 'cancelled' ? 'text-red-400' : undefined}>
                  {STATUS_LABEL[inst.status] ?? inst.status}
                </span>
              </>
            )}
            {inst.client_name && <><span>·</span><span>{inst.client_name}</span></>}
          </div>
          <h1 className="text-3xl font-bold mb-4">{courseDisplayName(inst.course_type, inst.custom_title)}</h1>

          {/* The two facts every student checks first, labelled rather than
              run together in one grey line. */}
          <dl className="grid sm:grid-cols-2 gap-3">
            {blocks.length > 0 && (
              <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">When</dt>
                <dd className="text-sm text-zinc-200 mt-0.5 space-y-0.5">
                  {blocks.map((b, i) => (
                    <div key={i}>
                      {fmtLong(b.starts_at)}{b.starts_at !== b.ends_at ? ` – ${fmtLong(b.ends_at)}` : ''}
                    </div>
                  ))}
                </dd>
              </div>
            )}
            {inst.location && (
              <div className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Where</dt>
                <dd className="text-sm text-zinc-200 mt-0.5">{inst.location}</dd>
              </div>
            )}
          </dl>

          {/* Maps sit with the location — the answer to "where is this?" is
              the place name and the map together. */}
          {maps.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {maps.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-teal-800 bg-teal-950/40 text-teal-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noreferrer" className="hover:text-teal-100 transition-colors">{m.label}</a>
                  ) : (
                    <span>{m.label}</span>
                  )}
                  {m.editUrl && (
                    <a href={m.editUrl} target="_blank" rel="noreferrer" title="Edit map — internal" className="text-teal-500/80 hover:text-teal-200 transition-colors border-l border-teal-800 pl-1.5">
                      edit
                    </a>
                  )}
                  {showTasks && m.internal && <span className="text-teal-600/80">· instructors</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Links for this delivery. Grouped, because "the album" and "the
            waiver" are different errands and a single list of URLs makes you
            read all of them to find either. */}
        {(linkRows ?? []).length > 0 && (
          <div className="mb-8 space-y-3">
            {PURPOSE_ORDER.map((purpose) => {
              const rows = ((linkRows ?? []) as CourseLink[]).filter((l) => l.purpose === purpose)
              if (rows.length === 0) return null
              return (
                <div key={purpose}>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
                    {PURPOSE_META[purpose].label}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {rows.map((l) => (
                      <a
                        key={l.id}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                      >
                        {linkLabel(l)}
                        {showTasks && l.audience === 'internal' && (
                          <span className="text-zinc-600">· instructors</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <PortalSectionNav sections={navSections} />

        {/* Who is on this course — the welcome, the crew, the roster. Where
            to meet used to be here too, but it is news rather than reference:
            it belongs with the updates, and it belongs out of the way once
            everyone has met. */}
        {hasDetails && (
          <Section id="details" blurb="Where to meet, who you're with, and what this course covers">
            <div className="space-y-6">
              {inst.intro && (
                <p className="text-sm text-zinc-300 whitespace-pre-line">{inst.intro}</p>
              )}
              {(instructors ?? []).length > 0 && (
                <div>
                  <SubHead title={(instructors ?? []).length > 1 ? 'Your instructors' : 'Your instructor'} />
                  <div className="grid sm:grid-cols-2 gap-2">
                    {(instructors ?? []).map((a, i) => {
                      const p = a.instructors as unknown as {
                        name: string; slug: string | null; active: boolean | null
                        avatar: string | null; avatar_position: string | null; avatar_scale: number | null
                      } | null
                      return (
                        <InstructorCard
                          key={i}
                          name={p?.name ?? 'Instructor'}
                          role={a.role}
                          // /team/[slug] only serves active instructors — anyone else
                          // would land on a 404, so they stay unlinked.
                          slug={p?.active ? p.slug : null}
                          avatar={p?.avatar}
                          avatarPosition={p?.avatar_position}
                          avatarScale={p?.avatar_scale}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
              {hasRoster && (
                <div>
                  <SubHead
                    title="Students"
                    note={
                      inst.max_students
                        ? `${enrolledCount} of ${inst.max_students} places taken`
                        : `${enrolledCount} enrolled`
                    }
                    badge={<AudiencePills audience="internal" />}
                  />
                  {roster.length > 0 ? (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {roster.map((student) => (
                        <StudentCard
                          key={student.id}
                          name={student.name}
                          email={student.email}
                          phone={student.phone}
                          enrolledAt={student.enrolledAt}
                          href={`/portal/${id}/people/${student.id}`}
                          waiver={
                            waiverOnCourse
                              ? {
                                  signed: signedByEnrollment.has(student.id),
                                  unverified: signedByEnrollment.get(student.id)?.unverified ?? false,
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Nobody has enrolled yet. Students join through the invite link
                      {isAdmin ? (
                        <>
                          {' '}on the{' '}
                          <Link href={`/admin/courses/${id}`} className="text-zinc-300 hover:text-white underline underline-offset-2">
                            course editor
                          </Link>
                          .
                        </>
                      ) : (
                        ', which the office sends to the client contact.'
                      )}
                    </p>
                  )}

                  {showTasks && unmatchedWaivers.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <UnmatchedWaivers instanceId={id} unmatched={unmatchedWaivers} />
                    </div>
                  )}

                  {showTasks && (
                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <WaiverQrPanel
                        instanceId={id}
                        qr={waiverQr}
                        hasWaiver={Boolean(inst.waiver_template_id)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Updates — posted by the team, emailed to everyone on the course,
            and kept here so the course page stays the record of what was
            said. */}
        {hasUpdates && (
          <Section
            id="updates"
            blurb={showTasks ? 'Posted here and emailed' : 'Posted by your instructors, and emailed to you'}
            unread={unreadUpdates > 0}
          >
            {/* Above the feed until day one, a single line after it. Where to
                meet is the most important thing on the page right up to the
                moment everyone has met, and dead weight from then on. */}
            <div className="mb-4">
              <MeetingDetails
                instanceId={id}
                meetingPoint={meeting.meetingPoint}
                meetingTime={meeting.meetingTime}
                links={meeting.links}
                files={meeting.files}
                canEdit={showTasks}
                notifyCounts={notifyCounts}
                started={started}
              />
            </div>

            <CourseUpdates
              instanceId={id}
              updates={courseUpdates.map((u) => ({ ...u, isNew: isNew(u) }))}
              canPost={canPostUpdates}
              notifyCounts={notifyCounts}
            />
            {showTasks && (
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <SubHead
                  title="Send an email"
                  note="Goes to inboxes only — nothing is posted here"
                  badge={<AudiencePills audience="internal" />}
                />
                <CourseMessages
                  instanceId={id}
                  messages={courseMessages}
                  studentCount={enrolledCount}
                  instructorCount={crewCount}
                />
              </div>
            )}
          </Section>
        )}

        {/* The waiver, for the person who has to sign it. Sits near the top
            rather than down with the reference material because it is the only
            thing on this page a student is asked to *do*, and an unsigned one
            found on the morning of day one is everybody's problem. */}
        {waiver && (
          <Section
            id="waiver"
            blurb={
              waiver.signed
                ? 'Signed — your copy of the agreement'
                : 'Please read and sign before the course starts'
            }
          >
            <WaiverPanel
              instanceId={id}
              body={waiver.version.body}
              templateName={waiver.version.templateName}
              prefill={waiver.prefill}
              signed={waiver.signed}
            />
          </Section>
        )}

        {/* Course tasks, and the team's own notes on the course — the one
            block on the page that is theirs end to end. */}
        {hasTasks && (
          <Section id="tasks" title="Course tasks" blurb="What still has to happen before this course runs" team>
            {hasNotes && (
              <div className="mb-6">
                <SubHead title="Notes" note="Gate codes, client quirks, what to watch for" />
                <CourseNotes instanceId={id} notes={inst.notes} canEdit={showTasks} />
              </div>
            )}
            <CourseTasksPanel
              instanceId={id}
              tasks={tasks}
              people={taskPeople}
              suggestions={canManageTasks ? templateRows ?? [] : []}
              canManage={canManageTasks}
              currentUserId={userId ?? ''}
            />
          </Section>
        )}

        {/* Running order */}
        {hasSchedule && (
          <Section
            id="schedule"
            blurb="Day by day, what we're doing and where"
            action={<PdfLink href={`/api/schedules/${sched.id}/pdf`} />}
          >
            {sched.overview && <p className="text-sm text-zinc-400 mb-3 whitespace-pre-line">{sched.overview}</p>}
            {sched.objectives.length > 0 && (
              <div className="mb-4">
                <SubHead title="Objectives" />
                <ol className="space-y-1 text-sm text-zinc-300 list-decimal pl-5">
                  {sched.objectives.map((o, i) => <li key={i}>{o}</li>)}
                </ol>
              </div>
            )}
            <div className="space-y-3">
              {schedDays.map((d, di) => {
                const blocks = [...(d.schedule_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
                const topics = blocks.filter((b) => !b.parent_id)
                return (
                  <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-baseline gap-2">
                      {/* The counter only earns its place when the title says
                          something else — most days are called "Day 1", and
                          printing that twice is just noise. */}
                      {!/^day\s*\d+\b/i.test(d.title.trim()) && (
                        <span className="text-[11px] font-mono text-zinc-600 shrink-0">Day {di + 1}</span>
                      )}
                      <h3 className="font-medium text-sm">{d.title}</h3>
                    </div>
                    {/* Place and notes were joined with a dot, which read as
                        one sentence — and on the canyon days the note is three
                        facts long, so the place vanished into it. The pin says
                        which half is the where. */}
                    {d.location && (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 text-zinc-600"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {d.location}
                      </p>
                    )}
                    {/* Under a pinned location, an unmarked grey line read as
                        more of the address. The page corner says this one is
                        someone's note about the day — usually something to
                        bring, and worth not skimming past. */}
                    {d.notes && (
                      <p className="flex gap-1.5 text-xs text-zinc-500 mt-0.5">
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 mt-[3px] text-zinc-600"
                        >
                          <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
                          <path d="M14 21v-3a2 2 0 0 1 2-2h3" />
                        </svg>
                        <span className="flex-1 min-w-0">{d.notes}</span>
                      </p>
                    )}
                    {/* What the day is for, before what it consists of — the
                        target sits in the same gutter as the pin and the book,
                        so a day reads as where, why, then what. */}
                    {(d.objectives ?? []).length > 0 && (
                      <div className="flex gap-1.5 mt-2.5">
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 mt-[5px] text-zinc-600"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="12" r="4.5" />
                          <circle cx="12" cy="12" r="0.5" fill="currentColor" />
                        </svg>
                        <ul className="flex-1 min-w-0 space-y-1 text-xs text-zinc-400">
                          {(d.objectives ?? []).map((o, i) => <li key={i}>{o}</li>)}
                        </ul>
                      </div>
                    )}
                    {/* The pin says where; the open book says what's being
                        taught. One glyph for the whole list, in the same gutter
                        as the pin — one per topic would drown the dots that
                        carry the structure, and every topic is teaching
                        content anyway, so marking them all says nothing. */}
                    {topics.length > 0 && (
                      <div className="flex gap-1.5 mt-2.5">
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 mt-[5px] text-zinc-600"
                        >
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                        <ul className="flex-1 min-w-0 space-y-1.5">
                        {topics.map((t) => {
                          const kids = blocks.filter((b) => b.parent_id === t.id)
                          // A dot for topics and a dash for what sits under
                          // them. The previous treatment boxed the children,
                          // which made a lone sub-topic louder than its own
                          // parent — nesting wants children to recede.
                          return (
                            <li key={t.id} className="relative pl-4 text-sm text-zinc-300">
                              <span
                                aria-hidden
                                className="absolute left-0.5 top-[9px] w-1 h-1 rounded-full bg-zinc-600"
                              />
                              {t.time_label && <span className="text-zinc-500 mr-2">{t.time_label}</span>}
                              {t.title}
                              {/* A block can sit somewhere other than the day
                                  does — classroom in the morning, canyon after
                                  lunch. Same pin, smaller. */}
                              {t.location && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 ml-2">
                                  <svg
                                    aria-hidden
                                    xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                                    className="shrink-0 text-zinc-600"
                                  >
                                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  {t.location}
                                </span>
                              )}
                              {kids.length > 0 && (
                                <ul className="mt-1 ml-4 space-y-0.5">
                                  {kids.map((k) => (
                                    <li key={k.id} className="relative pl-3.5 text-[13px] text-zinc-400">
                                      <span aria-hidden className="absolute left-0 top-[10px] w-1.5 h-px bg-zinc-700" />
                                      {k.title}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Resources — what's true about this place: the med plan, the permit,
            the evacuation annex. Above the curriculum and visibly not part of
            it, because "what do I do if someone gets hurt" is not lesson four.
            Rows the team can see but students can't are badged, so an
            instructor reading the same page knows which is which. */}
        {hasResources && (
          <Section id="resources" blurb="Reference for this course and this place">
            {resources.length > 0 && (
              <ul className="space-y-1.5">
                {resources.map((r) => (
                  <li key={r.id}>
                    <a
                      href={r.url!}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors group"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />
                      </svg>
                      <span className="text-sm text-zinc-200 group-hover:text-white transition-colors min-w-0 truncate">
                        {r.label}
                      </span>
                      {r.kind && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                          {r.kind}
                        </span>
                      )}
                      {showTasks && r.internal && (
                        <AudiencePills audience="internal" className="ml-auto shrink-0" />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {hasDocuments && (
              <div className={resources.length > 0 ? 'mt-6 pt-6 border-t border-zinc-800' : ''}>
                <SubHead
                  title="Everything attached to this course"
                  note="Files and links, including from tasks"
                  badge={<AudiencePills audience="internal" />}
                />
                <div className="flex flex-wrap gap-2">
                  {courseDocs.map((d) => (
                    <a
                      key={d.id}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      title={d.taskTitle ? `From task: ${d.taskTitle}` : d.external ? 'Opens external link' : 'Course file'}
                      className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full border text-sm transition-colors ${
                        d.external
                          ? 'bg-teal-500/10 border-teal-500/30 hover:border-teal-400 text-teal-300 hover:text-teal-100'
                          : 'bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {d.external ? <LinkIcon /> : <span className="shrink-0"><PaperclipIcon /></span>}
                      <span className="truncate">{d.filename}</span>
                      {d.external && <span className="text-teal-400/70 shrink-0">↗</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Curriculum — the modules, each its own named group rather than a
            page-length run of link rows. */}
        {hasCurriculum && (
          <Section id="curriculum" blurb="Reading, videos and references for each topic">
            <div className="space-y-6">
              {orderedModules.map(mod => {
                const items = (mod.course_items ?? []).slice().sort((a, b) => a.order - b.order)
                return (
                  <div key={mod.id}>
                    <SubHead
                      title={mod.title}
                      badge={(showAsAdmin || showAsInstructor) && mod.audience !== 'both' ? (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                          mod.audience === 'instructor'
                            ? 'border-teal-800 text-teal-400'
                            : 'border-blue-800 text-blue-400'
                        }`}>
                          {mod.audience}s only
                        </span>
                      ) : undefined}
                    />
                    <div className="space-y-1">
                      {items.map(item => {
                        // Library rows carry their own title/link, and an item can
                        // be held back to instructors inside a shared section.
                        const libRaw = item.library_items as unknown
                        const lib = (Array.isArray(libRaw) ? libRaw[0] : libRaw) as
                          { id: string; title: string; url: string | null; audience: string; drive_file_id?: string | null } | null
                        const effective = item.audience ?? lib?.audience ?? 'shared'
                        if (!showTasks && effective === 'internal') return null
                        const title = lib?.title ?? item.title
                        // Drive files go through the portal, which streams them
                        // with the service account — a direct Drive link would
                        // show participants Google's request-access page.
                        const isDrive = Boolean(lib?.drive_file_id) || /drive\.google\.com|docs\.google\.com/.test(lib?.url ?? '')
                        const url = lib && isDrive ? `/api/library/${lib.id}` : (lib?.url ?? item.url)
                        if (!url) return null
                        return (
                          <a
                            key={item.id}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
                          >
                            {ITEM_ICON[(item.type ?? 'link') as keyof typeof ITEM_ICON]}
                            <div className="min-w-0">
                              <div className="text-sm font-medium group-hover:text-pr-red-light transition-colors">{title}</div>
                              {item.description && <div className="text-xs text-zinc-500 mt-0.5">{item.description}</div>}
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-zinc-600 group-hover:text-zinc-400 mt-0.5 transition-colors">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
                            </svg>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Gear */}
        {hasGear && gearList && (
          <Section id="gear" blurb={gearList.name} action={<PdfLink href={`/api/gear-lists/${gearList.id}/pdf`} />}>
            {gearList.intro && <p className="text-sm text-zinc-400 mb-3 whitespace-pre-line">{gearList.intro}</p>}
            {(['personal', 'group'] as const).map((gt) => {
              const rows = gearList.gear_list_entries
                .filter((e) => e.group_type === gt)
                .sort((a, b) => a.sort_order - b.sort_order)
              if (rows.length === 0) return null
              // The list's own headings, which are editorial and say what this
              // course wants ("Bring this as well"). Most gear sits under none
              // of them and prints as a plain list — the catalog's taxonomy is
              // how staff find an item, and was never a heading for students.
              const byCat = new Map<string | null, typeof rows>()
              for (const r of rows) {
                const c = r.section ?? null
                byCat.set(c, [...(byCat.get(c) ?? []), r])
              }
              return (
                <div key={gt} className="mb-5">
                  <SubHead title={gt === 'personal' ? 'Each person brings' : 'Group kit'} />
                  {/* Categories hang off the group behind a rule, so "each
                      person brings" visibly owns everything under it rather
                      than the two levels reading as one flat run of lists. */}
                  <div className="ml-0.5 pl-3 border-l-2 border-zinc-800">
                  {[...byCat.entries()].map(([cat, items]) => (
                    <div key={cat ?? '—'} className="mb-2">
                      {cat && (
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">{cat}</p>
                      )}
                      <ul className="border border-zinc-800/70 rounded divide-y divide-zinc-800/70">
                        {placeSets(items).map((p) =>
                          p.kind === 'item' ? (
                            <GearLine key={p.row.id} e={p.row} students={inst.max_students ?? null} />
                          ) : (
                            /* A set is drawn as a set: boxed off, with the
                               claim written above it, because "bring one of
                               these" is the whole point and a student skimming
                               a list of bullets will read every line as
                               required. One alternative is a line of things
                               that go together — "rope and rope bag" — and two
                               or more is a choice between such lines. */
                            <li key={p.rows[0].id} className="px-3 py-2">
                              <div className="rounded border border-pr-red/40 bg-pr-red/[0.04] px-2.5 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-pr-red mb-1.5">
                                  {isChoice(p) ? 'Bring one of' : 'Bring both'}
                                </p>
                                <div className="space-y-1.5">
                                  {p.alternatives.map((o, i) => (
                                    <div key={o.rows[0].id} className="flex items-start gap-2">
                                      {isChoice(p) && (
                                        /* Preference is in the order — the one
                                           written first is what we recommend —
                                           and a fallback says so outright, in
                                           dimmer type, so "acceptable if you
                                           haven't got one" doesn't read as an
                                           equal choice. */
                                        <span className={`shrink-0 w-24 pt-2 text-[10px] uppercase tracking-widest ${
                                          i === 0 ? 'text-zinc-500' : o.ifNeeded ? 'text-zinc-600' : 'text-zinc-500'
                                        }`}>
                                          {i === 0 ? 'Either' : o.ifNeeded ? 'Or, if needed' : 'Or'}
                                        </span>
                                      )}
                                      {/* The parts of one alternative go
                                          together or not at all — the wetsuit
                                          and the rain jacket, the rope and the
                                          bag — so they sit beside each other
                                          with the word that binds them in the
                                          space they share. */}
                                      <ul className={`min-w-0 flex-1 flex flex-wrap items-stretch gap-2 ${
                                        o.ifNeeded ? 'opacity-75' : ''
                                      }`}>
                                        {o.rows.map((e, ri) => (
                                          <React.Fragment key={e.id}>
                                            {ri > 0 && (
                                              <span className="self-center shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">
                                                and
                                              </span>
                                            )}
                                            <GearLine e={e} students={inst.max_students ?? null} card />
                                          </React.Fragment>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  ))}
                  </div>
                </div>
              )
            })}
          </Section>
        )}

        {/* Details is always there, so emptiness is about the sections below it. */}
        {navSections.length === 1 && (
          <p className="text-zinc-500 text-sm">Nothing has been added to this course yet — check back soon.</p>
        )}
      </div>
    </main>
  )
}

// One line of a gear list. Pulled out of the list body because a line inside a
// choice has to read exactly like a line outside one — same name, same models,
// same note — or the alternatives look like a different kind of thing from the
// gear around them.
type GearLineEntry = {
  id: string; gear_item_id: string | null; name: string | null; note: string | null
  url: string | null; quantity: string | null
  qty_each: number | null; qty_per_students: number | null
  gear_items: { name: string; brand: string | null; url: string | null } | null
  gear_entry_options: { sort_order: number; gear_items: { name: string; brand: string | null } | null }[]
}

function GearLine({
  e, students, card,
}: {
  e: GearLineEntry
  // The course's maximum, for the rows that count by it. A student's list is
  // what one person packs, so per-head gear reads as one and only shared kit —
  // one between four — shows the number the group ends up with.
  students: number | null
  // A slot of a multi-slot line draws as a card, so the slots read as peers
  // beside each other rather than as separate requirements stacked up. The
  // operator between them is drawn by whatever holds them.
  card?: boolean
}) {
  const name = e.name ?? (e.gear_items ? productName(e.gear_items) : null) ?? 'Item'
  const url = e.url ?? e.gear_items?.url
  // "Descent device — Petzl Rig or Grigri" when the line accepts more than one
  // model.
  const { detail } = gearLabel(
    name,
    [...(e.gear_entry_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => o.gear_items)
      .filter(Boolean)
      .map((g) => ({ name: productName(g!) }))
  )
  // One person's share. "Bring one" is what a list for one person means by
  // saying nothing, so a per-head row prints no number at all.
  const qty = gearQuantity(e, { students, view: 'person' })

  return (
    <li className={card
      ? 'flex-1 min-w-[13rem] rounded border border-zinc-800/70 bg-zinc-900/40 px-3 py-2 text-sm'
      : 'px-3 py-2 text-sm'}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-pr-red-light transition-colors">{name}</a>
        ) : name}
        {detail && <span className="text-xs text-zinc-400">{detail}</span>}
        {qty.text && <span className="text-[11px] text-zinc-500">× {qty.text}</span>}
      </div>
      {e.note && <p className="text-[11px] text-zinc-500 mt-0.5">{e.note}</p>}
    </li>
  )
}
