import React, { Suspense } from 'react'
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { moduleAudience, KIND_META, type LibraryKind } from '@/lib/library'
import { regionLabel } from '@/lib/regions'
import CourseResourcesSection, { type CourseResource } from '@/app/admin/courses/CourseResourcesSection'
import CourseMapsSection, { type CourseMap } from '@/app/admin/courses/CourseMapsSection'
import CourseAlbumSection from './CourseAlbumSection'
import CourseFilesSection, { type CourseFile } from '@/app/admin/courses/CourseFilesSection'
import CourseIntroFields from './CourseIntroFields'
import CourseCurriculumEditor, { type CurriculumModule } from '@/app/admin/courses/CourseCurriculumEditor'
import CourseGear from '@/app/admin/courses/CourseGear'
import CourseDetailsEditor from '@/app/admin/courses/CourseDetailsEditor'
import CourseStaffingEditor from '@/app/admin/courses/CourseStaffingEditor'
import CourseStudentsEditor from '@/app/admin/courses/CourseStudentsEditor'
import { parseContacts } from '@/lib/contacts'
import { formatPhone } from '@/lib/phone'
import { GEAR_ENTRIES_SELECT } from '@/lib/gear'
import { courseCapabilityCategories } from '@/lib/capabilities'
import { GEAR_ENTRY_COLUMNS, gearLabel, gearQuantity, isChoice, placeSets, productName } from '@/lib/gear'
import { courseDisplayName, computeBlocks, courseDates } from '@/lib/courses'
import CourseTasksPanel, { type CourseTask, type TaskPerson } from '@/components/CourseTasksPanel'
import PdfLink from '@/components/PdfLink'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'
import { AudiencePills } from '@/components/AudiencePills'
import PortalSectionNav from './PortalSectionNav'
import { albumsEnabled } from '@/lib/drive-albums'
import CourseUpdates, { type CourseUpdate, type NotifyCounts } from './CourseUpdates'
import CourseNotes from './CourseNotes'
import MeetingDetails from './MeetingDetails'
import type { UpdateAudience } from './update-actions'
import CourseMessages, { type CourseMessage } from './CourseMessages'
import EditInPlace from './EditableSchedule'
import AddScheduleDay from './AddScheduleDay'
import ScheduleOverviewFields from './ScheduleOverviewFields'
import ScheduleDayCard from '@/app/admin/schedules/ScheduleDayCard'
import type { ScheduleDay as EditableDay } from '@/app/admin/schedules/types'
import WaiverPanel from './WaiverPanel'
import WaiverQrPanel, { type WaiverQr } from '@/components/WaiverQrPanel'
import UnmatchedWaivers from '@/components/UnmatchedWaivers'
import { loadUnmatchedWaivers } from '@/lib/waiver-data'
import { loadStudentWaiver } from '@/lib/waiver-data'
import { notifyCountsFrom } from '@/lib/course-notify'
import { meetingDetails, meetingDayPassed, resolveDayMeeting } from '@/lib/meeting-details'
import { ChipRow } from '@/components/LinkChip'
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

// Chips, coloured by who a thing reaches.
//
// Amber is instructors and teal is students — the same two colours the
// audience pills have used since they replaced three vocabularies with one, so
// a map held back here reads as the same state as an unlit Students pill in
// the editor. Only the held-back state changes colour; the ordinary chip keeps
// whatever its section already looked like, which is why maps stay teal and
// links stay zinc rather than every chip on the page turning into a status.
//
// Both states name their audience, and only the team is shown either. One tag
// and one silence was read as a discrepancy rather than a pair, and it left
// the other half of the answer resting on whoever had typed "Student Map"
// into a title — a second source of truth that agrees with the column
// controlling visibility right up until someone changes one of them.
const CHIP = {
  instructors: {
    chip: 'border-amber-900 bg-amber-950/40 text-amber-400',
    hover: 'hover:text-amber-200 hover:border-amber-700',
    tail: 'text-amber-500/70',
  },
  maps: {
    chip: 'border-teal-800 bg-teal-950/40 text-teal-300',
    hover: 'hover:text-teal-100',
    tail: 'text-teal-600/80',
  },
  links: {
    chip: 'border-zinc-700 bg-zinc-900 text-zinc-300',
    hover: 'hover:text-white hover:border-zinc-500',
    tail: 'text-teal-500/70',
  },
} as const

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

  // Started here, awaited far below where their results are first used.
  //
  // Every one of these depends on nothing but the course id and who is
  // looking, both of which are already known — so there is no reason for them
  // to wait behind the round below. Left where they were read, each was one
  // more sequential round trip to Supabase, and an admin opening a course paid
  // for a dozen of them end to end before the first byte of HTML went out.
  // Kicking the promise off here and awaiting it at the point of use keeps the
  // code in the order it is read while collapsing the waiting into one round.
  //
  // A course that turns out not to exist abandons these mid-flight, so each
  // one is marked handled. The await below still rejects — this only stops an
  // abandoned failure from being reported as an unhandled rejection.
  // Settling it to a real promise here also pins each query builder to a single
  // execution: a builder runs its request every time it is awaited, so the one
  // conversion has to happen once, at the start, rather than at each use.
  const keep = <T,>(p: T): Promise<Awaited<T>> => {
    const q = Promise.resolve(p) as Promise<Awaited<T>>
    q.catch(() => {})
    return q
  }

  const curriculumSetupPromise = keep(showTasks
    ? Promise.all([
        admin.from('course_templates')
          .select('id, name, description, course_type, is_default, course_template_sections(id, course_template_items(id))')
          .eq('active', true)
          .order('name'),
        admin.from('course_modules').select('title'),
      ])
    : Promise.resolve([{ data: null }, { data: null }] as const))

  const venuesPromise = keep(showAsAdmin
    ? admin.from('venues').select('id, name, region, region_code, client_name, notes, active').order('name')
    : Promise.resolve({ data: null }))

  const gearSetupPromise = keep(showAsAdmin
    ? Promise.all([
        admin.from('gear_lists')
          .select(`id, name, audience, intro, instance_id, is_template, ${GEAR_ENTRIES_SELECT}`)
          .eq('instance_id', id),
        admin.from('gear_items')
          .select('id, name, brand, info, url, category, parent_id, aliases, disciplines')
          .eq('active', true).order('name'),
        admin.from('gear_lists')
          .select('id, name, description, audience, course_type, gear_list_entries(id)')
          .eq('is_template', true),
      ])
    : Promise.resolve([{ data: null }, { data: null }, { data: null }] as const))

  const gearRowsPromise = keep(admin
    .from('gear_lists')
    .select(`id, name, audience, intro, gear_list_entries(id, ${GEAR_ENTRY_COLUMNS}, gear_items(name, brand, url, category), gear_entry_options(sort_order, gear_items(name, brand)))`)
    .eq('instance_id', id))

  const schedRowsPromise = keep(admin
    .from('course_schedules')
    .select('id, name, overview, objectives, schedule_days(id, title, location, site_id, notes, objectives, meeting_point, meeting_point_id, meeting_time, meeting_links, meeting_attachments, sort_order, meeting_points(id, name, directions, coords, links), sites(id, name, beta, usual_meeting_time, coords, links, meeting_points(id, name, directions, coords, links)), schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
    .eq('instance_id', id)
    .limit(1))

  const waiverPromise = keep(userId ? loadStudentWaiver(id, userId) : Promise.resolve(null))

  const [{ data: inst }, { data: offDays }, { data: modules }, { data: instructors }, taskRows, { data: peopleRows }, { data: templateRows }, { data: courseDocRows }, { data: taskDocRows }, { data: mapRows }, { data: resourceRows }, { data: linkRows }, { data: updateRows }, { data: enrollmentRows }, { data: messageRows }] =
    await Promise.all([
      admin.from('course_instances')
        .select('course_type, custom_title, status, location, client_name, notes, ref_number, starts_at, ends_at, meeting_date, meeting_announced_dates, meeting_point, meeting_time, meeting_links, meeting_attachments, intro, custom_categories, contacts, max_students, instructor_slots, course_category, internal, invite_token, invite_expires_at, venue_id, region, waiver_template_id, waiver_token, waiver_token_expires_at')
        .eq('id', id)
        .single(),
      admin.from('instance_off_days')
        .select('id, off_date, end_date')
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
        ? admin.from('course_maps').select('id, url, label, audience, audience_overridden, library_item_id, library_items(title, url, audience, library_item_links(url, access, audience))').eq('instance_id', id).order('sort_order')
        : admin.from('course_maps').select('id, url, label, audience, audience_overridden, library_item_id, library_items(title, url, audience, library_item_links(url, access, audience))').eq('instance_id', id).order('sort_order')),
      // The resources shelf — med plan, permits, tech notes for this place.
      // Same audience rule as maps, and read the same way: a student sees
      // only the rows shared with them.
      (showTasks
        ? admin.from('course_resources').select('id, url, label, audience, library_item_id, library_items(id, title, url, kind, audience)').eq('instance_id', id).order('sort_order')
        : admin.from('course_resources').select('id, url, label, audience, library_item_id, library_items(id, title, url, kind, audience)').eq('instance_id', id).eq('audience', 'shared').order('sort_order')),
      // Links added for this delivery — the photo album, the client's
      // paperwork. Same audience rule as maps.
      (showTasks
        ? admin.from('course_links').select('id, url, label, audience, purpose, drive_folder_id').eq('instance_id', id).order('purpose').order('sort_order')
        : admin.from('course_links').select('id, url, label, audience, purpose, drive_folder_id').eq('instance_id', id).eq('audience', 'shared').order('purpose').order('sort_order')),
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

  // The second and last round. Everything below needed something the round
  // above went and got — the course row, the roster, the schedule — so it
  // could not have been started any earlier; none of it needs anything from
  // the others, so none of it waits for them either. The schedule and the
  // filtered updates are unpacked here rather than where they are read
  // because the reads they gate (signing a morning's files, signing an
  // update's attachments) belong in this round with the rest.
  const { data: schedRows } = await schedRowsPromise
  type SchedBlock = { id: string; parent_id: string | null; title: string; time_label: string | null; location: string | null; sort_order: number }
  type SchedMeetup = { id: string; name: string; directions: string | null; coords: string | null; links: { url: string; label: string }[] | null }
  type SchedSite = { id: string; name: string; beta: string | null; usual_meeting_time: string | null; coords: string | null; links: { url: string; label: string }[] | null; meeting_points: SchedMeetup | null }
  type SchedDay = { id: string; title: string; location: string | null; site_id: string | null; sites: SchedSite | null; notes: string | null; objectives: string[] | null; meeting_point: string | null; meeting_point_id: string | null; meeting_points: SchedMeetup | null; meeting_time: string | null; meeting_links: { url: string; label: string }[] | null; meeting_attachments: { path: string; filename: string }[] | null; sort_order: number; schedule_blocks: SchedBlock[] }
  const sched = ((schedRows ?? []) as unknown as {
    id: string; name: string; overview: string | null; objectives: string[]; schedule_days: SchedDay[]
  }[])[0]
  const schedDays = [...(sched?.schedule_days ?? [])].sort((a, b) => a.sort_order - b.sort_order)

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

  // The running order is edited here now, by the people running the course —
  // the same rule the writes themselves use, so what the page offers and what
  // the server will accept are the same sentence. A student is never sent any
  // of this, nor the editor's code.
  const canEditSchedule = showTasks && Boolean(sched)

  // Attachments sit in the private bucket, so they're signed here — one call
  // for every update on the page rather than one per file.
  const updatePaths = updateRowsTyped.flatMap((u) => (u.attachments ?? []).map((a) => a.path))
  // The bucket is private, so every morning's files are signed too — in one
  // round for the whole schedule rather than one per day.
  const dayPaths = schedDays.flatMap((d) => (d.meeting_attachments ?? []).map((a) => a.path))
  const sign = (paths: string[]) =>
    paths.length
      ? admin.storage.from('task-documents').createSignedUrls(paths, 3600)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] })

  const signedDocsPromise = sign(docPaths)
  const signedUpdateDocsPromise = sign(updatePaths)
  const daySignedPromise = sign(dayPaths)
  const meetingPromise = meetingDetails(admin, inst)
  // What a promoted resource would be filed under: the venue if this course
  // has one, the region otherwise.
  const venueRowPromise = keep(showTasks && inst.venue_id
    ? admin.from('venues').select('name').eq('id', inst.venue_id).maybeSingle()
    : Promise.resolve({ data: null }))
  // Sites a day can point at, and the meetups it can gather at. Loaded only
  // for the people who can open a day's editor.
  //
  // The schedule's own shape — its overview, adding and removing days, saving
  // back to the shelf — is not here: that went back to the admin course page
  // when the section-level editor did. What a day *contains* is edited on the
  // day; what the schedule *is* is set up once, elsewhere.
  const schedSetupPromise = canEditSchedule
    ? Promise.all([
        // Canyons and crags with beta already written, so a day points at one
        // instead of retyping the place.
        admin.from('sites')
          .select('id, name, kind, beta, meeting_point_id, usual_meeting_time, venue_id, venues(name)')
          .eq('active', true)
          .order('name'),
        // Where a day can be told to gather instead of the site's usual.
        admin.from('meeting_points')
          .select('id, name, venue_id')
          .eq('active', true)
          .order('name'),
      ])
    : Promise.resolve([{ data: null }, { data: null }] as const)
  // Who has signed, for the staff roster. Read only when staff are looking and
  // only when the course actually has a waiver to sign — a column of "not
  // signed" on a course that never asked for one is a false alarm.
  const waiverOnCourse = Boolean(inst.waiver_template_id)
  const rosterSigPromise = keep(showTasks && waiverOnCourse
    ? admin
        .from('waiver_signatures')
        .select('enrollment_id, identity, signed_at')
        .eq('instance_id', id)
        .not('enrollment_id', 'is', null)
        .order('signed_at', { ascending: false })
    : Promise.resolve({ data: [] }))
  // Walk-ups the matcher wouldn't decide on. Loaded for staff beside the QR
  // that creates them, so the person who ran the code is the one who resolves
  // what it couldn't work out.
  const unmatchedPromise = showTasks && waiverOnCourse
    ? loadUnmatchedWaivers(id, admin)
    : Promise.resolve([])
  // The code an instructor holds up at the trailhead, rendered here because
  // that is the page they have open — the admin editor is somewhere they may
  // not be able to reach and, more to the point, aren't standing in front of.
  const waiverQrPromise: Promise<WaiverQr | null> = showTasks && inst.waiver_token
    ? (async () => {
        const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/waiver/${inst.waiver_token}`
        const QRCode = (await import('qrcode')).default
        return {
          url,
          svg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 148 }),
          expiresAt: (inst.waiver_token_expires_at as string | null) ?? null,
        }
      })()
    : Promise.resolve(null)

  const { data: signedDocs } = await signedDocsPromise
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

  // Which album this course has, if any. What is *in* it is loaded separately,
  // behind a Suspense boundary, because that part waits on Google.
  //
  // Students reach this at all only if the album row survived the audience
  // filter above, which is the same gate as every other link on the course.
  const albumRow = ((linkRows ?? []) as CourseLink[]).find((l) => l.drive_folder_id)

  // Links somebody pasted, as opposed to the folder the portal manages.
  //
  // The albums among them belong to the Album section, alongside the folder —
  // "where are the photos" should have one answer on every course, whether its
  // album is ours or somebody's Google Photos from two years ago. What is left
  // is genuinely other: a permit portal, the client's own paperwork.
  const pastedLinks = ((linkRows ?? []) as CourseLink[]).filter((l) => !l.drive_folder_id)
  const linkedAlbums = pastedLinks.filter((l) => l.purpose === 'photos')
  const otherLinks = pastedLinks.filter((l) => l.purpose !== 'photos')

  // Staff always get the album block, because with no album yet it is the only
  // way to make one — there is no create button, the first upload is what
  // creates the folder. Students get it once an album exists and has been
  // shared, and the audience filter on the query above has already decided
  // that. It lives inside Resources rather than as a section of its own: it is
  // material this course produced, filed with the maps and the reference, and
  // it did not earn a tab.
  const hasAlbum =
    (albumsEnabled() && (showTasks || Boolean(albumRow))) || linkedAlbums.length > 0

  // Library maps take their title and link from the library item; the edit
  // twin (CalTopo edit URL) is only ever handed to the team.
  // A library item's audience is the ceiling, and it is enforced here rather
  // than trusted from the row: the row can be stale — the item was marked
  // instructors-only after a course shared it — and a stale row must not be
  // what decides a student sees an evac plan.
  // A map's links each carry their own access and audience, so what a viewer
  // gets is decided per link rather than by which column the URL sat in.
  //
  // Two questions, asked in order. Whether this course shows the map to
  // students at all — the library's answer unless somebody deliberately
  // overrode it for this delivery — and then which of its links they may have.
  // Staff see every link; that is what staff means here.
  type MapLink = { url: string; access: 'read' | 'edit'; audience: 'students' | 'instructors' }
  const maps = (mapRows ?? []).map((r) => {
    const item = r.library_items as unknown as {
      title: string; url: string | null; audience?: string
      library_item_links?: MapLink[]
    } | null

    const sharedWithStudents = r.audience_overridden
      ? r.audience === 'shared'
      : item
        ? item.audience === 'shared'
        : r.audience === 'shared'

    // A one-off map typed onto the course has no library entry and so no
    // links of its own: it is a single read link, for whoever the course says.
    const links: MapLink[] = item?.library_item_links?.length
      ? item.library_item_links
      : (item?.url ?? r.url)
        ? [{
            url: (item?.url ?? r.url)!,
            access: 'read',
            audience: sharedWithStudents ? 'students' : 'instructors',
          }]
        : []

    return {
      id: r.id,
      label: item?.title ?? r.label ?? 'Map',
      sharedWithStudents,
      // A course overruling the library hands over the whole map, editable
      // links included — that is what overriding is for. Students being given
      // edit access on one exercise, or staff sitting as students on an
      // internal course, are the cases, and filtering by each link's own
      // audience afterwards would leave the toggle doing nothing at all.
      //
      // Left alone, the library decides twice over: whether students get the
      // map, and then which of its links are theirs.
      links: showTasks
        ? links
        : !sharedWithStudents
          ? []
          : r.audience_overridden
            ? links
            : links.filter((l) => l.audience === 'students'),
    }
  }).filter((m) => m.links.length > 0)

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

  // The same rows in the shape the editor wants — unfiltered, and carrying
  // where each one came from. Built only for staff, who are the only people
  // the editor is ever handed to.
  const editableResources: CourseResource[] = !showTasks ? [] : (resourceRows ?? []).map((r) => {
    const item = r.library_items as unknown as { title: string; url: string | null; audience?: string } | null
    return {
      id: r.id as string,
      label: item?.title ?? (r.label as string | null) ?? 'Document',
      url: item?.url ?? (r.url as string | null),
      // Read through the same ceiling the page reads through, so a pill can
      // never claim students while the row under it says instructors.
      audience: (item?.audience === 'internal' ? 'internal' : r.audience) as CourseResource['audience'],
      fromLibrary: Boolean(r.library_item_id),
      libraryLocked: item?.audience === 'internal',
    }
  })

  // The maps in the shape the editor wants: unfiltered, carrying where each
  // came from and what the library says, so a pill here can never claim
  // something the page below it won't do.
  const editableMaps: CourseMap[] = !showTasks ? [] : (mapRows ?? []).map((r) => {
    const item = r.library_items as unknown as {
      title: string; url: string | null; audience: string
      library_item_links?: { access: string; audience: string }[]
    } | null
    return {
      id: r.id as string,
      label: item?.title ?? (r.label as string | null) ?? 'Map',
      url: item?.url ?? (r.url as string | null),
      audience: (r.audience_overridden ? r.audience : item?.audience ?? r.audience) as CourseMap['audience'],
      fromLibrary: Boolean(r.library_item_id),
      libraryAudience: (item?.audience as 'internal' | 'shared' | undefined) ?? null,
      overridden: Boolean(r.audience_overridden),
      // Sharing a map with students only shows them something if one of its
      // links is theirs. Without this the two gates look like one, and turning
      // the first appears to do nothing.
      hasStudentLink: item?.library_item_links?.length
        ? item.library_item_links.some((l) => l.audience === 'students')
        : true,
    }
  })

  const editableFiles: CourseFile[] = !showTasks ? [] : [
    ...(courseDocRows ?? []).map((r) => ({
      id: r.id as string,
      filename: (r.filename as string | null) ?? 'document',
      url: (r.url as string | null) ?? (r.path ? docUrl.get(r.path as string) : undefined) ?? '#',
      source: 'course' as const,
      label: null,
      isLink: Boolean(r.url),
    })),
    ...(taskDocRows ?? []).map((r) => ({
      id: r.id as string,
      filename: (r.filename as string | null) ?? 'document',
      url: (r.url as string | null) ?? (r.path ? docUrl.get(r.path as string) : undefined) ?? '#',
      source: 'task' as const,
      label: (r.course_tasks as unknown as { title: string } | null)?.title ?? null,
      isLink: Boolean(r.url),
    })),
  ]

  // Assigning curriculum happens on the course now, so the pickers need what
  // they pick from: the shapes available for this offering, and the section
  // names already in use so the same one isn't retyped three ways.
  const [{ data: curriculumTplRows }, { data: sectionNameRows }] = await curriculumSetupPromise

  const curriculumTemplates = ((curriculumTplRows ?? []) as unknown as {
    id: string; name: string; description: string | null; course_type: string | null
    course_template_sections: { id: string; course_template_items: { id: string }[] }[]
  }[])
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      sections: t.course_template_sections.length,
      items: t.course_template_sections.reduce((n, sec) => n + sec.course_template_items.length, 0),
      isDefault: t.course_type === inst.course_type,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))

  const knownSectionNames = [...new Set(
    ((sectionNameRows ?? []) as { title: string }[]).map((m) => m.title)
  )].sort((a, b) => a.localeCompare(b))

  const courseDisciplines = courseCapabilityCategories(
    inst.course_type as string,
    inst.custom_categories as string[] | null
  )

  // What a course *is* — the offering, who asked, who to call, how many. Setup
  // rather than delivery, so it is the admin's to change, and loaded only for
  // them.
  const { data: venueRows } = await venuesPromise
  const coursePocs = parseContacts(inst.contacts)

  // Building the gear list is admin work — instructors read it and take it to
  // the trailhead, they don't assemble it — so this is the one editor gated on
  // being an admin rather than on being staff. Loaded only then: the catalog
  // is every item we own, and a student's page has no use for it.
  const [{ data: gearListRows }, { data: gearCatalogRows }, { data: gearTemplateRows }] = await gearSetupPromise

  const gearTemplateOptions = ((gearTemplateRows ?? []) as unknown as {
    id: string; name: string; description: string | null; audience: string
    course_type: string | null; gear_list_entries: unknown[]
  }[])
    .sort((a, b) => Number(b.course_type === inst.course_type) - Number(a.course_type === inst.course_type))
    .map((t) => ({
      id: t.id, name: t.name, description: t.description,
      audience: t.audience, entries: t.gear_list_entries.length,
    }))

  // Null when neither venue nor region is set, and there is nothing to offer.
  const { data: venueRow } = await venueRowPromise
  const coursePlace: string | null =
    (venueRow?.name as string | undefined) ?? (regionLabel(inst.region as string | null) || null)

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
  const { data: gearRows } = await gearRowsPromise
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

  const [{ data: schedSiteRows }, { data: schedPointRows }] = await schedSetupPromise

  const schedSites = ((schedSiteRows ?? []) as unknown as {
    id: string; name: string; kind: string | null; beta: string | null; meeting_point_id: string | null; usual_meeting_time: string | null; venue_id: string | null; venues: { name: string } | null
  }[]).map((s) => ({
    id: s.id, name: s.name, kind: s.kind, beta: s.beta,
    meeting_point_id: s.meeting_point_id, usual_meeting_time: s.usual_meeting_time,
    venue_id: s.venue_id, venue_name: s.venues?.name ?? null,
  }))

  const schedMeetingPoints = ((schedPointRows ?? []) as unknown as
    { id: string; name: string; venue_id: string | null }[])

  // The editor's shape, not the page's: it wants the days plain, without the
  // site rows the read view joins in to show beta.
  const editableDays = new Map<string, EditableDay>(
    schedDays.map((d) => [d.id, ({
          id: d.id,
          title: d.title,
          location: d.location,
          site_id: d.site_id,
          notes: d.notes,
          objectives: d.objectives ?? [],
          meeting_point: d.meeting_point,
          meeting_point_id: d.meeting_point_id,
          meeting_time: d.meeting_time,
          sort_order: d.sort_order,
          schedule_blocks: d.schedule_blocks ?? [],
        })])
  )

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
  const meeting = await meetingPromise
  const hasSchedule = Boolean(sched && schedDays.length > 0)
  // Staff get it whether or not anything is in it: this is where the first
  // section gets added, and a section that appears only once it has contents
  // is one nobody can put contents into.
  const hasCurriculum = orderedModules.length > 0 || showTasks
  const hasGear = Boolean(gearList && gearList.gear_list_entries.length > 0)
  // Staff get the section whether or not anything is in it: it is where the
  // first resource and the first file get added, and a section that appears
  // only once it has contents is one nobody can put contents into.
  const hasResources = resources.length > 0 || showTasks || hasAlbum
  // Staff get the notes section whether or not there is anything in it — it is
  // where the first note gets written, and an empty section that says so beats
  // sending someone to the admin editor to type one line.
  const hasNotes = showTasks
  // Everyone on the course sees updates; staff also get the box to write one,
  // so the section shows for them even when there's nothing posted yet.
  const { data: signedUpdateDocs } = await signedUpdateDocsPromise
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

  const [{ data: rosterSigRows }, waiverQr, unmatchedWaivers] =
    await Promise.all([rosterSigPromise, waiverQrPromise, unmatchedPromise])

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
  const waiver = await waiverPromise

  // The meeting block lives in here, so a course with no posts yet still has
  // an Updates section for a student to find the meeting point in.
  const hasUpdates = canPostUpdates || courseUpdates.length > 0 ||
    Boolean(meeting.meetingPoint || meeting.meetingTime || meeting.links.length || meeting.files.length)
  const hasDocuments = showTasks
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
  const meetingOver = meetingDayPassed(meeting.meetingDate, inst.starts_at as string | null)

  // Which calendar date each schedule day falls on. Derived, never stored: a
  // schedule can be saved to the shelf as a template, and a template day
  // belongs to no calendar.
  const runningDates = courseDates(
    inst.starts_at as string | null,
    inst.ends_at as string | null,
    offDays ?? []
  )
  const dayDates = schedDays.map((_, i) => runningDates[i] ?? null)

  const { data: daySignedRows } = await daySignedPromise
  const daySignedByPath = new Map((daySignedRows ?? []).map((r) => [r.path, r.signedUrl]))

  // Today's morning and tomorrow's stand open; everything else folds to its
  // one-line summary. The afternoon before is when people start thinking about
  // where they are going, so a plan that only opens on the day itself opens
  // too late — and eight open meeting blocks down one page is how the one that
  // matters stops being findable.
  const todayISO = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()
  const tomorrowISO = new Date(Date.parse(`${todayISO}T00:00:00`) + 86_400_000)
    .toISOString().slice(0, 10)
  const isOpenDay = (d: string | null) => d === todayISO || d === tomorrowISO

  // Once any day carries its own morning, the day is where the morning lives
  // and the course-level block is a second answer to one question. It steps
  // aside rather than being deleted — nothing moves, and a course that never
  // sets a day keeps the block it has always had.
  const daysCarryMeeting = schedDays.some(
    (d) => d.meeting_time || d.meeting_point || d.meeting_point_id
  )


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
              // The editor and this page link to each other, and both take
              // seconds to render: left to prefetch, opening either one
              // silently renders the other as well.
              prefetch={false}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
              Edit course
            </Link>
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

        </div>

        <PortalSectionNav
          sections={navSections}
          trailing={isAdmin ? (
            /* Which role you are reading as, travelling down the page with
               you. At the top it answered the question only where nobody was
               asking it — you find out you are in a preview at the moment a
               control is missing, which is halfway down. */
            <div className="flex items-center gap-0.5 text-[11px]">
              {([
                ['', 'Admin', 'Everything, unfiltered'],
                ['instructor', 'Instructor', 'What an assigned instructor sees (uses your real role on this course)'],
                ['student', 'Student', 'What an enrolled student sees'],
              ] as const).map(([key, label, hint]) => (
                <Link
                  key={label}
                  href={key ? `/portal/${id}?as=${key}` : `/portal/${id}`}
                  // This bar is sticky, so all three links sit in the viewport
                  // for the whole visit and get prefetched — three more full
                  // renders of this page, which is the most expensive one we
                  // have, kicked off by the page itself. Switching preview
                  // roles is rare enough to pay for its own navigation.
                  prefetch={false}
                  title={hint}
                  className={`px-1.5 py-1 rounded font-medium transition-colors ${
                    (viewAs ?? '') === key
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {/* Full words where there is room; initials where there
                      isn't, because the bar also carries the jump links. */}
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label[0]}</span>
                </Link>
              ))}
            </div>
          ) : null}
        />

        {/* Who is on this course — the welcome, the crew, the roster. Where
            to meet used to be here too, but it is news rather than reference:
            it belongs with the updates, and it belongs out of the way once
            everyone has met. */}
        {hasDetails && (
          <Section id="details">
            <div className="space-y-6">
              {/* What the course is, for the people who set it up. A concise
                  read — the facts you check — with the same edit control
                  everything else on this page has, opening the same form the
                  editor uses rather than sending you to it.

                  Admin-tier: an instructor runs the course, they do not decide
                  what it is or who is paying for it. */}
              {showAsAdmin && (
                <EditInPlace
                  label="Edit details"
                  title="Course details"
                  editor={
                    <CourseDetailsEditor
                      instanceId={id}
                      course={inst as unknown as React.ComponentProps<typeof CourseDetailsEditor>['course']}
                      contacts={coursePocs}
                      venues={(venueRows ?? []) as unknown as React.ComponentProps<typeof CourseDetailsEditor>['venues']}
                      offDays={(offDays ?? []) as unknown as React.ComponentProps<typeof CourseDetailsEditor>['offDays']}
                      internal={Boolean(inst.internal)}
                    />
                  }
                >
                  {/* Label above value, not beside it.
                      These sat inline — "Client Micah", "Students 5" — so
                      every value began wherever its label happened to end, and
                      nothing lined up to be read down. Two columns also left
                      the third fact alone on a row with a gap beside it. Now
                      the labels are a heading row and the answers sit under
                      them, in the same small-caps used for headings elsewhere
                      on this page. */}
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                    {/* Location repeats the WHERE card at the top of the page,
                        deliberately. This block is the read side of the details
                        editor, and that editor sets the location — a field you
                        change here and then cannot see here reads as a change
                        that did not save. */}
                    {([
                      ['Client', inst.client_name as string | null],
                      ['Location', inst.location as string | null],
                      ['Students', inst.max_students ? String(inst.max_students) : null],
                      ['Instructor slots', inst.instructor_slots ? String(inst.instructor_slots) : null],
                    ] as const).map(([k, v]) => v && (
                      <div key={k}>
                        <dt className="text-[11px] uppercase tracking-wide text-zinc-500 mb-0.5">{k}</dt>
                        <dd className="text-zinc-200">{v}</dd>
                      </div>
                    ))}
                    {/* The POC is the one thing here nobody can look up: a name
                        and a way to reach them, live rather than as text to
                        copy out. Full width because a name and a phone number
                        do not fit in a third of the row. */}
                    {coursePocs.map((c, i) => (
                      <div key={i} className="col-span-full">
                        <dt className="text-[11px] uppercase tracking-wide text-zinc-500 mb-0.5">Contact</dt>
                        <dd className="text-zinc-200 min-w-0">
                          {c.name}
                          {c.phones.map((ph) => (
                            <span key={ph} className="text-zinc-500">
                              {' · '}
                              <a href={`tel:${ph}`} className="hover:text-zinc-300 transition-colors">{formatPhone(ph)}</a>
                            </span>
                          ))}
                          {c.emails.map((em) => (
                            <span key={em} className="text-zinc-500">
                              {' · '}
                              <a href={`mailto:${em}`} className="hover:text-zinc-300 transition-colors">{em}</a>
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {!inst.client_name && coursePocs.length === 0 && (
                    <p className="text-xs text-zinc-600">No client or contact on this course yet.</p>
                  )}
                </EditInPlace>
              )}
              <EditInPlace
                label="Edit welcome"
                title="Welcome"
                editor={showTasks ? <CourseIntroFields instanceId={id} intro={inst.intro as string | null} /> : null}
              >
              {!inst.intro && showTasks && (
                <p className="text-xs text-zinc-600">No welcome note written for this course yet.</p>
              )}
              {inst.intro && (
                <p className="text-sm text-zinc-300 whitespace-pre-line">{inst.intro}</p>
              )}
              </EditInPlace>
              {/* Who is running it. Assigning is the admin's call — an
                  instructor is on the course, they don't decide who else is —
                  so the crew reads for everyone and edits for one. */}
              <EditInPlace
                label="Edit staffing"
                title={(instructors ?? []).length === 1 ? 'Your instructor' : 'Your instructors'}
                editor={
                  showAsAdmin ? (
                    <CourseStaffingEditor
                      instanceId={id}
                      courseType={inst.course_type as string | null}
                      courseCategory={inst.course_category as string | null}
                      customCategories={inst.custom_categories as string[] | null}
                      internal={Boolean(inst.internal)}
                    />
                  ) : null
                }
              >
              {(instructors ?? []).length === 0 && showTasks && (
                <p className="text-xs text-zinc-600">Nobody staffed on this course yet.</p>
              )}
              {(instructors ?? []).length > 0 && (
                <div>
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
              </EditInPlace>
              {hasRoster && (
                <EditInPlace
                  label="Edit students"
                  editor={
                    showAsAdmin ? (
                      <CourseStudentsEditor
                        instanceId={id}
                        maxStudents={(inst.max_students as number | null) ?? null}
                        inviteToken={(inst.invite_token as string | null) ?? null}
                        inviteExpiresAt={(inst.invite_expires_at as string | null) ?? null}
                      />
                    ) : null
                  }
                >
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
                          <Link href={`/admin/courses/${id}`} prefetch={false} className="text-zinc-300 hover:text-white underline underline-offset-2">
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
                </EditInPlace>
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
            unread={unreadUpdates > 0}
          >
            {/* Above the feed until the meeting day is behind us, a single
                line after that. Where to meet is the most important thing on
                the page right up to the moment everyone has met, and dead
                weight from then on. */}
            {/* Superseded once the schedule days carry their own mornings: two
                blocks answering "where do we meet" is how one of them ends up
                stale. It simply goes — the Schedule section is one heading
                away and carries the answer on the day it belongs to. */}
            {daysCarryMeeting ? null : (
            <div className="mb-4">
              <MeetingDetails
                instanceId={id}
                meetingDate={meeting.meetingDate}
                courseStart={inst.starts_at as string | null}
                meetingPoint={meeting.meetingPoint}
                meetingTime={meeting.meetingTime}
                links={meeting.links}
                files={meeting.files}
                canEdit={showTasks}
                notifyCounts={notifyCounts}
                // Only staff post, so only staff need the history.
                announcedDates={showTasks ? ((inst.meeting_announced_dates as string[] | null) ?? []) : []}
                folded={meetingOver}
              />
            </div>
            )}

            <CourseUpdates
              instanceId={id}
              updates={courseUpdates.map((u) => ({ ...u, isNew: isNew(u) }))}
              canPost={canPostUpdates}
              notifyCounts={notifyCounts}
            />
            {showTasks && (
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <SubHead title="Emails" badge={<AudiencePills audience="internal" />} />
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
          <Section id="tasks" title="Course tasks" team>
            {hasNotes && (
              <div className="mb-6">
                <SubHead title="Notes" />
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
            action={<PdfLink href={`/api/schedules/${sched.id}/pdf`} />}
          >
            {/* What the course is, before the days it happens on. Editable
                here because this is where it is read — and because an empty
                overview is invisible, so a way in that lives on another screen
                is a way in nobody finds. */}
            <EditInPlace
              label="Edit overview"
              title="Overview"
              editor={
                canEditSchedule ? (
                  <ScheduleOverviewFields
                    scheduleId={sched.id}
                    overview={sched.overview}
                    objectives={sched.objectives ?? []}
                  />
                ) : null
              }
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
              {/* Staff see that there is nothing here rather than nothing at
                  all — an empty overview is otherwise indistinguishable from a
                  feature that went away. */}
              {!sched.overview && !sched.objectives.length && canEditSchedule && (
                <p className="text-xs text-zinc-600 mb-3">No overview or objectives set.</p>
              )}
            </EditInPlace>
            <div className="space-y-3">
              {schedDays.map((d, di) => {
                const blocks = [...(d.schedule_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
                const topics = blocks.filter((b) => !b.parent_id)
                const editableDay = editableDays.get(d.id) ?? null
                const dayPassed = meetingDayPassed(dayDates[di], null)
                return (
                  <details
                    key={d.id}
                    open={!dayPassed}
                    className="group/day bg-zinc-900 border border-zinc-800 rounded-lg p-4"
                  >
                    {/* Days already behind us fold to a line, so a five-day
                        course reads as today plus what is still ahead. The cut
                        is local midnight — "is that day behind us" is a
                        question about the calendar, not the hour — which is
                        the same test the meeting block folds on.

                        A day with no date can't be behind anything, so a
                        schedule longer than its course stays open. */}
                    <summary className="cursor-pointer list-none flex items-baseline gap-2">
                      <span
                        aria-hidden
                        className="text-zinc-600 shrink-0 text-[10px] transition-transform group-open/day:rotate-90"
                      >
                        ▸
                      </span>
                      {!/^day\s*\d+\b/i.test(d.title.trim()) && (
                        <span className="text-[11px] font-mono text-zinc-600 shrink-0">Day {di + 1}</span>
                      )}
                      <h3 className="font-medium text-sm">{d.title}</h3>
                      {/* Folded, the place is the only other thing worth
                          carrying — it is what tells one past day from
                          another. */}
                      {d.location && (
                        <span className="text-xs text-zinc-600 truncate group-open/day:hidden">
                          {d.location}
                        </span>
                      )}
                    </summary>
                    {/* The way into this day, on this day. The element is only
                        built for staff, so a student is sent neither the button
                        nor the editor's code — and `canEditSchedule` is the
                        rule the server actions enforce, so it is never offered
                        where the write would be refused. */}
                    <EditInPlace
                      label="Edit day"
                      editor={
                        canEditSchedule && editableDay ? (
                          <ScheduleDayCard
                            day={editableDay}
                            sites={schedSites}
                            meetingPoints={schedMeetingPoints}
                            venueId={inst.venue_id}
                          />
                        ) : null
                      }
                    >
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
                    {/* The morning, in the same block the course has always
                        used — audience, copy-me, links, attachments, and save
                        and notify as one press. It is attached to this day
                        rather than to the course, which is the only thing that
                        differs. Where nothing is typed here it shows the
                        meetup the site usually uses. */}
                    {(() => {
                      const m = resolveDayMeeting(d, d.sites)
                      const date = dayDates[di]
                      const own = Boolean(d.meeting_time || d.meeting_point || (d.meeting_links ?? []).length || (d.meeting_attachments ?? []).length)
                      const empty = !own && !m.point
                      // Staff get the block on every day, because setting a
                      // morning is the only way to set one — the editor no
                      // longer carries those fields, so a day that renders
                      // nothing is a day whose morning can never be written.
                      // Folded, it is one quiet line saying "not set", which is
                      // a way in rather than an announcement. Students see only
                      // the mornings that exist.
                      if (empty && (!showTasks || !date)) return null
                      return (
                        <div className="flex gap-1.5 mt-2">
                          {/* The flag sits in the same gutter as the pin, the
                              rope and the page corner. Without it this block
                              started at the card's edge while everything under
                              it started a glyph's width in, so the morning's
                              own link and the canyon's stood at two different
                              indents and read as two unrelated things. */}
                          <svg
                            aria-hidden
                            xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                            className="shrink-0 mt-[5px] text-zinc-600"
                          >
                            <path d="M5 21V4" />
                            <path d="M5 4h11l-2 3.5L16 11H5" />
                          </svg>
                          <div className="flex-1 min-w-0">
                          <MeetingDetails
                            instanceId={id}
                            dayId={d.id}
                            inheritedPoint={d.meeting_point ? null : m.point}
                            inheritedTime={m.usualTime}
                            meetingDate={date}
                            courseStart={date}
                            meetingPoint={d.meeting_point}
                            meetingTime={d.meeting_time}
                            links={d.meeting_links ?? []}
                            files={(d.meeting_attachments ?? []).map((a) => ({
                              ...a,
                              url: daySignedByPath.get(a.path) ?? '#',
                            }))}
                            canEdit={showTasks}
                            notifyCounts={notifyCounts}
                            announcedDates={showTasks ? ((inst.meeting_announced_dates as string[] | null) ?? []) : []}
                            // An empty day never opens itself: it is a way
                            // in, not an announcement that nobody knows where
                            // to go.
                            folded={empty || !isOpenDay(date)}
                          />
                          </div>
                        </div>
                      )
                    })()}
                    {/* The canyon, not the day. It's written once on the site
                        and shown live here, so a corrected rap count reaches
                        every course at once — which is also why it sits above
                        the day's own note rather than merged into it: one of
                        these is a standing fact about the place, the other is
                        what's true this morning. */}
                    {d.sites?.beta && (
                      <div className="flex gap-1.5 mt-2">
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 mt-[5px] text-zinc-600"
                        >
                          <circle cx="6" cy="19" r="3" />
                          <circle cx="18" cy="5" r="3" />
                          <path d="M9 19h4a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h4" />
                        </svg>
                        {/* Folded on the same rhythm as the morning above it:
                            open today and tomorrow, a single line the rest of
                            the week. The two are read together — where we are
                            meeting and what we are dropping into — so one of
                            them standing open while the other collapses makes a
                            day look half-answered.

                            A <details> rather than state: this is a server
                            component, and the browser already knows how to open
                            and close a disclosure. */}
                        <details open={isOpenDay(dayDates[di])} className="group flex-1 min-w-0">
                          <summary className="cursor-pointer list-none flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                            <span aria-hidden className="text-zinc-600 shrink-0 inline-block transition-transform group-open:rotate-90">▸</span>
                            <span className="font-medium text-zinc-400 shrink-0">Route</span>
                            {/* The scope line — "Upper Emerald only, to the
                                footbridge" — is what tells two canyons at one
                                place apart, so it is the half worth showing
                                while the rest is folded away. */}
                            <span className="truncate group-open:hidden">
                              {(d.sites.beta ?? '').split('\n').find((l) => l.trim()) ?? ''}
                            </span>
                          </summary>
                          <p className="text-xs text-zinc-400 whitespace-pre-line leading-relaxed mt-1.5">{d.sites.beta}</p>
                          {/* The canyon's standing links — route page, gauge —
                              as opposed to anything pinned to one morning,
                              which sits in the meeting block above. */}
                          {(d.sites.links ?? []).length > 0 && (
                            <div className="mt-2">
                              <ChipRow links={d.sites.links ?? []} />
                            </div>
                          )}
                        </details>
                      </div>
                    )}
                    {/* Under a pinned location, an unmarked grey line read as
                        more of the address. The page corner says this one is
                        someone's note about the day — usually something to
                        bring, and worth not skimming past.

                        On a canyon day it's route beta instead — approach,
                        raps, exit — and caption-sized grey type is the wrong
                        size to read that at a trailhead. So it takes the same
                        size and weight as the objectives, and keeps the line
                        breaks it was typed with: pressing Enter is the only
                        structure this field needs, and the paragraphs it makes
                        are what stop it reading as a wall. */}
                    {d.notes && (
                      <div className="flex gap-1.5 mt-2">
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 mt-[5px] text-zinc-600"
                        >
                          <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
                          <path d="M14 21v-3a2 2 0 0 1 2-2h3" />
                        </svg>
                        <p className="flex-1 min-w-0 text-xs text-zinc-400 whitespace-pre-line leading-relaxed">
                          {d.notes}
                        </p>
                      </div>
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
                    </EditInPlace>
                  </details>
                )
              })}
            </div>
            {/* The one piece of the schedule's shape that stayed: a day the
                running order doesn't have yet belongs to no day, so there is
                nowhere else on this page to put it. */}
            {canEditSchedule && (
              <div className="mt-3">
                <AddScheduleDay scheduleId={sched.id} />
              </div>
            )}
          </Section>
        )}

        {/* Resources — what's true about this place: the med plan, the permit,
            the evacuation annex. Above the curriculum and visibly not part of
            it, because "what do I do if someone gets hurt" is not lesson four.
            Rows the team can see but students can't are badged, so an
            instructor reading the same page knows which is which. */}
        {hasResources && (
          <Section id="resources">
            {/* Maps are reference for the place, which is what this whole
                section is — the same question the med plan answers. They sat
                beside the location, which read better but left their edit
                control floating under the WHERE card attached to nothing.

                Promoting one into the library stays admin-only inside the
                component's own actions. */}
            <EditInPlace
              label="Edit maps"
              title="Maps"
              editor={
                showTasks ? (
                  <CourseMapsSection instanceId={id} maps={editableMaps} placeLabel={coursePlace} />
                ) : null
              }
            >
            {maps.length === 0 && showTasks && (
              <p className="text-xs text-zinc-600">No maps on this course yet.</p>
            )}
            {maps.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
                {maps.map((m) => (
                  // One chip per link, kept closer to each other than to the next
                  // map — a single pill cut in half read as one link that had
                  // been broken, and nothing about it said the halves went
                  // different places. The first carries the name; the rest say
                  // only how they differ, which is all there is to say.
                  <span key={m.id} className="inline-flex items-center gap-1.5">
                    {m.links.map((l, i) => {
                      const c = l.audience === 'students' ? CHIP.maps : CHIP.instructors
                      return (
                        <a
                          key={`${l.access}-${l.audience}`}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          title={`${m.label} — ${l.access === 'edit' ? 'editable' : 'read-only'}, for ${l.audience}`}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border no-underline transition-colors ${c.chip} ${c.hover}`}
                        >
                          {i === 0 && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                              <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          )}
                          {i === 0 ? m.label : l.access === 'edit' ? 'Editable' : 'Read-only'}
                          {/* Students are only ever handed their own links, so
                              saying whose it is would be telling them something
                              they can't act on. Staff see several at once and
                              need to know which is which. */}
                          {showTasks && (
                            <span className={c.tail}>
                              · {l.audience}{i === 0 && l.access === 'edit' ? ' · editable' : ''}
                            </span>
                          )}
                        </a>
                      )
                    })}
                  </span>
                ))}
              </div>
            )}
            </EditInPlace>

            {/* Whatever a course was given that isn't a map, a document or an
                album: a permit portal, the client's own site. Nothing here is
                editable — these arrive from elsewhere, and the one link the
                team actually keeps is the album, which lives in its own
                section. */}
            {otherLinks.length > 0 && (
            <div className="mt-6 pt-6 border-t border-zinc-800">
            <EditInPlace
              label="Edit links"
              title="Links"
              editor={null}
            >
            {(linkRows ?? []).length > 0 && (
              <div className="space-y-3">
                {PURPOSE_ORDER.map((purpose) => {
                  // Albums of every kind are shown in the Album section.
                  const rows = otherLinks.filter((l) => l.purpose === purpose)
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
                            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              showTasks && l.audience === 'internal'
                                ? `${CHIP.instructors.chip} ${CHIP.instructors.hover}`
                                : `${CHIP.links.chip} ${CHIP.links.hover}`
                            }`}
                          >
                            {linkLabel(l)}
                            {showTasks && (
                              <span className={l.audience === 'internal' ? CHIP.instructors.tail : CHIP.links.tail}>
                                · {l.audience === 'internal' ? 'instructors' : 'students'}
                              </span>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            </EditInPlace>
            </div>
            )}

            <div className="mt-6 pt-6 border-t border-zinc-800">
            {/* Reference for this place, edited where it is read. Save-to-
                library stays admin-only inside the component's own actions —
                promoting a med plan reaches every course that pulls it. */}
            <EditInPlace
              label="Edit reference"
              title="Reference"
              editor={
                showTasks ? (
                  <CourseResourcesSection
                    instanceId={id}
                    resources={editableResources}
                    placeLabel={coursePlace}
                  />
                ) : null
              }
            >
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
            {/* Staff with nothing here still get the way in — an empty section
                is otherwise indistinguishable from one you cannot add to. */}
            {resources.length === 0 && showTasks && (
              <p className="text-xs text-zinc-600">No reference material on this course yet.</p>
            )}
            </EditInPlace>
            </div>
            {hasDocuments && (
              <div className="mt-6 pt-6 border-t border-zinc-800">
                {/* Every attachment on the course in one place — uploads,
                    pasted links, and documents that arrived on a task. Adding
                    one here is what makes "put the client's PDF somewhere" a
                    thing you do on the course rather than on another screen. */}
                <EditInPlace
                  label="Edit files"
                  title="Files"
                  editor={showTasks ? <CourseFilesSection instanceId={id} files={editableFiles} /> : null}
                >
                {courseDocs.length === 0 && (
                  <p className="text-xs text-zinc-600">Nothing attached to this course yet.</p>
                )}
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
                </EditInPlace>
              </div>
            )}

            {hasAlbum && (
            <div className="mt-6 pt-6 border-t border-zinc-800">
              {/* No blurb. Who can do what is already on the screen: the add
                  button is there for everyone on the course, and the remove
                  mark only appears for the people who have it. */}
              <h3 className="text-sm font-semibold text-zinc-200 mb-2">Album</h3>
              <Suspense fallback={<p className="text-sm text-zinc-500">Loading album…</p>}>
                <CourseAlbumSection
                  instanceId={id}
                  canManage={showTasks}
                  album={
                    albumRow?.drive_folder_id
                      ? {
                          linkId: albumRow.id,
                          url: albumRow.url,
                          audience: albumRow.audience,
                          folderId: albumRow.drive_folder_id,
                        }
                      : null
                  }
                  linked={linkedAlbums}
                />
              </Suspense>
            </div>
            )}
          </Section>
        )}

        {/* Curriculum — the modules, each its own named group rather than a
            page-length run of link rows. */}
        {hasCurriculum && (
          <Section id="curriculum">
            {/* Sections and the items in them, assigned on the course. The
                editor is a server component — it is server actions bound to
                rows all the way down — so it is built here and handed over
                rather than imported into the client. */}
            <EditInPlace
              label="Edit curriculum"
              title="Sections"
              editor={
                showTasks ? (
                  <CourseCurriculumEditor
                    instanceId={id}
                    modules={orderedModules as unknown as CurriculumModule[]}
                    templates={curriculumTemplates}
                    courseDisciplines={courseDisciplines}
                    knownSectionNames={knownSectionNames}
                  />
                ) : null
              }
            >
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
            </EditInPlace>
          </Section>
        )}

        {/* Gear */}
        {hasGear && gearList && (
          <Section id="gear" blurb={gearList.name} action={<PdfLink href={`/api/gear-lists/${gearList.id}/pdf`} />}>
            {/* Admin-only, unlike every other editor on this page: assembling
                a gear list is not something an instructor was ever meant to
                deal with, and the toggle should show that by taking it away. */}
            <EditInPlace
              label="Edit gear list"
              title="The list"
              editor={
                showAsAdmin ? (
                  <CourseGear
                    instanceId={id}
                    courseType={inst.course_type as string | null}
                    students={(inst.max_students as number | null) ?? null}
                    lists={(gearListRows ?? []) as unknown as React.ComponentProps<typeof CourseGear>['lists']}
                    templates={gearTemplateOptions}
                    catalog={(gearCatalogRows ?? []) as unknown as React.ComponentProps<typeof CourseGear>['catalog']}
                  />
                ) : null
              }
            >
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
            </EditInPlace>
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
