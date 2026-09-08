import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  KIND_META, LIBRARY_KINDS, BUCKET_META, BUCKET_ORDER,
  TEMPLATE_SHELF_META, TEMPLATE_SHELF_ORDER, SHELF_ORDER, isTemplateShelf,
  shelfLabel, shelfHint,
  type LibraryItem, type LibraryShelf, type TemplateShelf, type TemplateSummary, type Venue,
} from '@/lib/library'
import { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import { GEAR_ENTRIES_SELECT } from '@/lib/gear'
import { type Schedule } from '@/app/admin/schedules/ScheduleEditor'
import LibraryRow from './LibraryRow'
import TemplateRow from './TemplateRow'
import AddTemplate from './AddTemplate'
import ReviewQueue from './ReviewQueue'
import AddLibraryItem from './AddLibraryItem'
import ItemRow from './ItemRow'
import TemplateReadOnly from './TemplateReadOnly'
import InfoHint from '@/components/InfoHint'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory } from '@/lib/capabilities'
import { readViewAs } from '@/lib/view-as'
import ViewAsMenu from '@/components/ViewAsMenu'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; discipline?: string; kind?: string; audience?: string; venue?: string; bucket?: string; q?: string; template?: string; open?: string; page?: string }>
}) {
  // Published is the library. Pending review is a queue that Google Classroom
  // imports drop into, and landing on it meant the shelf you came to look at
  // read as empty — an item added by hand is published the moment it's added,
  // so the queue is usually empty and the answer usually isn't there.
  const { status: askedStatus, discipline, kind, audience, venue, bucket, q, template, open, page } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  // Instructors read the library; admins run it. It used to be two pages —
  // /instructor/reference could only read, this one could only be reached by
  // an admin — and the two drifted: only the reading one knew how to open a
  // Drive document, only this one paginated at all. One page, and the
  // difference is what you may do to a row, not which rows you may see.
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')
  const realAdmin = profile?.role === 'admin'
  // The preview means it here more than anywhere: the difference between the
  // two roles on this page is the whole page's worth of verbs, and the only
  // way to check that an instructor's library is usable is to read it as one.
  const viewAs = await readViewAs(realAdmin)
  if (viewAs === 'student') redirect('/dashboard')
  const isAdmin = realAdmin && !viewAs
  // Archived and pending are an admin's working states. Nobody else has a
  // verb that acts on them, so nobody else is offered them.
  const status = isAdmin ? (askedStatus ?? 'published') : 'published'

  // Gear lists and schedules are shelves too, but they're rows in their own
  // tables — so which of the two lists below runs depends on the shelf picked.
  // Filters that only a document can answer (type, venue, who-can-see, review
  // status) rule the template shelves out rather than showing them unfiltered.
  const docOnlyFilter = Boolean(kind || venue || audience)
  // Nothing asked for yet: the shelves themselves are the answer. 700 items
  // behind four doors, and the old page opened straight onto the first 500 of
  // them ordered by when they were imported — which is the one order nobody
  // is ever looking in. The search box comes with the cards rather than after
  // them, because a card that opens onto 333 items hasn't finished the job.
  // Which shelf you are standing on, if it is one shelf rather than a search
  // across all of them.
  const onShelf = Boolean(bucket)
  const landing = !bucket && !q && !discipline && !kind && !venue && !audience && status === 'published'
  const showDocs = !isTemplateShelf(bucket) && !landing
  const showTemplates = (!bucket || isTemplateShelf(bucket)) && !docOnlyFilter && !landing
  const shelves: TemplateShelf[] = isTemplateShelf(bucket) ? [bucket] : TEMPLATE_SHELF_ORDER

  // A page of results, not the whole shelf. The reference page learned this —
  // 800 rows cost about half a second to render a list nobody reads end to
  // end — while this one capped at 500 and said nothing, so items 501 and on
  // simply weren't reachable from here.
  const PAGE = 60
  const pageNo = Math.max(0, Number(page ?? '0') || 0)
  const offset = pageNo * PAGE

  let query = admin
    .from('library_items')
    .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, venue_id, expires_at, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
    // The review queue is a queue: oldest problems first is the wrong way
    // round, and it is read top to bottom rather than looked up. Every other
    // view is looked up, so it goes in the order a shelf goes in.
    .order(status === 'pending' ? 'created_at' : 'title', { ascending: status !== 'pending' })
    // Titles are not unique — 48 of them appear more than once on the teaching
    // shelf alone, "Rope Tech" thirteen times — so ordering by title is not an
    // order at all, and paging through one drops rows and repeats others
    // depending on how the rows came back that time. The id breaks the tie and
    // makes the sort total, which is what .range() needs to mean anything.
    .order('id')
    // One extra row tells us whether there's a next page — an exact count
    // costs a full table scan and we only need "is there more".
    .range(offset, offset + PAGE)

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
  const [{ data: itemRows }, { data: venueRows }, { data: siteRows }, gearRes, scheduleRes, catalogRes, { count: pendingCount }, shelfCounts] = await Promise.all([
    showDocs ? query : Promise.resolve({ data: [] }),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, active').order('name'),
    // A per-region template pins its canyons here, so the courses started from
    // it arrive with the beta already attached.
    admin.from('sites').select('id, name, kind, beta, venue_id, venues(name)').eq('active', true).order('name'),
    showTemplates && shelves.includes('gear')
      ? (() => {
          let g = admin.from('gear_lists')
            .select(`id, name, description, audience, intro, students, course_type, disciplines, topics, instance_id, is_template, ${GEAR_ENTRIES_SELECT}`)
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
            .select('id, name, description, overview, objectives, course_type, disciplines, topics, instance_id, is_template, schedule_days(id, title, location, site_id, notes, objectives, meeting_point, meeting_time, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
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
    // What is behind each door, for the cards. Head-only counts, and only on
    // the landing — a number on a card is the difference between picking a
    // shelf and guessing at one.
    landing
      ? Promise.all([
          ...BUCKET_ORDER.map(async (b) => [b, (await admin
            .from('library_items').select('id', { count: 'exact', head: true })
            .eq('status', 'published').eq('bucket', b)).count ?? 0] as [LibraryShelf, number]),
          admin.from('gear_lists').select('id', { count: 'exact', head: true }).eq('is_template', true)
            .then((r) => ['gear', r.count ?? 0] as [LibraryShelf, number]),
          admin.from('course_schedules').select('id', { count: 'exact', head: true }).eq('is_template', true)
            .then((r) => ['schedule', r.count ?? 0] as [LibraryShelf, number]),
        ])
      : Promise.resolve([] as [LibraryShelf, number][]),
  ])

  // The embed comes back under the table's name; the item calls them links.
  const fetched = ((itemRows ?? []) as unknown as (LibraryItem & {
    library_item_links?: LibraryItem['links']
  })[]).map((r) => ({ ...r, links: r.library_item_links ?? [] })) as LibraryItem[]
  const hasMore = fetched.length > PAGE
  const items = hasMore ? fetched.slice(0, PAGE) : fetched
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
  const countByShelf = new Map<LibraryShelf, number>(shelfCounts)
  const venueName = new Map(venues.map((v) => [v.id, v.name]))

  // Pending grouped by source class, derived from what we already fetched
  // rather than a second scan of the table.
  const pendingByClass = new Map<string, number>()
  for (const r of items) {
    if (r.status !== 'pending') continue
    const k = r.source_class ?? 'Added in portal'
    pendingByClass.set(k, (pendingByClass.get(k) ?? 0) + 1)
  }

  // Arriving from a course page: which template to open, and on which half —
  // "edit its name" and "show me what's in it" are different errands.
  const openPanel: 'contents' | 'details' = open === 'contents' ? 'contents' : 'details'

  // Changing what you're looking at puts you back on page one; only paging
  // carries the page, which is why it isn't in the merge.
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status, discipline, kind, audience, venue, bucket, q, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/admin/library?${p.toString()}`
  }

  // Documents on the current page, under the first expertise each is tagged
  // with. The reference page listed an item once per discipline it carried,
  // which read fine until you were looking at the same row twice; the filter
  // above still matches on any of them, so nothing is unreachable for being
  // grouped under one.
  const grouped = (() => {
    const by = new Map<string, LibraryItem[]>()
    for (const i of items) {
      const k = i.disciplines[0] ?? '_untagged'
      by.set(k, [...(by.get(k) ?? []), i])
    }
    return [
      ...CAPABILITY_ORDER.filter((c) => by.has(c)).map((c) => [c as string, by.get(c)!] as const),
      ...(by.has('_untagged') ? [['_untagged', by.get('_untagged')!] as const] : []),
    ]
  })()

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
        <div className="mb-6 flex items-center justify-between gap-3">
          {/* Where you came from, and — once you are on a shelf — the way back
              to the rest of them. Picking a shelf used to change nothing above
              the filters, so the only thing saying which of six you were
              looking at was a select box in the middle of a row of five. */}
          <div className="flex items-center gap-2 text-sm text-zinc-500 min-w-0">
            <Link href="/admin" className="hover:text-zinc-300 transition-colors">← Portal</Link>
            {onShelf && (
              <>
                <span className="text-zinc-700">/</span>
                <Link href="/admin/library" className="hover:text-zinc-300 transition-colors">All libraries</Link>
              </>
            )}
          </div>
          {realAdmin && <ViewAsMenu viewAs={viewAs ?? ''} />}
        </div>

        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{onShelf ? shelfLabel(bucket as LibraryShelf) : 'Content Library'}</h1>
            <p className="text-zinc-400 mt-1">
              {onShelf
                ? shelfHint(bucket as LibraryShelf)
                : isAdmin
                  ? 'Everything we teach from, look things up in, and build courses out of — and where it is added, tagged and retired.'
                  : 'Everything we teach from and look things up in — teaching material, manuals, standards, maps, kit lists and running orders.'}
            </p>
          </div>
          {/* Three consoles about the library rather than in it, so they sit
              in the header and only for the people who run them. */}
          {isAdmin && (
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
          )}
        </div>

        {/* ── Review queue ─────────────────────────────────────────────── */}
        {isAdmin && pendingByClass.size > 0 && status === 'pending' && (
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
        {/* Published / archived / pending are the states of the filing, not
            of the material. Only the people who can move a row between them
            are offered them. */}
        {isAdmin && (
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {/* The shelves first, in the order you'd read them; the import queue
                last, where an exception belongs, carrying its own count. */}
            {tab('published', 'Published')}
            {tab('archived', 'Archived')}
            {tab('all', 'All')}
            {tab('pending', 'Pending review', pendingCount ?? 0)}
          </div>
        )}

        <form className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-6" action="/admin/library">
          {isAdmin && <input type="hidden" name="status" value={status} />}
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
        {/* A button, not a line of grey text with a triangle in front of it.
            Adding is the second thing anyone comes here to do and it read as a
            footnote under the filters. */}
        {isAdmin && (
          <details className={`mb-6 group ${showDocs ? '' : 'hidden'}`}>
            <summary className="cursor-pointer list-none inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors">
              <span className="text-base leading-none text-zinc-500 group-open:hidden">+</span>
              <span className="hidden text-base leading-none text-zinc-500 group-open:inline">−</span>
              {onShelf ? `Add to ${shelfLabel(bucket as LibraryShelf)}` : 'Add an item'}
            </summary>
            <AddLibraryItem venues={venues} />
          </details>
        )}

        {/* The same place on a shelf whose rows are built here rather than
            filed here — a gear list or a running order. */}
        {isAdmin && onShelf && isTemplateShelf(bucket) && (
          <div className="mb-6">
            <AddTemplate shelf={bucket} />
          </div>
        )}

        {/* ── Items ────────────────────────────────────────────────────── */}
        {/* ── The shelves ──────────────────────────────────────────────── */}
        {landing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SHELF_ORDER.map((shelf) => (
              <Link
                key={shelf}
                href={href({ bucket: shelf })}
                className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold">{shelfLabel(shelf)}</h2>
                  <span className="text-xs text-zinc-500 shrink-0 tabular-nums">{countByShelf.get(shelf) ?? 0}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{shelfHint(shelf)}</p>
              </Link>
            ))}
          </div>
        )}

        {/* ── Items ────────────────────────────────────────────────────── */}
        {showDocs && (
          <>
            <p className="text-xs text-zinc-600 mb-3">
              {items.length === 0
                ? 'No items'
                : `Showing ${offset + 1}–${offset + items.length}`}
            </p>
            {status === 'pending' && items.length > 0 ? (
              <ReviewQueue items={items} venues={venues} />
            ) : (
              <div className="space-y-8">
                {grouped.map(([cat, rows]) => (
                  <section key={cat}>
                    <h2 className="text-sm font-semibold text-zinc-400 mb-2">
                      {cat === '_untagged' ? 'Not tied to an expertise' : CAPABILITY_META[cat as CapabilityCategory].label}
                      <span className="text-zinc-600 font-normal ml-2">{rows.length}</span>
                    </h2>
                    {/* The same rows either way. An admin gets the editor,
                        which is a row that can be opened and changed; everyone
                        else gets the row. */}
                    {isAdmin ? (
                      <div className="space-y-2">
                        {rows.map((it) => <LibraryRow key={it.id} item={it} venues={venues} />)}
                      </div>
                    ) : (
                      <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800/70">
                        {rows.map((it) => (
                          <ItemRow key={it.id} item={it} venueName={it.venue_id ? venueName.get(it.venue_id) : null} />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
                {items.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {showTemplates && shelfCount > 0 ? 'No documents match — the shelves below still do.' : 'Nothing here yet.'}
                  </p>
                )}
              </div>
            )}

            {(hasMore || offset > 0) && (
              <div className="flex items-center gap-3 mt-8">
                {offset > 0 && (
                  <Link
                    href={href({ page: pageNo === 1 ? undefined : String(pageNo - 1) })}
                    className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                  >
                    ← Previous
                  </Link>
                )}
                {hasMore && (
                  <Link
                    href={href({ page: String(pageNo + 1) })}
                    className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                  >
                    Next →
                  </Link>
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
              {/* Named here only when there is more than one shelf on the
                  page. Standing on the shelf itself, the page title says it
                  and the button has gone to the top with the other one. */}
              <div className={`flex items-end justify-between gap-4 flex-wrap mb-3 ${onShelf ? 'hidden' : ''}`}>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {TEMPLATE_SHELF_META[shelf].label}
                  <InfoHint
                    text={`${TEMPLATE_SHELF_META[shelf].hint}. Editing one here changes what the next course starts from — courses already using it keep their own copy.`}
                  />
                </h2>
                {isAdmin && <AddTemplate shelf={shelf} />}
              </div>
              <div className="space-y-2">
                {shelf === 'gear' && gearTemplates.map((t) => (
                  isAdmin ? (
                    <TemplateRow
                      key={t.id}
                      shelf="gear"
                      list={t}
                      catalog={catalog}
                      summary={summarize(t, t.gear_list_entries?.length ?? 0, t.audience)}
                      initialOpen={template === t.id ? openPanel : undefined}
                    />
                  ) : (
                    <TemplateReadOnly
                      key={t.id}
                      shelf="gear"
                      list={t}
                      catalog={catalog}
                      summary={summarize(t, t.gear_list_entries?.length ?? 0, t.audience)}
                    />
                  )
                ))}
                {shelf === 'schedule' && scheduleTemplates.map((t) => (
                  isAdmin ? (
                    <TemplateRow
                      key={t.id}
                      shelf="schedule"
                      schedule={t}
                      sites={siteOptions}
                      summary={summarize(t, t.schedule_days?.length ?? 0)}
                      initialOpen={template === t.id ? openPanel : undefined}
                    />
                  ) : (
                    <TemplateReadOnly
                      key={t.id}
                      shelf="schedule"
                      schedule={t}
                      summary={summarize(t, t.schedule_days?.length ?? 0)}
                    />
                  )
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
