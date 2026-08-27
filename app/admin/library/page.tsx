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
import { GEAR_ENTRIES_SELECT } from '@/lib/gear'
import { type Schedule } from '@/app/admin/schedules/ScheduleEditor'
import LibraryRow from './LibraryRow'
import TemplateRow from './TemplateRow'
import AddTemplate from './AddTemplate'
import ReviewQueue from './ReviewQueue'
import AddLibraryItem from './AddLibraryItem'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; discipline?: string; kind?: string; audience?: string; venue?: string; bucket?: string; q?: string }>
}) {
  // Published is the library. Pending review is a queue that Google Classroom
  // imports drop into, and landing on it meant the shelf you came to look at
  // read as empty — an item added by hand is published the moment it's added,
  // so the queue is usually empty and the answer usually isn't there.
  const { status = 'published', discipline, kind, audience, venue, bucket, q } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Gear lists and schedules are shelves too, but they're rows in their own
  // tables — so which of the two lists below runs depends on the shelf picked.
  // Filters that only a document can answer (type, venue, who-can-see, review
  // status) rule the template shelves out rather than showing them unfiltered.
  const docOnlyFilter = Boolean(kind || venue || audience)
  const showDocs = !isTemplateShelf(bucket)
  const showTemplates = (!bucket || isTemplateShelf(bucket)) && !docOnlyFilter
  const shelves: TemplateShelf[] = isTemplateShelf(bucket) ? [bucket] : TEMPLATE_SHELF_ORDER

  let query = admin
    .from('library_items')
    .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, venue_id, expires_at, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
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
  const [{ data: itemRows }, { data: venueRows }, { data: siteRows }, gearRes, scheduleRes, catalogRes, { count: pendingCount }] = await Promise.all([
    showDocs ? query : Promise.resolve({ data: [] }),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, active').order('name'),
    // A per-region template pins its canyons here, so the courses started from
    // it arrive with the beta already attached.
    admin.from('sites').select('id, name, kind, beta, venue_id, venues(name)').eq('active', true).order('name'),
    showTemplates && shelves.includes('gear')
      ? (() => {
          let g = admin.from('gear_lists')
            .select(`id, name, description, audience, intro, course_type, disciplines, topics, instance_id, is_template, ${GEAR_ENTRIES_SELECT}`)
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
            .select('id, name, description, overview, objectives, course_type, disciplines, topics, instance_id, is_template, schedule_days(id, title, location, site_id, notes, objectives, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
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
    // Counted whatever tab you are on: the queue is no longer the page you
    // land on, so the only thing keeping an import from rotting there unseen
    // is the number on the tab.
    admin.from('library_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  // The embed comes back under the table's name; the item calls them links.
  const items = ((itemRows ?? []) as unknown as (LibraryItem & {
    library_item_links?: LibraryItem['links']
  })[]).map((r) => ({ ...r, links: r.library_item_links ?? [] })) as LibraryItem[]
  const venues = (venueRows ?? []) as Venue[]
  const siteOptions = ((siteRows ?? []) as unknown as {
    id: string; name: string; kind: string | null; beta: string | null; venue_id: string | null; venues: { name: string } | null
  }[]).map((s) => ({ id: s.id, name: s.name, kind: s.kind, beta: s.beta, venue_id: s.venue_id, venue_name: s.venues?.name ?? null }))

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

  const tab = (key: string, text: string, badge?: number) => (
    <Link
      href={href({ status: key })}
      scroll={false}
      className={`px-3 py-1.5 rounded text-sm transition-colors inline-flex items-center gap-1.5 ${
        status === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {text}
      {Boolean(badge) && (
        <span className="text-[10px] leading-none px-1.5 py-1 rounded bg-amber-950/60 text-amber-400">
          {badge}
        </span>
      )}
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
              Course material, references, maps and permits — plus the gear lists and schedules we build here.
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
            {/* Routes are shelved next to the maps and permits they go with —
                a canyon's beta is library material, it just isn't a link. */}
            <Link href="/admin/sites" className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors">
              Sites
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
          {/* The shelves first, in the order you'd read them; the import queue
              last, where an exception belongs, carrying its own count. */}
          {tab('published', 'Published')}
          {tab('archived', 'Archived')}
          {tab('all', 'All')}
          {tab('pending', 'Pending review', pendingCount ?? 0)}
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
        {/* Documents only — a gear list or schedule is started from its
            own shelf below, where the editor is. */}
        <details className={`mb-6 group ${showDocs ? '' : 'hidden'}`}>
          <summary className="cursor-pointer list-none text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            <span className="text-zinc-600 mr-2 inline-block transition-transform group-open:rotate-90">▶</span>
            Add an item
          </summary>
          <AddLibraryItem venues={venues} />
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
                    sites={siteOptions}
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
