import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInstanceDetails, updateInstanceDates, addOffDay, removeOffDay, addModule, deleteModule, addItem, deleteItem, removeInstructor, removeEnrollment } from '../actions'
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
import { courseCapabilityCategories } from '@/lib/capabilities'
import { moduleAudience, type LibraryAudience } from '@/lib/library'
import LibraryPicker, { type PickerItem } from '../LibraryPicker'

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
    admin.from('instructors').select('id, name, email, instructor_role, instructor_capabilities(category, role)').eq('active', true).order('name'),
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
    { data: receiptRows },
    { data: galleryImageRows },
    { data: estimateReviewRows },
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
    admin.from('course_documents').select('id, path, filename, created_at').eq('instance_id', id),
    admin.from('course_task_documents').select('id, path, filename, created_at, course_tasks!inner(title, instance_id)').eq('course_tasks.instance_id', id),
    admin.from('expense_receipts').select('id, path, filename, created_at, expense_items!inner(category, instance_id, expense_reports(profiles(first_name, last_name)))').eq('expense_items.instance_id', id),
    admin.from('gallery_images').select('url, caption, categories').order('created_at', { ascending: false }),
    admin.from('estimate_reviews').select('id, created_at, requested_by, reviewer_id, note, responded_at, approved, response_note').eq('instance_id', id).order('created_at', { ascending: false }).limit(8),
  ])

  // Quote-hero photo pool: the curated static shots plus every gallery upload,
  // each carrying the category tags the picker filters by.
  const heroChoices = [
    ...HERO_CHOICES,
    ...(galleryImageRows ?? [])
      .filter((g) => !HERO_CHOICES.some((c) => c.value === g.url))
      .map((g) => ({ value: g.url, label: g.caption || 'Gallery photo', categories: g.categories ?? [] })),
  ]

  // One "Files" view across every attachment on the course: general uploads,
  // task documents, and expense receipts — signed per-bucket in two calls.
  const docRows = [...(courseDocRows ?? []), ...(taskDocRows ?? [])]
  const [{ data: signedDocs }, { data: signedReceipts }] = await Promise.all([
    docRows.length
      ? admin.storage.from('task-documents').createSignedUrls(docRows.map((r) => r.path), 3600)
      : Promise.resolve({ data: [] }),
    (receiptRows ?? []).length
      ? admin.storage.from('expense-receipts').createSignedUrls((receiptRows ?? []).map((r) => r.path), 3600)
      : Promise.resolve({ data: [] }),
  ])
  const fileUrl = new Map(
    [...(signedDocs ?? []), ...(signedReceipts ?? [])].map((s) => [s.path, s.signedUrl])
  )
  const courseFiles: (CourseFile & { created_at: string })[] = [
    ...(courseDocRows ?? []).map((r) => ({
      id: r.id,
      filename: r.filename ?? 'document',
      url: fileUrl.get(r.path) ?? '#',
      source: 'course' as const,
      label: null,
      created_at: r.created_at,
    })),
    ...(taskDocRows ?? []).map((r) => ({
      id: r.id,
      filename: r.filename ?? 'document',
      url: fileUrl.get(r.path) ?? '#',
      source: 'task' as const,
      label: (r.course_tasks as unknown as { title: string } | null)?.title ?? null,
      created_at: r.created_at,
    })),
    ...(receiptRows ?? []).map((r) => {
      const item = r.expense_items as unknown as {
        category: string
        expense_reports: { profiles: { first_name: string | null; last_name: string | null } | null } | null
      } | null
      const who = [item?.expense_reports?.profiles?.first_name, item?.expense_reports?.profiles?.last_name]
        .filter(Boolean)
        .join(' ')
      return {
        id: r.id,
        filename: r.filename ?? 'receipt',
        url: fileUrl.get(r.path) ?? '#',
        source: 'expense' as const,
        label: [who, item?.category?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || null,
        created_at: r.created_at,
      }
    }),
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

  // Library material offered on this course's sections. "Suggested" = same
  // discipline as the course, or attached to a venue matching its location —
  // the two things that make assembling a course mostly clicking, not typing.
  const { data: libRows } = await createAdminClient()
    .from('library_items')
    .select('id, title, url, kind, audience, disciplines, topics, venue_id, venues(name)')
    .eq('status', 'published')
    .order('title')
    .limit(1000)

  const loc = (inst.location ?? '').toLowerCase()
  const pickerItems: PickerItem[] = ((libRows ?? []) as unknown as (LibItem & { venues: { name: string } | null })[]).map((l) => {
    const venueName = l.venues?.name ?? null
    const venueMatches = Boolean(venueName && loc && (loc.includes(venueName.toLowerCase()) || venueName.toLowerCase().includes(loc)))
    return {
      id: l.id,
      title: l.title,
      url: l.url,
      kind: l.kind,
      audience: l.audience,
      disciplines: l.disciplines,
      topics: l.topics,
      venue_id: l.venue_id,
      venueName,
      suggested: venueMatches || l.disciplines.some((d) => matchingCategories.includes(d)),
    }
  })

  const assignedIds = new Set((assigned ?? []).map(a => a.instructor_id))
  const unassigned = (allInstructors ?? []).filter(i => !assignedIds.has(i.id))
  const qualified = unassigned.filter(i =>
    (i.instructor_capabilities as { category: string; role: string }[]).some(c => matchingCategories.includes(c.category))
  )

  const instructorById = new Map((allInstructors ?? []).map(i => [i.id, i]))
  const interestCandidates = unassigned.map(i => {
    const caps = i.instructor_capabilities as { category: string; role: string }[]
    return {
      id: i.id,
      name: i.name,
      hasEmail: Boolean(i.email),
      qualified: caps.some(c => matchingCategories.includes(c.category)),
      leadQualified: caps.some(c => matchingCategories.includes(c.category) && c.role === 'lead'),
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
        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Details</summary>
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
          <CourseFilesSection instanceId={id} files={courseFiles} />
          </div>
        </details>

        {/* ── Schedule ─────────────────────────────────────────────── */}
        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Schedule</summary>

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
              This course has a break in the middle (off-days)…
            </summary>
            <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-3">
              Off-days are dates <span className="text-zinc-300">excluded from within the course window</span> (a rest
              day, a mid-course pause) — not the course dates themselves, which go in Course start/end above.
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
        </details>

        {/* ── Instructors ──────────────────────────────────────────── */}
        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Instructors</summary>

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
        </details>

        {/* ── Students ─────────────────────────────────────────────── */}
        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>
            Students
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {enrollments.length}{inst.max_students ? ` / ${inst.max_students}` : ''} enrolled
            </span>
          </summary>
          <p className="text-xs text-zinc-500 mb-4">
            Portal accounts are invite-only — share this course&rsquo;s link with the client contact
            and students enroll themselves.
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
        </details>

        {/* ── Content modules ──────────────────────────────────────── */}
        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Content</summary>
          <p className="text-xs text-zinc-500 mb-4">
            Add material from the <Link href="/admin/library" className="underline hover:text-zinc-300">content library</Link> so
            it stays in sync everywhere it&rsquo;s used, or paste a one-off link. Sections are either{' '}
            <span className="text-teal-400">instructors only</span> or <span className="text-blue-400">students &amp; instructors</span>;
            an individual item can be held back to instructors inside a shared section.
          </p>

          <div className="space-y-6 mb-6">
            {(modules ?? []).map(mod => {
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
                    const deleteItemWithArgs = deleteItem.bind(null, id, item.id)
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
                        <form action={deleteItemWithArgs} className="ml-4 shrink-0">
                          <button type="submit" className="text-xs text-zinc-600 hover:text-red-400 transition-colors">×</button>
                        </form>
                      </div>
                    )
                  })}

                  <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800/60">
                    <LibraryPicker
                      instanceId={id}
                      moduleId={mod.id}
                      moduleAudience={moduleAudience(mod.audience)}
                      courseDisciplines={matchingCategories}
                      items={pickerItems}
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

          <form action={addModuleWithId} className="flex gap-2 flex-wrap items-end p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">New section title</label>
              <input name="title" required placeholder="e.g. Anchor Station Rigging" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 w-64" />
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
        </details>

        <details open id="estimates" className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Financials — Estimates</summary>
          <p className="text-xs text-zinc-500 mb-4">
            Internal cost build-up — never shown to instructors or clients. Add alternate COAs to price different
            ways of running the course; quotes are generated from the COA you pick.
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
        </details>

        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Financials — Quotes</summary>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <p className="text-xs text-zinc-500">
              Client-facing lump sum generated from the estimate. Marking sent/accepted moves the course to
              Quoted/Confirmed automatically.
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
        </details>

        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Tasks</summary>
          <p className="text-xs text-zinc-500 mb-4">
            Course prep checklist — assignees are notified by email and see their tasks on the portal home page.
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
        </details>

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
