import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  KIND_META, LIBRARY_KINDS, BUCKET_META, BUCKET_ORDER,
  TEMPLATE_SHELF_META, TEMPLATE_SHELF_ORDER, isTemplateShelf,
  type LibraryItem, type TemplateShelf, type TemplateSummary, type Venue,
} from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import { type Schedule } from '@/app/admin/schedules/ScheduleEditor'
import RegionSelect from '@/components/RegionSelect'
import LibraryRow from './LibraryRow'
import TemplateRow from './TemplateRow'
import AddTemplate from './AddTemplate'
import ReviewQueue from './ReviewQueue'
import { createLibraryItem } from './actions'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-xs text-zinc-400 mb-1'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; discipline?: string; kind?: string; audience?: string; venue?: string; bucket?: string; q?: string }>
}) {
  const { status = 'pending', discipline, kind, audience, venue, bucket, q } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Equipment lists and schedules are shelves too, but they're rows in their own
  // tables — so which of the two lists below runs depends on the shelf picked.
  // Filters that only a document can answer (type, venue, who-can-see, review
  // status) rule the template shelves out rather than showing them unfiltered.
  const docOnlyFilter = Boolean(kind || venue || audience)
  const showDocs = !isTemplateShelf(bucket)
  const showTemplates = (!bucket || isTemplateShelf(bucket)) && !docOnlyFilter
  const shelves: TemplateShelf[] = isTemplateShelf(bucket) ? [bucket] : TEMPLATE_SHELF_ORDER

  let query = admin
    .from('library_items')
    .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, venue_id, expires_at, status, bucket, region, source_class, source_topic, source_item')
    .order('created_at', { ascending: false })
    .limit(500)

  if (status !== 'all') query = query.eq('status', status)
  if (discipline) query = query.contains('disciplines', [discipline])
  if (kind) query = query.eq('kind', kind)
  if (audience) query = query.eq('audience', audience)
  if (venue) query = query.eq('venue_id', venue)
  if (bucket && !isTemplateShelf(bucket)) query = query.eq('bucket', bucket)
  if (q) query = query.ilike('title', `%${q}%`)

  // Templates take the same search box and discipline tags the documents use.
  // They have no review status, so the status tabs pass them by — there's
  // nothing to approve about a kit list you wrote yourself.
  const [{ data: itemRows }, { data: venueRows }, gearRes, scheduleRes, catalogRes] = await Promise.all([
    showDocs ? query : Promise.resolve({ data: [] }),
    admin.from('venues').select('id, name, region, client_name, notes, active').order('name'),
    showTemplates && shelves.includes('gear')
      ? (() => {
          let g = admin.from('gear_lists')
            .select('id, name, description, audience, intro, course_type, disciplines, topics, instance_id, is_template, gear_list_entries(id, gear_item_id, name, note, url, section, group_type, quantity, sort_order, gear_entry_options(gear_item_id, sort_order))')
            .eq('is_template', true)
            .order('name')
          if (q) g = g.ilike('name', `%${q}%`)
          if (discipline) g = g.contains('disciplines', [discipline])
          return g
        })()
      : Promise.resolve({ data: [] }),
    showTemplates && shelves.includes('schedule')
      ? (() => {
          let s = admin.from('course_schedules')
            .select('id, name, description, overview, objectives, course_type, disciplines, topics, instance_id, is_template, schedule_days(id, title, location, notes, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
            .eq('is_template', true)
            .order('name')
          if (q) s = s.ilike('name', `%${q}%`)
          if (discipline) s = s.contains('disciplines', [discipline])
          return s
        })()
      : Promise.resolve({ data: [] }),
    // Editing a kit list on its shelf needs the same catalog the course page
    // gives the editor, or every line loses the type it points at.
    showTemplates && shelves.includes('gear')
      ? admin.from('gear_items').select('id, name, brand, info, url, category, parent_id, aliases, disciplines').eq('active', true).order('name')
      : Promise.resolve({ data: [] }),
  ])

  const items = (itemRows ?? []) as LibraryItem[]
  const venues = (venueRows ?? []) as Venue[]

  type GearTemplate = GearList & {
    description: string | null; course_type: string | null; disciplines: string[]; topics: string[]
  }
  type ScheduleTemplate = Schedule & {
    description: string | null; course_type: string | null; disciplines: string[]; topics: string[]
  }
  const gearTemplates = (gearRes.data ?? []) as unknown as GearTemplate[]
  const scheduleTemplates = (scheduleRes.data ?? []) as unknown as ScheduleTemplate[]
  const catalog = (catalogRes.data ?? []) as unknown as GearItem[]

  const summarize = (
    t: { id: string; name: string; description: string | null; course_type: string | null; disciplines: string[]; topics: string[] },
    count: number,
    audience?: 'student' | 'instructor'
  ): TemplateSummary => ({
    id: t.id, name: t.name, description: t.description, course_type: t.course_type,
    disciplines: t.disciplines ?? [], topics: t.topics ?? [], count, audience,
  })

  const shelfCount = gearTemplates.length + scheduleTemplates.length

  // Pending grouped by source class, derived from what we already fetched
  // rather than a second scan of the table.
  const pendingByClass = new Map<string, number>()
  for (const r of items) {
    if (r.status !== 'pending') continue
    const k = r.source_class ?? 'Added in portal'
    pendingByClass.set(k, (pendingByClass.get(k) ?? 0) + 1)
  }

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status, discipline, kind, audience, venue, bucket, q, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/admin/library?${p.toString()}`
  }

  const tab = (key: string, text: string) => (
    <Link
      href={href({ status: key })}
      scroll={false}
      className={`px-3 py-1.5 rounded text-sm transition-colors ${
        status === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {text}
    </Link>
  )

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>

        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Content Library</h1>
            <p className="text-zinc-400 mt-1">
              Course material, references, maps and permits — plus the equipment lists and schedules we build here.
              Tagged once, reused everywhere.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/library/overview" className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors">
              Coverage
            </Link>
            <Link href="/admin/venues" className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors">
              Venues
            </Link>
          </div>
        </div>

        {/* ── Review queue ─────────────────────────────────────────────── */}
        {pendingByClass.size > 0 && status === 'pending' && (
          <section className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h2 className="text-sm font-semibold mb-1">What approving does</h2>
            <ul className="text-xs text-zinc-400 space-y-1 list-disc pl-4">
              <li>Approved material becomes available to add to courses. It is <em>not</em> published to anyone by
                approving it — nothing reaches students until you add it to a course.</li>
              <li>Each group below was a topic in Google Classroom, and becomes a <strong>section</strong> on a course.</li>
              <li>&ldquo;Who sees this section&rdquo; carries over to the course, where it can still be changed per course.
                Instructor-only was taken from Classroom: drafts were hidden from students.</li>
              <li>Skip archives material you don&rsquo;t want — it stays searchable but is never suggested.</li>
            </ul>
          </section>
        )}

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {tab('pending', 'Pending review')}
          {tab('published', 'Published')}
          {tab('archived', 'Archived')}
          {tab('all', 'All')}
        </div>

        <form className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-6" action="/admin/library">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search title…" className={input} />
          <select name="bucket" defaultValue={bucket ?? ''} className={input}>
            <option value="">All libraries</option>
            {BUCKET_ORDER.map((b) => <option key={b} value={b}>{BUCKET_META[b].label}</option>)}
            <optgroup label="Reusable, built here">
              {TEMPLATE_SHELF_ORDER.map((s) => <option key={s} value={s}>{TEMPLATE_SHELF_META[s].label}</option>)}
            </optgroup>
          </select>
          <select name="discipline" defaultValue={discipline ?? ''} className={input}>
            <option value="">All disciplines</option>
            {CAPABILITY_ORDER.map((c) => <option key={c} value={c}>{CAPABILITY_META[c].label}</option>)}
          </select>
          <select name="kind" defaultValue={kind ?? ''} className={input}>
            <option value="">All types</option>
            {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k]}</option>)}
          </select>
          <select name="venue" defaultValue={venue ?? ''} className={input}>
            <option value="">All venues</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300 transition-colors">Filter</button>
        </form>

        {/* ── Add ──────────────────────────────────────────────────────── */}
        {/* Documents only — an equipment list or schedule is started from its
            own shelf below, where the editor is. */}
        <details className={`mb-6 group ${showDocs ? '' : 'hidden'}`}>
          <summary className="cursor-pointer list-none text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            <span className="text-zinc-600 mr-2 inline-block transition-transform group-open:rotate-90">▶</span>
            Add an item
          </summary>
          <form action={createLibraryItem} className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={label}>Title *</label>
              <input name="title" required className={input} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Link (Drive, YouTube, or any URL)</label>
              <input name="url" className={input} placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Edit link — internal only (CalTopo/SARTopo)</label>
              <input name="edit_url" className={input} placeholder="https://caltopo.com/m/…" />
            </div>
            <div>
              <label className={label}>Library</label>
              <select name="bucket" className={input} defaultValue="resource">
                {BUCKET_ORDER.map((b) => <option key={b} value={b}>{BUCKET_META[b].label}</option>)}
              </select>
              <p className="text-xs text-zinc-500 mt-1">Maps here are the ones a course can pull in beside its location.</p>
            </div>
            <div>
              <label className={label}>Type</label>
              <select name="kind" className={input} defaultValue="reference">
                {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k]}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Who can see it</label>
              <select name="audience" className={input} defaultValue="internal">
                <option value="internal">Instructors only</option>
                <option value="shared">Students &amp; instructors</option>
              </select>
            </div>
            <div>
              <label className={label}>State / country</label>
              <RegionSelect name="region" className={input} />
              <p className="text-xs text-zinc-500 mt-1">Maps tagged here are suggested to courses in the same place.</p>
            </div>
            <div>
              <label className={label}>Venue</label>
              <select name="venue_id" className={input}>
                <option value="">— none —</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Expires (permits)</label>
              <input type="date" name="expires_at" className={input} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Disciplines</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
                {CAPABILITY_ORDER.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                    <input type="checkbox" name="disciplines" value={c} className="accent-red-600" />
                    {CAPABILITY_META[c].label}
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Topic tags (comma separated)</label>
              <input name="topics" className={input} placeholder="Rappelling, Anchors" />
            </div>
            <div className="sm:col-span-2">
              <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                Add to library
              </button>
            </div>
          </form>
        </details>

        {/* ── Items ────────────────────────────────────────────────────── */}
        {showDocs && (
          <>
            <p className="text-xs text-zinc-600 mb-3">{items.length} item{items.length === 1 ? '' : 's'}</p>
            {status === 'pending' && items.length > 0 ? (
              <ReviewQueue items={items} venues={venues} />
            ) : (
              <div className="space-y-2">
                {items.map((it) => <LibraryRow key={it.id} item={it} venues={venues} />)}
                {items.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {showTemplates && shelfCount > 0 ? 'No documents match — the shelves below still do.' : 'Nothing here yet.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Reusable shelves ─────────────────────────────────────────── */}
        {/* Built in the portal rather than linked to, so these are edited in
            place — the same editors the course page uses, on the template
            itself. Every course keeps its own copy, so a fix here changes what
            the *next* course starts from, never a course already running. */}
        {showTemplates && shelves.map((shelf) => {
          const rows = shelf === 'gear' ? gearTemplates : scheduleTemplates
          return (
            <section key={shelf} className={showDocs ? 'mt-10 pt-8 border-t border-zinc-800' : ''}>
              <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
                <h2 className="text-lg font-semibold">{TEMPLATE_SHELF_META[shelf].label}</h2>
                <AddTemplate shelf={shelf} />
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                {TEMPLATE_SHELF_META[shelf].hint}. Editing one here changes what the next course starts from — courses
                already using it keep their own copy.
              </p>
              <div className="space-y-2">
                {shelf === 'gear' && gearTemplates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    shelf="gear"
                    list={t}
                    catalog={catalog}
                    summary={summarize(t, t.gear_list_entries?.length ?? 0, t.audience)}
                  />
                ))}
                {shelf === 'schedule' && scheduleTemplates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    shelf="schedule"
                    schedule={t}
                    summary={summarize(t, t.schedule_days?.length ?? 0)}
                  />
                ))}
                {rows.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {q || discipline
                      ? 'Nothing on this shelf matches.'
                      : `No ${TEMPLATE_SHELF_META[shelf].noun}s yet — start one blank, or save one from a course.`}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
