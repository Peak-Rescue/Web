import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInstanceDetails, updateInstanceDates, addOffDay, removeOffDay, addModule, deleteModule, addItem, deleteItem, removeInstructor, removeEnrollment, updateCourseLogistics } from '../actions'
import { CourseTypeSelect } from '../CourseTypeSelect'
import InstructorAssign from '../InstructorAssign'
import StaffingInterest from '../StaffingInterest'
import GuestInstructorButton from '../GuestInstructorButton'
import CourseFilesSection, { type CourseFile } from '../CourseFilesSection'
import StudentInvitePanel from '../StudentInvitePanel'
import AutoSaveForm from '@/components/AutoSaveForm'
import DeleteInstanceButton from '../DeleteInstanceButton'
import CourseTasksPanel, { type TaskPerson } from '@/components/CourseTasksPanel'
import EstimatePanel, { type PricingRate } from '@/components/EstimatePanel'
import CoaComparison from '../CoaComparison'
import QuoteHeroPicker from '../QuoteHeroPicker'
import { HERO_CHOICES } from '@/lib/quote-heroes'
import NewCoaMenu, { type CopySource } from '../NewCoaMenu'
import { guessSeedQty } from '@/lib/estimates'
import { EstimateReviewBanner, EstimateReviewRequest, type EstimateReviewRow } from '../EstimateReviewBar'
import QuotesSection, { type QuoteRow } from '../QuotesSection'
import CourseContactsEditor from '@/components/CourseContactsEditor'
import { parseContacts, primaryContactEmail, ccEmailOptions } from '@/lib/contacts'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import { courseDisplayName, courseShortName, computeBlocks } from '@/lib/courses'
import { courseCapabilityCategories, courseSector } from '@/lib/capabilities'
import { moduleAudience, type LibraryAudience } from '@/lib/library'
import LibraryPicker, { type PickerItem } from '../LibraryPicker'
import SuggestedContent from '../SuggestedContent'
import TemplatePicker, { type TemplateOption } from '../TemplatePicker'
import RemovableRow from '../RemovableRow'
import { CourseTabs, TabPanel } from '../CourseTabs'
import CourseGear from '../CourseGear'
import { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import { type Schedule } from '@/app/admin/schedules/ScheduleEditor'
import CourseSchedule from '@/app/admin/courses/CourseSchedule'
import CourseMapsSection, { type CourseMap } from '../CourseMapsSection'
import RegionSelect from '@/components/RegionSelect'

const STATUS_STYLES: Record<string, string> = {
  tentative: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  quoted: 'bg-blue-900/40 text-blue-300 border-blue-700',
  confirmed: 'bg-teal-900/40 text-teal-300 border-teal-700',
  completed: 'bg-zinc-700 text-zinc-300 border-zinc-600',
  cancelled: 'bg-red-900/40 text-red-300 border-red-700',
}

const AUDIENCE_STYLES: Record<string, string> = {
  both:       'text-zinc-400',
  student:    'text-blue-400',
  instructor: 'text-teal-400',
}

const ITEM_ICON: Record<string, string> = {
  video: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.361a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  doc:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  link:  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

type LibItem = {
  id: string
  title: string
  url: string | null
  kind: string
  audience: LibraryAudience
  disciplines: string[]
  topics: string[]
  venue_id: string | null
}

export default async function CourseInstancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: inst }, { data: offDays }, { data: modules }, { data: assigned }, { data: allInstructors }] = await Promise.all([
    admin.from('course_instances').select('*, ref_number, slug').eq('id', id).single(),
    admin.from('instance_off_days').select('id, off_date, end_date').eq('instance_id', id).order('off_date'),
    admin.from('course_modules').select('id, title, audience, order, course_items(id, title, type, url, description, order, audience, library_item_id, library_items(id, title, url, kind, audience, disciplines, topics, venue_id))').eq('instance_id', id).order('order'),
    admin.from('instance_instructors').select('instructor_id, role, instructors(name, profile_id)').eq('instance_id', id),
    admin.from('instructors').select('id, name, email, instructor_role, sectors, instructor_capabilities(category, role)').eq('active', true).order('name'),
  ])

  if (!inst) notFound()

  const contacts = parseContacts(inst.contacts)

  // One parallel round for everything section-shaped (all keyed by id only).
  const [
    { data: enrollmentRows },
    { count: expenseCount },
    tasks,
    { data: peopleRows },
    { data: adminRows },
    { data: estimateRows },
    { data: pricingRateRows },
    { data: quoteRows },
    { data: estimateSourceRows },
    { data: templateRows },
    { data: interestInviteRows },
    { data: courseDocRows },
    { data: taskDocRows },
    { data: galleryImageRows },
    { data: estimateReviewRows },
    { data: courseMapRows },
    { data: venueRows },
  ] = await Promise.all([
    admin.from('enrollments').select('id, enrolled_at, profiles(first_name, last_name, email)').eq('instance_id', id).order('enrolled_at'),
    admin.from('expense_items').select('id', { count: 'exact', head: true }).eq('instance_id', id),
    loadTasksWithDocs(admin, id),
    admin.from('profiles').select('id, first_name, last_name, email, role').in('role', ['admin', 'instructor']).order('first_name'),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'admin').order('first_name'),
    admin.from('course_estimates').select('id, title, margin, created_at, estimate_items(label, qty, rate, notes, qty_factors, rate_id, sort_order)').eq('instance_id', id).order('created_at'),
    admin.from('pricing_rates').select('id, label, unit, rate, default_line').eq('active', true).order('sort_order'),
    admin.from('course_quotes').select('id, accept_token, prepared_by, prepared_by_name, quote_seq, status, issue_date, valid_until, total, options, unit_rate_note, scope_bullets, course_blurb, sent_at, accepted_at, accepted_name').eq('instance_id', id).order('quote_seq', { ascending: false }),
    // Copy-picker sources: the recent pool for browsing, plus same-type and
    // same-client courses from any age — relevance shouldn't fall off the
    // recency cap as the course list grows.
    (async () => {
      const sel = 'id, ref_number, course_type, custom_title, client_name, starts_at, course_estimates(id, title, margin, created_at, estimate_items(qty, rate))'
      const sourceQuery = () =>
        admin.from('course_instances').select(sel).neq('id', id).order('starts_at', { ascending: false, nullsFirst: false })
      const client = ((inst.client_name as string | null) ?? '').trim()
      const [recent, sameType, sameClient] = await Promise.all([
        sourceQuery().limit(60),
        inst.course_type !== 'custom' ? sourceQuery().eq('course_type', inst.course_type).limit(40) : { data: [] },
        client ? sourceQuery().ilike('client_name', `%${client}%`).limit(40) : { data: [] },
      ])
      const seen = new Set<string>()
      const rows = [...(recent.data ?? []), ...(sameType.data ?? []), ...(sameClient.data ?? [])]
        .filter((r) => !seen.has(r.id) && Boolean(seen.add(r.id)))
        .sort((a, b) => ((b.starts_at as string | null) ?? '').localeCompare((a.starts_at as string | null) ?? ''))
      return { data: rows }
    })(),
    admin.from('course_task_templates').select('id, title, default_line, sort_order').eq('active', true).order('sort_order'),
    admin.from('course_interest_invites').select('id, instructor_id, sent_at, responded_at, interested, note').eq('instance_id', id).order('created_at'),
    admin.from('course_documents').select('id, path, filename, url, created_at').eq('instance_id', id),
    admin.from('course_task_documents').select('id, path, filename, url, created_at, course_tasks!inner(title, instance_id)').eq('course_tasks.instance_id', id),
    admin.from('gallery_images').select('url, caption, categories').order('created_at', { ascending: false }),
    admin.from('estimate_reviews').select('id, created_at, requested_by, reviewer_id, note, responded_at, approved, response_note').eq('instance_id', id).order('created_at', { ascending: false }).limit(8),
    admin.from('course_maps').select('id, url, label, audience, library_item_id, library_items(title, url, audience)').eq('instance_id', id).order('sort_order'),
    admin.from('venues').select('id, name').eq('active', true).order('name'),
  ])

  // Quote-hero photo pool: the curated static shots plus every gallery upload,
  // each carrying the category tags the picker filters by.
  const heroChoices = [
    ...HERO_CHOICES,
    ...(galleryImageRows ?? [])
      .filter((g) => !HERO_CHOICES.some((c) => c.value === g.url))
      .map((g) => ({ value: g.url, label: g.caption || 'Gallery photo', categories: g.categories ?? [] })),
  ]

  // A course map is either a library item (title and link come from there, so
  // fixing the library fixes every course using it) or a link pasted here.
  const courseMaps: CourseMap[] = (courseMapRows ?? []).map((r) => {
    const item = r.library_items as unknown as { title: string; url: string | null; audience: string } | null
    return {
      id: r.id,
      label: item?.title ?? r.label ?? 'Map',
      url: item?.url ?? r.url,
      audience: r.audience as LibraryAudience,
      fromLibrary: Boolean(r.library_item_id),
      libraryLocked: item?.audience === 'internal',
    }
  })

  // One "Files" view across every attachment on the course: general uploads,
  // external links, task documents, and expense receipts — uploads signed
  // per-bucket in two calls, links used as-is.
  const docRows = [...(courseDocRows ?? []), ...(taskDocRows ?? [])]
  const docPaths = docRows.map((r) => r.path).filter((p): p is string => Boolean(p))
  const { data: signedDocs } = docPaths.length
    ? await admin.storage.from('task-documents').createSignedUrls(docPaths, 3600)
    : { data: [] }
  const fileUrl = new Map((signedDocs ?? []).map((s) => [s.path, s.signedUrl]))
  const courseFiles: (CourseFile & { created_at: string })[] = [
    ...(courseDocRows ?? []).map((r) => ({
      id: r.id,
      filename: r.filename ?? 'document',
      url: r.url ?? (r.path ? fileUrl.get(r.path) : undefined) ?? '#',
      source: 'course' as const,
      label: null,
      isLink: Boolean(r.url),
      created_at: r.created_at,
    })),
    ...(taskDocRows ?? []).map((r) => ({
      id: r.id,
      filename: r.filename ?? 'document',
      url: r.url ?? (r.path ? fileUrl.get(r.path) : undefined) ?? '#',
      source: 'task' as const,
      label: (r.course_tasks as unknown as { title: string } | null)?.title ?? null,
      isLink: Boolean(r.url),
      created_at: r.created_at,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))

  const enrollments = enrollmentRows ?? []
  const staffedProfileIds = new Set(
    (assigned ?? [])
      .map((a) => (a.instructors as unknown as { profile_id: string | null } | null)?.profile_id)
      .filter(Boolean)
  )
  const taskPeople: TaskPerson[] = (peopleRows ?? [])
    .map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' '),
      onCourse: p.role === 'admin' || staffedProfileIds.has(p.id),
    }))
    .filter((p) => p.name)
  // Quotes are only ever issued by admins.
  const quotePeople = (adminRows ?? [])
    .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' '), email: p.email ?? null }))
    .filter((p) => p.name)
  const pricingRates: PricingRate[] = (pricingRateRows ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))
  const quotes: QuoteRow[] = (quoteRows ?? []).map((q) => ({ ...q, total: Number(q.total) }))
  // Copy-picker sources: each course's COAs with their quote prices, plus the
  // relevance flags the picker groups by (same type first, then same client).
  type SourceEstimate = { id: string; title: string; margin: number; created_at: string; estimate_items: { qty: number; rate: number }[] }
  const currentClient = ((inst.client_name as string | null) ?? '').trim().toLowerCase()
  const copySources: CopySource[] = (estimateSourceRows ?? [])
    .map((s) => ({
      id: s.id,
      name: courseShortName(s.course_type, s.custom_title),
      typeKey: s.course_type,
      typeLabel: s.course_type === 'custom' ? 'Custom' : courseShortName(s.course_type, null),
      client: s.client_name?.trim() || null,
      month: s.starts_at
        ? new Date(s.starts_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : null,
      sameType: s.course_type === inst.course_type && s.course_type !== 'custom',
      sameClient: Boolean(currentClient) && (s.client_name ?? '').trim().toLowerCase() === currentClient,
      coas: ((s.course_estimates ?? []) as SourceEstimate[])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({
          id: e.id,
          title: e.title,
          price: Math.round(
            (e.estimate_items ?? []).reduce((t, i) => t + Number(i.qty) * Number(i.rate), 0) * (1 + Number(e.margin))
          ),
        })),
    }))
    .filter((s) => s.coas.length > 0)

  type EstimateItemRow = { label: string; qty: number; rate: number; notes: string | null; qty_factors: unknown; rate_id: string | null; sort_order: number }
  const normalizeFactors = (qf: unknown): { f: number[]; l: (string | null)[] } | null => {
    if (Array.isArray(qf)) return { f: qf.map(Number), l: [] }
    if (qf && typeof qf === 'object' && Array.isArray((qf as { f?: unknown }).f)) {
      const o = qf as { f: number[]; l?: (string | null)[] }
      return { f: o.f.map(Number), l: o.l ?? [] }
    }
    return null
  }
  let estimatePanels = (estimateRows ?? []).map((e) => ({
    id: e.id as string | null,
    title: e.title as string,
    margin: Number(e.margin),
    items: ((e.estimate_items ?? []) as EstimateItemRow[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        label: i.label,
        qty: Number(i.qty),
        rate: Number(i.rate),
        notes: i.notes,
        factors: normalizeFactors(i.qty_factors)?.f ?? null,
        factor_labels: normalizeFactors(i.qty_factors)?.l ?? null,
        rate_id: i.rate_id,
      })),
  }))

  const estimateReviews = (estimateReviewRows ?? []) as EstimateReviewRow[]
  const reviewAdmins = (adminRows ?? []).map((a) => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || 'Admin',
  }))

  const instructorCount = Math.max((assigned ?? []).length, 1)
  const courseDays =
    inst.starts_at && inst.ends_at
      ? Math.max(Math.round((Date.parse(inst.ends_at) - Date.parse(inst.starts_at)) / 86_400_000) + 1, 1)
      : null
  const estimateCounts = { instructors: instructorCount, students: (inst.max_students as number | null) ?? null, days: courseDays }

  // No estimates yet: show a virtual first COA pre-populated with the
  // always-recurring lines, quantities guessed from the course (nothing
  // saves until touched).
  if (estimatePanels.length === 0) {
    const seedCounts = { instructors: instructorCount, days: courseDays ?? 1, students: (inst.max_students as number | null) ?? null }
    estimatePanels = [{
      id: null,
      title: 'COA 1',
      margin: 0.25,
      items: (pricingRateRows ?? [])
        .filter((r) => r.default_line)
        .map((r) => {
          const guess = guessSeedQty(r, seedCounts)
          return { label: r.label, qty: guess.qty, rate: Number(r.rate), notes: null, factors: guess.factors, factor_labels: null, rate_id: r.id as string }
        }),
    }]
  }

  // COAs that exist in the DB — the virtual first COA (id null) can't be
  // duplicated until it's been touched and saved.
  const persistedCoas = estimatePanels.filter((e) => e.id !== null)

  const courseType = inst.course_type

  // Find which capability categories cover this course type (custom courses
  // use their admin-tagged categories)
  const matchingCategories: string[] = courseCapabilityCategories(courseType, inst.custom_categories)

  // Course shapes available here: this offering's first, then the rest.
  const { data: tplRows } = await createAdminClient()
    .from('course_templates')
    .select('id, name, description, course_type, is_default, course_template_sections(id, course_template_items(id))')
    .eq('active', true)
    .order('name')
  const templates: TemplateOption[] = ((tplRows ?? []) as unknown as {
    id: string; name: string; description: string | null; course_type: string | null; is_default: boolean
    course_template_sections: { id: string; course_template_items: { id: string }[] }[]
  }[])
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      sections: t.course_template_sections.length,
      items: t.course_template_sections.reduce((n, s) => n + s.course_template_items.length, 0),
      isDefault: t.course_type === courseType,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))

  // Section names already in use, so the same section isn't retyped three
  // slightly different ways across courses.
  const knownSectionNames = [...new Set(
    ((await createAdminClient().from('course_modules').select('title')).data ?? []).map((m) => m.title as string)
  )].sort((a, b) => a.localeCompare(b))

  // Gear: this course's lists, the catalog they draw on, and any saved
  // templates for this offering.
  const gearAdmin = createAdminClient()
  const [{ data: gearListRows }, { data: gearCatalog }, { data: gearTemplateRows }] = await Promise.all([
    gearAdmin.from('gear_lists')
      .select('id, name, audience, intro, instance_id, is_template, gear_list_entries(id, gear_item_id, name, info, recommended, url, section, group_type, quantity, sort_order, gear_entry_options(gear_item_id, sort_order))')
      .eq('instance_id', id),
    gearAdmin.from('gear_items').select('id, name, brand, info, recommended, url, category, parent_id, aliases').eq('active', true).order('name'),
    gearAdmin.from('gear_lists')
      .select('id, name, description, audience, course_type, gear_list_entries(id)')
      .eq('is_template', true),
  ])
  const gearLists = (gearListRows ?? []) as unknown as GearList[]
  const gearTemplates = ((gearTemplateRows ?? []) as unknown as {
    id: string; name: string; description: string | null; audience: string; course_type: string | null; gear_list_entries: unknown[]
  }[])
    .sort((a, b) => Number(b.course_type === courseType) - Number(a.course_type === courseType))
    .map((t) => ({
      id: t.id, name: t.name, description: t.description,
      audience: t.audience, entries: t.gear_list_entries.length,
    }))

  // Schedule: this course's running order and any templates for this offering.
  const [{ data: scheduleRows }, { data: scheduleTemplateRows }] = await Promise.all([
    gearAdmin.from('course_schedules')
      .select('id, name, overview, objectives, instance_id, is_template, schedule_days(id, title, location, notes, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
      .eq('instance_id', id)
      .limit(1),
    gearAdmin.from('course_schedules')
      .select('id, name, description, course_type, schedule_days(id)')
      .eq('is_template', true),
  ])
  const schedule = ((scheduleRows ?? []) as unknown as Schedule[])[0] ?? null
  const scheduleTemplates = ((scheduleTemplateRows ?? []) as unknown as {
    id: string; name: string; description: string | null; course_type: string | null; schedule_days: unknown[]
  }[])
    .sort((a, b) => Number(b.course_type === courseType) - Number(a.course_type === courseType))
    .map((t) => ({ id: t.id, name: t.name, description: t.description, days: t.schedule_days.length }))

  const updateLogisticsWithId = updateCourseLogistics.bind(null, id)

  // Instructor-only sections sit at the top for staff — that's where they were
  // in Classroom, and it's what you want to see first when you open a course
  // you're running. Students never see them, so their view is unaffected.
  const orderedModules = [...(modules ?? [])].sort((a, b) => {
    const ai = moduleAudience(a.audience) === 'internal' ? 0 : 1
    const bi = moduleAudience(b.audience) === 'internal' ? 0 : 1
    return ai - bi || (a.order as number) - (b.order as number)
  })

  const assignedIds = new Set((assigned ?? []).map(a => a.instructor_id))
  const unassigned = (allInstructors ?? []).filter(i => !assignedIds.has(i.id))
  // Staffing needs both: the skill, and clearance to work this client type.
  // Someone signed off in Swift Water can run a military water course only if
  // they're cleared for military work.
  const sector = courseSector(inst.course_category)
  const clearedForSector = (i: { sectors?: string[] | null }) =>
    (i.sectors ?? []).length === 0 || (i.sectors ?? []).includes(sector)
  const hasSkill = (i: { instructor_capabilities: unknown }) =>
    (i.instructor_capabilities as { category: string; role: string }[]).some(c => matchingCategories.includes(c.category))
  const qualified = unassigned.filter(i => hasSkill(i) && clearedForSector(i))

  const instructorById = new Map((allInstructors ?? []).map(i => [i.id, i]))
  const interestCandidates = unassigned.map(i => {
    const caps = i.instructor_capabilities as { category: string; role: string }[]
    return {
      id: i.id,
      name: i.name,
      hasEmail: Boolean(i.email),
      qualified: caps.some(c => matchingCategories.includes(c.category)) && clearedForSector(i),
      leadQualified: caps.some(c => matchingCategories.includes(c.category) && c.role === 'lead') && clearedForSector(i),
    }
  })
  const interestInvites = (interestInviteRows ?? []).map(r => ({
    id: r.id,
    instructorId: r.instructor_id,
    name: instructorById.get(r.instructor_id)?.name ?? 'Former instructor',
    sentAt: r.sent_at,
    respondedAt: r.responded_at,
    interested: r.interested,
    note: r.note,
    assigned: assignedIds.has(r.instructor_id),
  }))

  const updateDetailsWithId = updateInstanceDetails.bind(null, id)
  const updateDatesWithId = updateInstanceDates.bind(null, id)
  const addModuleWithId = addModule.bind(null, id)
  const addOffDayWithId = addOffDay.bind(null, id)

  const blocks = inst.starts_at && inst.ends_at
    ? computeBlocks(inst.starts_at, inst.ends_at, offDays ?? [])
    : []

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/courses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Courses</Link>

        <div className="flex items-start gap-3 mb-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide mt-1 ${STATUS_STYLES[inst.status] ?? ''}`}>
            {inst.status}
          </span>
          <h1 className="text-2xl font-bold">{courseDisplayName(inst.course_type, inst.custom_title)}</h1>
        </div>
        <div className="flex items-center gap-3 mb-8 text-xs text-zinc-500 font-mono">
          <span>PR-{String(inst.ref_number).padStart(4, '0')}</span>
          {inst.slug && <span className="text-zinc-700">·</span>}
          {inst.slug && <span className="text-zinc-600">{inst.slug}</span>}
        </div>

        {/* ── Details ─────────────────────────────────────────────── */}
        <CourseTabs
          storageKey={`course-tab:${id}`}
          tabs={[
            { id: 'details', label: 'Details' },
            { id: 'instructors', label: 'Staffing' },
            { id: 'gear', label: 'Gear' },
            { id: 'estimates', label: 'Pricing' },
            { id: 'content', label: 'Curriculum' },
            { id: 'schedule', label: 'Schedule' },
            { id: 'participants', label: 'Students' },
          ]}
        >

        <TabPanel id="details">
          <h2 className="text-lg font-semibold mb-4">Details</h2>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800">
          <AutoSaveForm action={updateDetailsWithId} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
            <CourseTypeSelect
              defaultCategory={inst.course_category}
              defaultType={inst.course_type}
              defaultCustomTitle={inst.custom_title ?? ''}
              defaultCustomCategories={inst.custom_categories ?? []}
            />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Status</label>
              <select name="status" defaultValue={inst.status} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
                <option value="tentative">Tentative</option>
                <option value="quoted">Quoted</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Location</label>
              <input name="location" defaultValue={inst.location ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Venue</label>
              <select name="venue_id" defaultValue={inst.venue_id ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
                <option value="">— none —</option>
                {(venueRows ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <p className="text-xs text-zinc-500 mt-1">Pulls in this venue&rsquo;s maps, permits and rescue plans.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">State / country</label>
              <RegionSelect name="region" defaultValue={inst.region} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
              <p className="text-xs text-zinc-500 mt-1">Used to suggest maps for this course.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Client / organization</label>
              <input name="client_name" defaultValue={inst.client_name ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <CourseContactsEditor initial={contacts} />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Max students</label>
              <input name="max_students" type="number" min="1" defaultValue={inst.max_students ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Instructor slots</label>
              <input name="instructor_slots" type="number" min="1" defaultValue={inst.instructor_slots ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              {/* field-sizing auto-grows with content; rows is the fallback for
                  browsers without it (sized to the saved note), drag always works. */}
              <textarea
                name="notes"
                rows={Math.min(Math.max((inst.notes ?? '').split('\n').length, 2), 12)}
                defaultValue={inst.notes ?? ''}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-y [field-sizing:content] min-h-14 max-h-80"
              />
            </div>
          </AutoSaveForm>

          <CourseMapsSection instanceId={id} maps={courseMaps} />

          <h3 className="text-sm font-semibold text-zinc-400 mt-6 mb-2">Dates</h3>

          {/* Overall window — auto-saved */}
          <AutoSaveForm action={updateDatesWithId} className="grid grid-cols-2 gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg mb-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Course start</label>
              <input name="starts_at" type="date" defaultValue={inst.starts_at ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Course end</label>
              <input name="ends_at" type="date" defaultValue={inst.ends_at ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
          </AutoSaveForm>

          {/* Off days — folded behind a deliberate reveal: most courses run
              straight through, and an exposed date form here invites people
              to mistake it for the course dates. */}
          <details open={(offDays ?? []).length > 0} className="mb-4 group/off">
            <summary className="cursor-pointer list-none text-sm text-zinc-400 hover:text-zinc-200 transition-colors select-none">
              <span className="text-zinc-600 text-xs mr-1.5 inline-block transition-transform group-open/off:rotate-90">▶</span>
              Dates to exclude
            </summary>
            <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-3">
              Rest days or pauses inside the course window — not the course start/end.
            </p>
            {(offDays ?? []).length > 0 && (
              <div className="space-y-2 mb-3">
                {(offDays ?? []).map(o => {
                  const removeOffDayWithArgs = removeOffDay.bind(null, id, o.id)
                  const isRange = o.end_date && o.end_date !== o.off_date
                  return (
                    <div key={o.id} className="flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 font-medium">{isRange ? 'Range' : 'Day'}</span>
                        <span className="text-sm">
                          {isRange ? `${fmt(o.off_date)} → ${fmt(o.end_date!)}` : fmt(o.off_date)}
                        </span>
                      </div>
                      <form action={removeOffDayWithArgs}>
                        <button type="submit" className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Remove</button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}
            <form action={addOffDayWithId} className="flex gap-2 flex-wrap items-end p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Start date</label>
                <input name="off_date" type="date" required className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">End date <span className="text-zinc-600">(optional)</span></label>
                <input name="end_date" type="date" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                Add
              </button>
            </form>
            </div>
          </details>

          {/* Computed blocks preview — only when off-days split the course; a
              single block just repeats the start/end dates above */}
          {blocks.length > 1 && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-xs text-zinc-500 mb-2">Calendar blocks ({blocks.length})</p>
              <div className="space-y-1">
                {blocks.map((b, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-zinc-500 text-xs mr-2">Block {i + 1}</span>
                    <span className="font-medium">{fmt(b.starts_at)}</span>
                    {b.starts_at !== b.ends_at && <span className="text-zinc-400"> → {fmt(b.ends_at)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <CourseFilesSection instanceId={id} files={courseFiles} />
          </div>
        </TabPanel>


        {/* ── Instructors ──────────────────────────────────────────── */}
        <TabPanel id="instructors">
          <h2 className="text-lg font-semibold mb-4">Instructors</h2>

          {(assigned ?? []).length > 0 && (
            <div className="mb-4 space-y-2">
              {(assigned ?? []).map(a => {
                const instr = a.instructors as unknown as { name: string } | null
                const name = instr?.name ?? a.instructor_id
                const removeWithArgs = removeInstructor.bind(null, id, a.instructor_id)
                return (
                  <div key={a.instructor_id} className="flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <div>
                      <span className="font-medium text-sm">{name}</span>
                      <span className={`ml-3 text-xs font-medium ${a.role === 'lead' ? 'text-teal-400' : 'text-blue-400'}`}>{a.role}</span>
                    </div>
                    <form action={removeWithArgs}>
                      <button type="submit" className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}

          <InstructorAssign
            instanceId={id}
            qualified={qualified}
            unassigned={unassigned}
            hasLead={(assigned ?? []).some(a => a.role === 'lead')}
          />

          <GuestInstructorButton
            instanceId={id}
            hasLead={(assigned ?? []).some(a => a.role === 'lead')}
          />

          <StaffingInterest
            instanceId={id}
            candidates={interestCandidates}
            invites={interestInvites}
            hasLead={(assigned ?? []).some(a => a.role === 'lead')}
          />

          <div className="mt-10 pt-8 border-t border-zinc-800">
            <h2 className="text-lg font-semibold mb-4">Tasks</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Assignees are emailed and see these on their portal home.
            </p>
            <CourseTasksPanel
              instanceId={id}
              tasks={tasks}
              people={taskPeople}
              canManage
              currentUserId={user.id}
              suggestions={templateRows ?? []}
              completedOpen
            />
          </div>
        </TabPanel>

        {/* ── Participants: shared logistics + the student roster ───── */}
        <TabPanel id="participants">
          <h2 className="text-lg font-semibold mb-4">Participant info
            {!inst.meeting_point && !inst.meeting_time && (
              <span className="ml-3 text-[11px] font-normal px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300 align-middle">
                not set yet
              </span>
            )}
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Shown to everyone on the course.
          </p>
          <AutoSaveForm action={updateLogisticsWithId} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Welcome / what to expect</label>
              <textarea
                name="intro"
                rows={3}
                defaultValue={inst.intro ?? ''}
                placeholder="Short intro to the course — what they'll cover, how it runs, anything to know before arriving."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Meeting point</label>
              <input
                name="meeting_point"
                defaultValue={inst.meeting_point ?? ''}
                placeholder="e.g. Garfield Ledges trailhead, lower lot"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Day one meeting time</label>
              <input
                name="meeting_time"
                defaultValue={inst.meeting_time ?? ''}
                placeholder="e.g. 0700, ready to walk"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Schedule / running order</label>
              <textarea
                name="schedule"
                rows={4}
                defaultValue={inst.schedule ?? ''}
                placeholder={'Day 1 — travel, gear check\nDay 2 — anchors and rappels\n…'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-zinc-500"
              />
            </div>
          </AutoSaveForm>

          <div className="mt-10 pt-8 border-t border-zinc-800">
            <h2 className="text-lg font-semibold mb-4">Students
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {enrollments.length}{inst.max_students ? ` / ${inst.max_students}` : ''} enrolled
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Share the invite link below — students enroll themselves.
            </p>

            {enrollments.length > 0 && (
              <div className="mb-4 space-y-2">
                {enrollments.map(e => {
                  const p = e.profiles as unknown as { first_name: string | null; last_name: string | null; email: string | null } | null
                  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unnamed'
                  const removeWithArgs = removeEnrollment.bind(null, id, e.id)
                  return (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <div>
                        <span className="font-medium text-sm">{name}</span>
                        {p?.email && <span className="ml-3 text-xs text-zinc-500">{p.email}</span>}
                      </div>
                      <form action={removeWithArgs}>
                        <button type="submit" className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}

            <StudentInvitePanel
              instanceId={id}
              inviteUrl={inst.invite_token ? `${process.env.NEXT_PUBLIC_SITE_URL}/join/${inst.invite_token}` : null}
              expiresAt={inst.invite_expires_at ?? null}
              expired={!!inst.invite_expires_at && new Date(inst.invite_expires_at) < new Date()}
            />
          </div>
        </TabPanel>

        <TabPanel id="schedule">
          <h2 className="text-lg font-semibold mb-1">Schedule</h2>
          <p className="text-xs text-zinc-500 mb-4">
            The running order participants see. Days carry their own location and notes; topics can hold sub-topics, and
            times are optional.
          </p>
          <CourseSchedule
            instanceId={id}
            courseType={courseType}
            courseDays={Math.min(courseDays ?? 0, 30)}
            schedule={schedule}
            templates={scheduleTemplates}
          />
        </TabPanel>

        {/* ── Content modules ──────────────────────────────────────── */}
        <TabPanel id="gear">
          <h2 className="text-lg font-semibold mb-1">Gear</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Built from the gear catalog and shown on the course — no separate document to write and link.
          </p>
          <CourseGear
            instanceId={id}
            courseType={courseType}
            lists={gearLists}
            templates={gearTemplates}
            catalog={(gearCatalog ?? []) as GearItem[]}
          />
        </TabPanel>

        <TabPanel id="content">
          <h2 className="text-lg font-semibold mb-4">Curriculum</h2>

          <TemplatePicker instanceId={id} templates={templates} />

          <SuggestedContent
            instanceId={id}
            courseDisciplines={matchingCategories}
            existingItemIds={(modules ?? []).flatMap(m =>
              (m.course_items ?? []).map(ci => ci.library_item_id).filter((x): x is string => Boolean(x))
            )}
          />

          <div className="space-y-6 mb-6">
            {orderedModules.map(mod => {
              const items = (mod.course_items ?? []).slice().sort((a, b) => a.order - b.order)
              const deleteModWithArgs = deleteModule.bind(null, id, mod.id)
              const addItemWithArgs = addItem.bind(null, id, mod.id)

              return (
                <div key={mod.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{mod.title}</span>
                      <span className={`text-xs ${AUDIENCE_STYLES[mod.audience]}`}>
                        {moduleAudience(mod.audience) === 'internal' ? 'instructors only' : 'students & instructors'}
                      </span>
                    </div>
                    <form action={deleteModWithArgs}>
                      <button type="submit" className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Delete section</button>
                    </form>
                  </div>

                  {items.map(item => {
                    // Library-backed rows take their title/link from the library
                    // entry, so an edit there reaches every course at once.
                    // Supabase types the embedded row as an array; it's a
                    // single FK join, so take the first (or null).
                    const libRaw = item.library_items as unknown
                    const lib: LibItem | null = Array.isArray(libRaw) ? (libRaw[0] ?? null) : (libRaw as LibItem | null)
                    const title = lib?.title ?? item.title
                    const url = lib?.url ?? item.url
                    const effective = item.audience ?? lib?.audience ?? 'shared'
                    const heldBack = moduleAudience(mod.audience) === 'shared' && effective === 'internal'
                    return (
                      <div key={item.id} className="flex items-start justify-between px-4 py-3 border-b border-zinc-800/60 last:border-0">
                        <div className="flex items-start gap-3 min-w-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-zinc-500">
                            <path d={ITEM_ICON[(item.type ?? 'link') as keyof typeof ITEM_ICON]} />
                          </svg>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {url
                                ? <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-pr-red-light transition-colors">{title}</a>
                                : <span className="text-sm font-medium">{title}</span>}
                              {lib && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">library</span>}
                              {heldBack && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">instructors only</span>
                              )}
                            </div>
                            {item.description && <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>}
                          </div>
                        </div>
                        <RemovableRow
                          onRemove={async () => { 'use server'; await deleteItem(id, item.id) }}
                          label="×"
                          className="ml-4 shrink-0"
                        />
                      </div>
                    )
                  })}

                  <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800/60">
                    <LibraryPicker
                      instanceId={id}
                      moduleId={mod.id}
                      moduleAudience={moduleAudience(mod.audience)}
                      courseDisciplines={matchingCategories}
                    />
                  </div>

                  <form action={addItemWithArgs} className="flex flex-col sm:flex-row gap-2 px-4 py-3 bg-zinc-950/50">
                    <input name="title" required placeholder="Item title" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500" />
                    <select name="type" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500">
                      <option value="doc">Doc</option>
                      <option value="video">Video</option>
                      <option value="link">Link</option>
                    </select>
                    <input name="url" required placeholder="https://…" className="flex-[2] bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500" />
                    <input name="description" placeholder="Description (optional)" className="flex-[2] bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500" />
                    <button type="submit" className="px-3 py-1.5 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors whitespace-nowrap">Add</button>
                  </form>
                </div>
              )
            })}
          </div>

          {(modules ?? []).length === 0 && (
            <p className="text-sm text-zinc-500 mb-3">
              Add a section below, then pull items into it from the{' '}
              <Link href="/admin/library" className="underline hover:text-zinc-300">content library</Link>.
            </p>
          )}

          <form action={addModuleWithId} className="flex gap-2 flex-wrap items-end p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">New section title</label>
              <input
                name="title"
                required
                list="section-name-suggestions"
                autoComplete="off"
                placeholder="e.g. Anchor Station Rigging"
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 w-64"
              />
              <datalist id="section-name-suggestions">
                {knownSectionNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Visible to</label>
              <select name="audience" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
                <option value="both">Students &amp; instructors</option>
                <option value="instructor">Instructors only</option>
              </select>
            </div>
            <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Add section</button>
          </form>
        </TabPanel>

        <TabPanel id="estimates">
          <h2 className="text-lg font-semibold mb-4">Estimates</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Internal — never shown to instructors or clients.
          </p>
          <EstimateReviewBanner reviews={estimateReviews} admins={reviewAdmins} currentUserId={user.id} />
          <div className="space-y-8">
            {estimatePanels.map((e) => (
              <EstimatePanel
                key={e.id ?? `${id}-new`}
                instanceId={id}
                estimateId={e.id}
                initialTitle={e.title}
                initialMargin={e.margin}
                initialItems={e.items}
                rates={pricingRates}
                canDelete={estimatePanels.length > 1}
                solo={estimatePanels.length === 1}
                counts={estimateCounts}
              />
            ))}
          </div>
          {estimatePanels.length > 1 && <CoaComparison coas={estimatePanels} />}
          <div className="mt-4">
            <NewCoaMenu
              instanceId={id}
              coas={persistedCoas.map((e) => ({ id: e.id!, title: e.title }))}
              sources={copySources}
            />
          </div>
          <EstimateReviewRequest instanceId={id} reviews={estimateReviews} admins={reviewAdmins} currentUserId={user.id} />

          <div className="mt-10 pt-8 border-t border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">Quotes</h2>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <p className="text-xs text-zinc-500">
              Marking a quote sent or accepted moves the course to Quoted or Confirmed.
            </p>
            <QuoteHeroPicker
              instanceId={id}
              choices={heroChoices}
              currentImage={inst.hero_image ?? null}
              currentPosition={inst.hero_position ?? null}
              currentScale={inst.hero_scale ?? null}
            />
          </div>
          <QuotesSection
            instanceId={id}
            refNumber={inst.ref_number}
            quotes={quotes}
            contactEmail={primaryContactEmail(contacts)}
            ccOptions={ccEmailOptions(contacts)}
            people={quotePeople}
            estimates={estimatePanels.filter((e) => e.id).map((e) => ({ id: e.id!, title: e.title }))}
          />
          </div>
        </TabPanel>
        </CourseTabs>

        <div className="pt-4 border-t border-zinc-800">
          <Link href={`/portal/${id}`} className="text-sm text-zinc-400 hover:text-white transition-colors">
            View student/instructor portal →
          </Link>
        </div>

        <div className="mt-16 pt-8 border-t border-zinc-800 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-400">Delete course</p>
            <p className="text-xs text-zinc-600 mt-0.5">
              Removes this course instance, its schedule, materials, and enrollments. Cannot be undone.
            </p>
          </div>
          <DeleteInstanceButton
            instanceId={id}
            displayName={courseDisplayName(inst.course_type, inst.custom_title)}
            enrollmentCount={enrollments.length}
            expenseCount={expenseCount ?? 0}
          />
        </div>
      </div>
    </main>
  )
}
