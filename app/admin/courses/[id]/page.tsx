import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInstanceDetails, updateInstanceDates, addOffDay, removeOffDay, addModule, deleteModule, addItem, deleteItem, removeInstructor, removeEnrollment } from '../actions'
import { CourseTypeSelect } from '../CourseTypeSelect'
import InstructorAssign from '../InstructorAssign'
import StaffingInterest from '../StaffingInterest'
import StudentInvitePanel from '../StudentInvitePanel'
import AutoSaveForm from '@/components/AutoSaveForm'
import DeleteInstanceButton from '../DeleteInstanceButton'
import CourseTasksPanel, { type TaskPerson } from '@/components/CourseTasksPanel'
import EstimatePanel, { type PricingRate } from '@/components/EstimatePanel'
import { createEstimateCoa, copyEstimatesFrom } from '../finance-actions'
import QuotesSection, { type QuoteRow } from '../QuotesSection'
import CourseContactsEditor from '@/components/CourseContactsEditor'
import { parseContacts, primaryContactEmail, ccEmailOptions } from '@/lib/contacts'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import { courseDisplayName, courseShortName, computeBlocks } from '@/lib/courses'
import { courseCapabilityCategories } from '@/lib/capabilities'

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
    admin.from('course_modules').select('id, title, audience, order, course_items(id, title, type, url, description, order)').eq('instance_id', id).order('order'),
    admin.from('instance_instructors').select('instructor_id, role, instructors(name)').eq('instance_id', id),
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
  ] = await Promise.all([
    admin.from('enrollments').select('id, enrolled_at, profiles(first_name, last_name, email)').eq('instance_id', id).order('enrolled_at'),
    admin.from('expense_items').select('id', { count: 'exact', head: true }).eq('instance_id', id),
    loadTasksWithDocs(admin, id),
    admin.from('profiles').select('id, first_name, last_name, email').in('role', ['admin', 'instructor']).order('first_name'),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'admin').order('first_name'),
    admin.from('course_estimates').select('id, title, margin, created_at, estimate_items(label, qty, rate, notes, qty_factors, sort_order)').eq('instance_id', id).order('created_at'),
    admin.from('pricing_rates').select('id, label, unit, rate, default_line').eq('active', true).order('sort_order'),
    admin.from('course_quotes').select('id, accept_token, prepared_by, prepared_by_name, quote_seq, status, issue_date, valid_until, total, unit_rate_note, scope_bullets, course_blurb, sent_at, accepted_at, accepted_name').eq('instance_id', id).order('quote_seq', { ascending: false }),
    admin.from('course_instances').select('id, ref_number, course_type, custom_title, client_name, starts_at, course_estimates(count)').neq('id', id).order('starts_at', { ascending: false, nullsFirst: false }).limit(60),
    admin.from('course_task_templates').select('id, title').eq('active', true).order('sort_order'),
    admin.from('course_interest_invites').select('id, instructor_id, sent_at, responded_at, interested, note').eq('instance_id', id).order('created_at'),
  ])

  const enrollments = enrollmentRows ?? []
  const taskPeople: TaskPerson[] = (peopleRows ?? [])
    .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ') }))
    .filter((p) => p.name)
  // Quotes are only ever issued by admins.
  const quotePeople = (adminRows ?? [])
    .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' '), email: p.email ?? null }))
    .filter((p) => p.name)
  const pricingRates: PricingRate[] = (pricingRateRows ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))
  const quotes: QuoteRow[] = (quoteRows ?? []).map((q) => ({ ...q, total: Number(q.total) }))
  const copySources = (estimateSourceRows ?? []).filter(
    (s) => ((s.course_estimates as unknown as { count: number }[])?.[0]?.count ?? 0) > 0
  )

  type EstimateItemRow = { label: string; qty: number; rate: number; notes: string | null; qty_factors: unknown; sort_order: number }
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
      })),
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
    const guessQty = (label: string): { qty: number; factors: number[] | null } => {
      const days = courseDays ?? 1
      if (label === 'Instructor field day') return { qty: instructorCount * days, factors: [instructorCount, days] }
      if (label === 'Instructor travel day') return { qty: instructorCount * 2, factors: [instructorCount, 2] }
      if (label === 'Lodging') return { qty: instructorCount * days, factors: [instructorCount, days] }
      if (label === 'Permits' && inst.max_students) return { qty: inst.max_students * days, factors: [inst.max_students, days] }
      return { qty: 1, factors: null }
    }
    estimatePanels = [{
      id: null,
      title: 'COA 1',
      margin: 0.25,
      items: (pricingRateRows ?? [])
        .filter((r) => r.default_line)
        .map((r) => {
          const guess = guessQty(r.label)
          return { label: r.label, qty: guess.qty, rate: Number(r.rate), notes: null, factors: guess.factors, factor_labels: null }
        }),
    }]
  }

  const courseType = inst.course_type

  // Find which capability categories cover this course type (custom courses
  // use their admin-tagged categories)
  const matchingCategories: string[] = courseCapabilityCategories(courseType, inst.custom_categories)

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
          <AutoSaveForm action={updateDetailsWithId} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
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
              <textarea name="notes" rows={2} defaultValue={inst.notes ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 resize-none" />
            </div>
          </AutoSaveForm>
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
          <p className="text-xs text-zinc-500 mb-4">Sections visible to <span className="text-blue-400">students</span>, <span className="text-teal-400">instructors</span>, or <span className="text-zinc-400">both</span>.</p>

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
                        {mod.audience === 'both' ? 'everyone' : mod.audience + 's only'}
                      </span>
                    </div>
                    <form action={deleteModWithArgs}>
                      <button type="submit" className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Delete section</button>
                    </form>
                  </div>

                  {items.map(item => {
                    const deleteItemWithArgs = deleteItem.bind(null, id, item.id)
                    return (
                      <div key={item.id} className="flex items-start justify-between px-4 py-3 border-b border-zinc-800/60 last:border-0">
                        <div className="flex items-start gap-3 min-w-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-zinc-500">
                            <path d={ITEM_ICON[item.type]} />
                          </svg>
                          <div className="min-w-0">
                            <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-pr-red-light transition-colors">{item.title}</a>
                            {item.description && <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>}
                          </div>
                        </div>
                        <form action={deleteItemWithArgs} className="ml-4 shrink-0">
                          <button type="submit" className="text-xs text-zinc-600 hover:text-red-400 transition-colors">×</button>
                        </form>
                      </div>
                    )
                  })}

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
                <option value="both">Everyone</option>
                <option value="student">Students only</option>
                <option value="instructor">Instructors only</option>
              </select>
            </div>
            <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Add section</button>
          </form>
        </details>

        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Financials — Estimates</summary>
          <p className="text-xs text-zinc-500 mb-4">
            Internal cost build-up — never shown to instructors or clients. Add alternate COAs to price different
            ways of running the course; quotes are generated from the COA you pick.
          </p>
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
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <form action={createEstimateCoa.bind(null, id)}>
              <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors">
                + Add another COA
              </button>
            </form>
            {copySources.length > 0 && (
              <form action={copyEstimatesFrom.bind(null, id)} className="flex items-center gap-2">
                <select name="source_instance_id" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300">
                  {copySources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {courseShortName(s.course_type, s.custom_title)}
                      {s.client_name ? ` · ${s.client_name}` : ''}
                      {s.starts_at ? ` · ${s.starts_at.slice(0, 7)}` : ''}
                    </option>
                  ))}
                </select>
                <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors">
                  Copy estimate from course
                </button>
              </form>
            )}
          </div>
        </details>

        <details open className="mb-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold select-none mb-3"><span className="text-zinc-600 text-sm mr-2 inline-block transition-transform group-open:rotate-90">▶</span>Financials — Quotes</summary>
          <p className="text-xs text-zinc-500 mb-4">
            Client-facing lump sum generated from the estimate. Marking sent/accepted moves the course to
            Quoted/Confirmed automatically.
          </p>
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
