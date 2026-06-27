import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInstanceDetails, updateInstanceDates, addOffDay, removeOffDay, addModule, deleteModule, addItem, deleteItem, removeInstructor } from '../actions'
import { CourseTypeSelect } from '../CourseTypeSelect'
import InstructorAssign from '../InstructorAssign'
import { courseDisplayName, computeBlocks } from '@/lib/courses'
import { CATEGORY_COURSE_TYPES } from '@/lib/capabilities'

const STATUS_STYLES: Record<string, string> = {
  tentative: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
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
    admin.from('instructors').select('id, name, instructor_role, instructor_capabilities(category, role)').eq('active', true).order('name'),
  ])

  if (!inst) notFound()

  const courseType = inst.course_type

  // Find which capability categories cover this course type
  const matchingCategories = Object.entries(CATEGORY_COURSE_TYPES)
    .filter(([, slugs]) => slugs.includes(courseType))
    .map(([cat]) => cat)

  const assignedIds = new Set((assigned ?? []).map(a => a.instructor_id))
  const unassigned = (allInstructors ?? []).filter(i => !assignedIds.has(i.id))
  const qualified = unassigned.filter(i =>
    (i.instructor_capabilities as { category: string; role: string }[]).some(c => matchingCategories.includes(c.category))
  )

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
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Details</h2>
          <form action={updateDetailsWithId} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <CourseTypeSelect
              defaultCategory={inst.course_category}
              defaultType={inst.course_type}
              defaultCustomTitle={inst.custom_title ?? ''}
            />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Status</label>
              <select name="status" defaultValue={inst.status} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
                <option value="tentative">Tentative</option>
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
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Point of contact</label>
              <input name="contact_name" defaultValue={inst.contact_name ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Contact phone</label>
              <input name="contact_phone" type="tel" defaultValue={inst.contact_phone ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Contact email</label>
              <input name="contact_email" type="email" defaultValue={inst.contact_email ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
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
            <div className="sm:col-span-2">
              <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Save details</button>
            </div>
          </form>
        </section>

        {/* ── Schedule ─────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Schedule</h2>

          {/* Overall window — saved via updateInstance */}
          <form action={updateDatesWithId} className="grid grid-cols-2 gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg mb-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Course start</label>
              <input name="starts_at" type="date" defaultValue={inst.starts_at ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Course end</label>
              <input name="ends_at" type="date" defaultValue={inst.ends_at ?? ''} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Save dates</button>
            </div>
          </form>

          {/* Off days */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">Off Days</h3>
            <p className="text-xs text-zinc-500 mb-3">Dates excluded from the schedule (holidays, travel days, etc.)</p>
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

          {/* Computed blocks preview */}
          {blocks.length > 0 && (
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
        </section>

        {/* ── Instructors ──────────────────────────────────────────── */}
        <section className="mb-10">
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
          />
        </section>

        {/* ── Content modules ──────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Content</h2>
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
        </section>

        <div className="pt-4 border-t border-zinc-800">
          <Link href={`/portal/${id}`} className="text-sm text-zinc-400 hover:text-white transition-colors">
            View student/instructor portal →
          </Link>
        </div>
      </div>
    </main>
  )
}
