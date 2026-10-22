import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  KIND_META, LIBRARY_KINDS, BUCKET_META, BUCKET_ORDER,
  TEMPLATE_SHELF_META, TEMPLATE_SHELF_ORDER, SHELF_ORDER, isTemplateShelf, isPlaceShelf,
  shelfLabel, shelfHint, isMediaShelf, KINDS_OFF_BUCKET_SHELVES,
  type LibraryItem, type LibraryShelf, type LibraryBucket, type TemplateShelf, type TemplateSummary, type Venue,
} from '@/lib/library'
import { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import { GEAR_ENTRIES_SELECT } from '@/lib/gear'
import { type Schedule } from '@/app/admin/schedules/ScheduleEditor'
import LibraryRow from './LibraryRow'
import PickSet from './PickSet'
import TemplateRow from './TemplateRow'
import AddTemplate from './AddTemplate'
import AddLibraryItem from './AddLibraryItem'
import ItemRow from './ItemRow'
import TemplateReadOnly from './TemplateReadOnly'
import CourseSetupRow from './CourseSetupRow'
import CourseSetupReadOnly from './CourseSetupReadOnly'
import InfoHint from '@/components/InfoHint'
import MediaShelf from './MediaShelf'
import { loadMediaShelf } from './media/load'
import { albumMatches } from '@/lib/media'
import { NEEDS_SORTING } from '@/lib/sorting'
import SitesShelf from '@/app/admin/sites/SitesShelf'
import { loadSitesShelf } from '@/app/admin/sites/load'
import { CAPABILITY_META, CAPABILITY_ORDER, courseCapabilityCategories, type CapabilityCategory } from '@/lib/capabilities'
import { COURSE_TYPE_OPTIONS } from '@/lib/courses'
import { readViewAs, viewAsSelf } from '@/lib/view-as'
import ViewAsMenu from '@/components/ViewAsMenu'
import ShelfTypeSelect from '@/components/ShelfTypeSelect'
import { CLIENT_COLUMNS, placeOptions, type ClientRow } from '@/lib/clients'
import FoldedGroup from '@/components/FoldedGroup'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; discipline?: string; kind?: string; audience?: string; venue?: string; offering?: string; bucket?: string; q?: string; template?: string; open?: string; page?: string; topic?: string }>
}) {
  // Published is the library. Pending review is a queue that Google Classroom
  // imports drop into, and landing on it meant the shelf you came to look at
  // read as empty — an item added by hand is published the moment it's added,
  // so the queue is usually empty and the answer usually isn't there.
  const { item, discipline, kind, audience, venue, offering, bucket, q, template, open, page, topic } = await searchParams

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
  const self = viewAsSelf(profile?.role)
  const viewAs = await readViewAs(profile?.role)
  if (viewAs === 'student') redirect('/dashboard')
  const isAdmin = realAdmin && !viewAs
  // Archived and pending are an admin's working states. Nobody else has a
  // verb that acts on them, so nobody else is offered them.
  // No filing-state control. A shelf is everything that belongs on it: what
  // is on it, what is waiting to go on it, and — for the five people who can
  // change any of it — what has been retired from it, each saying which it
  // is on the row. Four tabs asked you to pick a state before you could look
  // at a shelf, and the answer was almost always "all of them".
  //
  // Instructors still see the shelf and nothing else: approved material, and
  // no sign that the rest exists.
  const STATUSES = isAdmin ? ['published', 'pending', 'archived'] : ['published']

  // Gear lists and schedules are shelves too, but they're rows in their own
  // tables — so which of the two lists below runs depends on the shelf picked.
  // Filters that only a document can answer (type, venue, who-can-see, review
  // status) rule the template shelves out rather than showing them unfiltered.
  const docOnlyFilter = Boolean(kind || venue || audience || topic)
  // Nothing asked for yet: the shelves themselves are the answer. 700 items
  // behind four doors, and the old page opened straight onto the first 500 of
  // them ordered by when they were imported — which is the one order nobody
  // is ever looking in. The search box comes with the cards rather than after
  // them, because a card that opens onto 333 items hasn't finished the job.
  // Which shelf you are standing on, if it is one shelf rather than a search
  // across all of them.
  const onShelf = Boolean(bucket)
  const landing = !item && !topic && !bucket && !q && !discipline && !kind && !venue && !audience
  // The places shelf is its own thing: not documents, not templates, and the
  // document filters (type, who-can-see, review status) mean nothing to a
  // canyon. It is only ever shown when it is the shelf asked for.
  const onPlaces = isPlaceShelf(bucket)
  const onMedia = isMediaShelf(bucket)
  // Resorting is a view of the whole shelf at once, so it owns the page while
  // it is open — a paginated list of sixty is the wrong unit for a claim about
  // eight hundred.
  // The sorting view has three faces: the list of what is left, and the two
  // tools that are not a per-item edit. Everything else on the list is fixed
  // where the item already lives.
  const showDocs = !isTemplateShelf(bucket) && !onPlaces && !onMedia && !landing
  // Review status is a document's state, not a template's: there is nothing
  // to approve about a kit list you wrote yourself, so the pending and
  // archived tabs — which are documents being worked through — leave them
  // out. The comment above has always said so; the condition did not, and
  // every course setup turned up under Pending review looking like work.
  // Asking for a template shelf by name still shows it, since hiding it
  // there would leave the shelf reading as empty.
  const showTemplates =
    (!bucket || isTemplateShelf(bucket)) && !docOnlyFilter && !landing && !onPlaces && !onMedia
  const shelves: TemplateShelf[] = isTemplateShelf(bucket) ? [bucket] : TEMPLATE_SHELF_ORDER

  // A page of results, not the whole shelf. The reference page learned this —
  // 800 rows cost about half a second to render a list nobody reads end to
  // end — while this one capped at 500 and said nothing, so items 501 and on
  // simply weren't reachable from here.
  // The import queue is the exception: it is a pile you work through until
  // it is empty, and splitting 118 rows across two pages means the groups
  // are cut in half — "Rappelling (14)" on one page and the rest of
  // Rappelling on the next, each with its own selection. The groups are
  // folded, so the cost is rows in the DOM nobody has opened.
  const PAGE = 60
  const pageNo = Math.max(0, Number(page ?? '0') || 0)
  const offset = pageNo * PAGE

  let query = admin
    .from('library_items')
    .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, course_types, client_id, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
    // The review queue is a queue: oldest problems first is the wrong way
    // round, and it is read top to bottom rather than looked up. Every other
    // view is looked up, so it goes in the order a shelf goes in.
    .order('title')
    // Titles are not unique — 48 of them appear more than once on the teaching
    // shelf alone, "Rope Tech" thirteen times — so ordering by title is not an
    // order at all, and paging through one drops rows and repeats others
    // depending on how the rows came back that time. The id breaks the tie and
    // makes the sort total, which is what .range() needs to mean anything.
    .order('id')
    // One extra row tells us whether there's a next page — an exact count
    // costs a full table scan and we only need "is there more".
    .range(offset, offset + PAGE)

  // An admin standing on a shelf sees what is waiting for that shelf too.
  // The review was a separate screen because pending rows were invisible
  // everywhere else; they do not have to be. A pending row is marked, sits
  // among the published ones it will join, and is approved from the same bar
  // — which is also the only way to notice that the shelf already holds two
  // copies of the thing you are about to approve.
  //
  // Instructors never see one: nothing pending is on a shelf, in a picker or
  // in a course until somebody says so.
  // Everything that narrows the list, in one function, because the facets
  // have to be narrowed by exactly the same things. They were not: the facet
  // query filtered by shelf and status alone, so with a search or a
  // discipline on, the headings counted the whole shelf while the rows under
  // them were the filtered few — "No type yet · 0 of 252" over an empty
  // group that nothing could open.
  //
  // `kind` is the exception, and is why this takes an argument: a type facet
  // narrowed by the type you picked would only ever count that one.
  const narrow = <T extends typeof query>(b: T, withKind: boolean): T => {
    let out = b.in('status', STATUSES) as T
    // The five admins see the permits, MOUs and COIs; nobody else does, and
    // an admin previewing the page as an instructor is nobody else — the
    // whole point of that preview is to see what they see. `isAdmin` already
    // folds view-as in, which is why the gate reads it rather than the role.
    if (!isAdmin) out = out.eq('admin_only', false) as T
    if (discipline) out = out.contains('disciplines', [discipline]) as T
    if (withKind && kind) out = out.eq('kind', kind) as T
    if (audience) out = out.eq('audience', audience) as T
    if (venue) out = out.eq('venue_id', venue) as T
    // "What would a Canyon Mobility course reach for": the rows tied to that
    // offering, plus the untied ones whose discipline it involves. Tying
    // every row to an offering would be a tag that says "most of them", so
    // untied is the usual answer and this is what keeps it findable.
    if (offering) {
      const implied = courseCapabilityCategories(offering, null) as string[]
      out = out.or(
        implied.length > 0
          ? `course_types.cs.{${offering}},and(course_types.eq.{},disciplines.ov.{${implied.join(',')}})`
          : `course_types.cs.{${offering}}`
      ) as T
    }
    if (bucket && !isTemplateShelf(bucket)) {
      out = out.eq('bucket', bucket) as T
      // A kit list keeps the shelf it was filed to before anyone could say
      // it was a kit list; it is read from the Gear lists card, not here.
      out = out.not('kind', 'in', `(${KINDS_OFF_BUCKET_SHELVES.join(',')})`) as T
    }
    // One row, named outright. How a course file links to the row it was
    // filed as: the filing form asks the filing questions, and everything
    // else about a library row is edited on the row.
    if (item) out = out.eq('id', item) as T
    if (q) out = out.ilike('title', `%${q}%`) as T
    // Topic tags were already how `needs-link-check` marks a row; the sorting
    // pass marks what it would not guess the same way, so the pile it leaves
    // is browsed with the ordinary shelf rather than needing a screen.
    if (topic) out = out.contains('topics', [topic]) as T
    return out
  }
  query = narrow(query, true)
  if (!kind) query = query.neq('kind', 'media')

  // Templates take the same search box and discipline tags the documents use.
  // Nothing to approve about a kit list you wrote yourself, so they have no
  // filing state at all.
  const [{ data: itemRows }, { data: venueRows }, { data: siteRows }, gearRes, scheduleRes, setupRes, catalogRes, { data: kitListRows }, placesShelf, mediaShelf, { data: facetRows }, { data: clientRows }, shelfCounts] = await Promise.all([
    showDocs ? query : Promise.resolve({ data: [] }),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, links, contacts, active').order('name'),
    // A per-region template pins its canyons here, so the courses started from
    // it arrive with the beta already attached.
    admin.from('sites').select('id, name, kind, beta, venue_id, venues(name)').eq('active', true).order('name'),
    showTemplates && shelves.includes('gear')
      ? (() => {
          let g = admin.from('gear_lists')
            .select(`id, name, description, audience, intro, students, url, client_id, course_type, course_types, venue_id, site_id, region, disciplines, topics, instance_id, is_template, ${GEAR_ENTRIES_SELECT}`)
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
            .select('id, name, description, overview, objectives, url, client_id, course_type, course_types, venue_id, site_id, region, disciplines, topics, instance_id, is_template, schedule_days(id, title, location, site_id, notes, objectives, meeting_point, meeting_time, sort_order, schedule_blocks(id, parent_id, title, time_label, location, sort_order))')
            .eq('is_template', true)
            .order('name')
          if (q) s = s.ilike('name', `%${q}%`)
          if (discipline) s = s.contains('disciplines', [discipline])
          return s
        })()
      : Promise.resolve({ data: [] }),
    // The curriculum shelf. A setup is the nearest thing the library has to a
    // course type's own shelf, so what it holds has to be openable and
    // taggable where it is listed — reading back a title was enough to say
    // what a setup *would* put on a course and nothing else, which left the
    // one view organised by course type unable to answer whether the material
    // under it was even filed right. Same columns the shelf itself reads.
    showTemplates && shelves.includes('setup')
      ? (() => {
          let c = admin.from('course_templates')
            .select('id, name, description, course_type, course_types, url, client_id, topics, audience, venue_id, site_id, region, disciplines, course_template_sections(id, title, sort_order, course_template_items(id, sort_order, library_items(id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, course_types, client_id, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience))))')
            .eq('active', true)
            .order('name')
          if (q) c = c.ilike('name', `%${q}%`)
          if (discipline) c = c.contains('disciplines', [discipline])
          return c
        })()
      : Promise.resolve({ data: [] }),
    // Editing a kit list on its shelf needs the same catalog the course page
    // gives the editor, or every line loses the type it points at.
    showTemplates && shelves.includes('gear')
      ? admin.from('gear_items').select('id, name, brand, info, url, category, parent_id, aliases, disciplines').eq('active', true).order('name')
      : Promise.resolve({ data: [] }),
    // Kit lists written as documents, read on the gear shelf beside the
    // structured lists. Everything here predates the structure; a PDF that
    // says what to bring is a gear list that was written down.
    showTemplates && shelves.includes('gear')
      ? admin
          .from('library_items')
          .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, course_types, client_id, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
          .eq('kind', 'kit_list')
          .in('status', STATUSES)
          .order('title')
      : Promise.resolve({ data: [] }),
    onPlaces ? loadSitesShelf() : Promise.resolve(null),
    onMedia ? loadMediaShelf() : Promise.resolve(null),
    // What is actually on this shelf, for the filters above it. Offering
    // "Video" on a shelf holding no video is a dead end dressed as a choice —
    // you pick it, get nothing, and learn nothing about why. Cheap: two
    // columns for one shelf, and only while standing on one.
    onShelf && !isTemplateShelf(bucket) && !onPlaces
      ? narrow(admin.from('library_items').select('kind, disciplines') as unknown as typeof query, false).limit(2000)
      : Promise.resolve({ data: null }),
    // The client list, for the filing panel's one new question. Small — 52
    // rows — and read on every shelf, so it is fetched with everything else
    // rather than behind a click.
    admin.from('clients').select(CLIENT_COLUMNS).order('name'),
    landing
      ? Promise.all([
          ...BUCKET_ORDER.map(async (b) => [b, (await admin
            .from('library_items').select('id', { count: 'exact', head: true })
            .in('status', STATUSES).eq('bucket', b)
            .not('kind', 'in', `(${KINDS_OFF_BUCKET_SHELVES.join(',')})`)).count ?? 0] as [LibraryShelf, number]),
          // Both shapes, because both are gear lists to anyone counting.
          Promise.all([
            admin.from('gear_lists').select('id', { count: 'exact', head: true }).eq('is_template', true),
            admin.from('library_items').select('id', { count: 'exact', head: true }).eq('kind', 'kit_list').in('status', STATUSES),
          ]).then(([a, b]) => ['gear', (a.count ?? 0) + (b.count ?? 0)] as [LibraryShelf, number]),
          admin.from('course_schedules').select('id', { count: 'exact', head: true }).eq('is_template', true)
            .then((r) => ['schedule', r.count ?? 0] as [LibraryShelf, number]),
          admin.from('course_templates').select('id', { count: 'exact', head: true }).eq('active', true)
            .then((r) => ['setup', r.count ?? 0] as [LibraryShelf, number]),
          // The card counts the places, not the maps on them: "15 venues" is
          // what the door is behind, and the maps are one of the things found
          // once you are through it.
          admin.from('venues').select('id', { count: 'exact', head: true }).eq('active', true)
            .then((r) => ['venue', r.count ?? 0] as [LibraryShelf, number]),
          // Photos and clips, not albums: the number says how much there is,
          // and four albums reads as less than it is.
          admin.from('course_photos').select('id', { count: 'exact', head: true })
            .then((r) => ['media', r.count ?? 0] as [LibraryShelf, number]),
        ])
      : Promise.resolve([] as [LibraryShelf, number][]),
  ])

  // The facets of the shelf being stood on: which types and which disciplines
  // are actually represented, and how many of each.
  const facetKinds = new Map<string, number>()
  const facetDisciplines = new Map<string, number>()
  for (const r of (facetRows ?? []) as { kind: string; disciplines: string[] | null }[]) {
    facetKinds.set(r.kind, (facetKinds.get(r.kind) ?? 0) + 1)
    for (const d of r.disciplines ?? []) facetDisciplines.set(d, (facetDisciplines.get(d) ?? 0) + 1)
  }
  const hasFacets = facetRows !== null

  // The embed comes back under the table's name; the item calls them links.
  const fetched = ((itemRows ?? []) as unknown as (LibraryItem & {
    library_item_links?: LibraryItem['links']
  })[]).map((r) => ({ ...r, links: r.library_item_links ?? [] })) as LibraryItem[]
  const hasMore = fetched.length > PAGE
  // Waiting first, retired last, alphabetical inside each. A pending row that
  // sorts to the middle of its type group is a pending row nobody will see,
  // and the whole reason it is on the shelf is to be seen next to what is
  // already there.
  const ORDER: Record<string, number> = { pending: 0, published: 1, archived: 2 }
  const byState = (rows: LibraryItem[]) =>
    rows.slice().sort((a, b) => (ORDER[a.status] ?? 1) - (ORDER[b.status] ?? 1))

  // A group has to be a group. Grouping one page of sixty rows meant each
  // heading showed whichever of its rows happened to fall in the first sixty
  // titles of the whole shelf — "Video · 1 of 44", one row, and the other
  // forty-three on pages nobody would guess at.
  //
  // So on a shelf the page is per group: each type brings all of its own
  // rows. Opening Video shows the forty-four videos, which is what opening
  // Video should do. One query per type on the shelf and a second round trip,
  // and the rows are built only when a group is opened — see FoldedGroup.
  const perGroup = onShelf && !kind && hasFacets
  const groupRows = perGroup
    ? Object.fromEntries(
        await Promise.all(
          [...facetKinds.keys()].map(async (k) => [
            k,
            byState(
              (((await narrow(
                admin
                  .from('library_items')
                  .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, course_types, client_id, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
                  .eq('kind', k)
                  .order('title')
                  .order('id')
                  .limit(2000) as unknown as typeof query,
                false
              )).data ?? []) as unknown as (LibraryItem & { library_item_links?: LibraryItem['links'] })[])
                .map((r) => ({ ...r, links: r.library_item_links ?? [] }) as LibraryItem)
            ),
          ])
        )
      ) as Record<string, LibraryItem[]>
    : null
  const items = groupRows
    ? Object.values(groupRows).flat()
    : byState(hasMore ? fetched.slice(0, PAGE) : fetched)
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
  const courseSetups = ((setupRes.data ?? []) as unknown as {
    id: string; name: string; description: string | null; course_type: string | null
    course_types: string[] | null; url: string | null; topics: string[] | null; client_id: string | null
    audience: 'internal' | 'shared' | null
    venue_id: string | null; site_id: string | null; region: string | null
    disciplines: string[] | null
    course_template_sections: {
      id: string; title: string; sort_order: number
      course_template_items: {
        id: string; sort_order: number
        library_items: (LibraryItem & { library_item_links?: LibraryItem['links'] }) | null
      }[]
    }[]
  }[]).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    course_type: t.course_type,
    course_types: t.course_types?.length ? t.course_types : t.course_type ? [t.course_type] : [],
    url: t.url,
    topics: t.topics ?? [],
    audience: t.audience ?? 'shared',
    client_id: t.client_id ?? null,
    place: t.site_id ? `site:${t.site_id}` : t.venue_id ? `venue:${t.venue_id}` : t.region ? `region:${t.region}` : '',
    disciplines: t.disciplines ?? [],
    sections: [...(t.course_template_sections ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((sec) => {
        const rows = [...(sec.course_template_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
        return {
          id: sec.id,
          title: sec.title,
          // The row id travels with the item: taking something out of a setup
          // deletes the reference, not the material, and the reference is what
          // this id names.
          items: rows
            .filter((r) => r.library_items)
            .map((r) => ({
              rowId: r.id,
              item: { ...r.library_items!, links: r.library_items!.library_item_links ?? [] } as LibraryItem,
            })),
          // A section can point at material that has since been deleted. It
          // used to read as a row saying "material since deleted", which looked
          // like something you could go and fix; it is a dangling reference and
          // the honest form of it is a count.
          missing: rows.filter((i) => !i.library_items).length,
        }
      }),
  }))
  // Grouped by the move itself, which is the unit the claim can be agreed

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { item, discipline, kind, audience, venue, offering, bucket, q, topic, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/admin/library?${p.toString()}`
  }

  const kitLists = ((kitListRows ?? []) as unknown as (LibraryItem & { library_item_links?: LibraryItem['links'] })[])
    .map((r) => ({ ...r, links: r.library_item_links ?? [] }) as LibraryItem)

  const catalog = (catalogRes.data ?? []) as unknown as GearItem[]

  const summarize = (
    t: {
      id: string; name: string; description: string | null
      course_types?: string[] | null; course_type?: string | null; url?: string | null; client_id?: string | null
      disciplines: string[]; topics: string[]
      venue_id?: string | null; site_id?: string | null; region?: string | null
    },
    count: number,
    audience?: 'student' | 'instructor'
  ): TemplateSummary => ({
    id: t.id, name: t.name, description: t.description, url: t.url ?? null, client_id: t.client_id ?? null,
    place: t.site_id ? `site:${t.site_id}` : t.venue_id ? `venue:${t.venue_id}` : t.region ? `region:${t.region}` : '',
    // The column is filled from course_type by 256; this keeps a row written
    // by an older deploy readable until nothing writes the single one.
    course_types: t.course_types?.length ? t.course_types : t.course_type ? [t.course_type] : [],
    disciplines: t.disciplines ?? [], topics: t.topics ?? [], count, audience,
  })

  const shelfCount = gearTemplates.length + scheduleTemplates.length + courseSetups.length
  const countByShelf = new Map<LibraryShelf, number>(shelfCounts)
  const venueName = new Map(venues.map((v) => [v.id, v.name]))
  // "Sector › Client", so a name that repeats under two sectors is still
  // tellable apart in a flat list.
  const clients = placeOptions((clientRows ?? []) as ClientRow[])
    .filter((c) => !((clientRows ?? []) as ClientRow[]).find((r) => r.id === c.id)?.is_group)

  // Arriving from a course page: which template to open, and on which half —
  // "edit its name" and "show me what's in it" are different errands.
  const openPanel: 'contents' | 'details' = open === 'contents' ? 'contents' : 'details'

  // Changing what you're looking at puts you back on page one; only paging
  // carries the page, which is why it isn't in the merge.
  // Grouping follows where you are standing.
  //
  // On a shelf, by what each thing IS — manuals, standards, tech notes, skill
  // sheets. That is the list someone draws when asked what is on the shelf,
  // and it is the only axis on which "Reference" reads as four things rather
  // than fifty-nine.
  //
  // Searching across shelves, by discipline instead: the question there is
  // "what have we got on canyons", and the answer sorted by document type is
  // no answer at all. An item is listed under the first discipline it carries
  // rather than once per discipline — the filter still matches on any of
  // them, so nothing is unreachable for being grouped under one.
  // A shelf groups by type; a search across shelves groups by discipline.
  // There was a third, by the Classroom class a row was imported from, for
  // the queue that no longer exists — a pending row now sits on its shelf
  // among the rows it is about to join, which is a better comparison than
  // the room it was posted in five years ago.
  const groupBy: 'kind' | 'discipline' = onShelf ? 'kind' : 'discipline'
  const grouped = (() => {
    const by = new Map<string, LibraryItem[]>()
    for (const i of items) {
      const k = groupBy === 'kind' ? i.kind : (i.disciplines[0] ?? '_untagged')
      by.set(k, [...(by.get(k) ?? []), i])
    }
    if (groupBy === 'kind') {
      // Every type the shelf holds, not only the ones that landed on this
      // page. The facets counted the whole shelf and the headings counted
      // sixty rows, so the type list in the filter and the type list on the
      // page disagreed — seven types offered above, four headings below, and
      // no way to tell which of the two was lying.
      const keys = hasFacets
        ? LIBRARY_KINDS.filter((k) => by.has(k) || facetKinds.has(k))
        : LIBRARY_KINDS.filter((k) => by.has(k))
      return keys.map((k) => [k as string, by.get(k) ?? []] as const)
    }
    return [
      ...CAPABILITY_ORDER.filter((c) => by.has(c)).map((c) => [c as string, by.get(c)!] as const),
      ...(by.has('_untagged') ? [['_untagged', by.get('_untagged')!] as const] : []),
    ]
  })()
  // Blank is how an untyped row reads on its own line — nothing has been said
  // about it yet. A heading cannot be blank, and neither can a line in a
  // filter: there it is a row you cannot read and cannot not pick.
  const UNTYPED = 'No type yet'
  const kindLabel = (k: string) => KIND_META[k as keyof typeof KIND_META] || UNTYPED
  const groupLabel = (cat: string) =>
    groupBy === 'kind'
      ? kindLabel(cat)
      : cat === '_untagged'
        ? 'Not tied to a discipline'
        : CAPABILITY_META[cat as CapabilityCategory].label

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
          {self && <ViewAsMenu self={self} viewAs={viewAs ?? ''} />}
        </div>

        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{onShelf ? shelfLabel(bucket as LibraryShelf) : 'Content Library'}</h1>
            <p className="text-zinc-400 mt-1">
              {onShelf
                ? shelfHint(bucket as LibraryShelf)
                : isAdmin
                  ? 'Everything we teach from, look things up in, and build courses out of — and where it is added, tagged and retired.'
                  : 'Everything we teach from and look things up in — teaching material, manuals, standards, maps, gear lists and running orders.'}
            </p>
          </div>
          {/* Where "What needs sorting" was. It had become one real check
              behind a button nobody had a reason to press: everything else on
              it is visible while browsing — a missing chip, a needs-sorting
              badge — and the import queue has its own tab. The check that was
              left shows itself below instead. */}
          {/* The three buttons that used to sit here were exits from a page
              people came to for content: Coverage, Venues, Sites. Sites is a
              shelf now, which is where it was always being looked for, and it
              carries the door to venues. Coverage answered "what is missing
              from a venue pack", a question nobody was asking. */}
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        {/* Where the Published / Archived / All / Pending row was. Four tabs
            asking which filing state you wanted before you could look at a
            shelf, and the answer was almost always all of them: a shelf is
            what is on it, what is waiting to go on it and what has been
            retired from it. Each row says which it is, so the question is
            answered by looking rather than by choosing. */}
        <form className={`grid grid-cols-2 sm:grid-cols-6 gap-2 mb-6 ${onPlaces ? 'hidden' : ''}`} action="/admin/library">
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder={onShelf ? `Search ${shelfLabel(bucket as LibraryShelf).toLowerCase()}…` : 'Search every shelf…'}
            className={input}
          />
          {/* Which shelf, only while standing on none. On a shelf it was a
              control that said where you already were, with the breadcrumb
              saying it again above — and on the two shelves it does not list,
              Venue information and Photos & video, it read as "All libraries"
              and quietly threw you back there the moment you searched. Now
              the shelf you are on rides along hidden. */}
          {/* Shelf and type, in one control. They were two, and the types
              in the second belonged to the shelves in the first — so you
              could ask for Reference and then for Map and get a list of
              nothing, with no hint that the two had disagreed. Grouped the
              way the tagging dropdown groups, with a row per shelf that
              means the whole shelf, because that is an answer and an
              optgroup label cannot be one. */}
          <ShelfTypeSelect
            bucket={bucket}
            kind={kind}
            counts={hasFacets ? facetKinds : null}
            className={input}
          />
          {/* Standing on a shelf, these offer what that shelf holds and say
              how much of it. Offering "Video" where there is no video is a
              dead end dressed as a choice: you pick it, get nothing back, and
              learn nothing about why. Across the whole library they stay the
              full vocabulary, because there the question is open. */}
          {(!hasFacets || facetDisciplines.size > 0) && (
            <select name="discipline" defaultValue={discipline ?? ''} className={input}>
              <option value="">All disciplines</option>
              {(hasFacets ? CAPABILITY_ORDER.filter((c) => facetDisciplines.has(c)) : CAPABILITY_ORDER).map((c) => (
                <option key={c} value={c}>
                  {CAPABILITY_META[c].label}{hasFacets ? ` (${facetDisciplines.get(c)})` : ''}
                </option>
              ))}
            </select>
          )}
          {/* Derived, not a second tagging job: an offering already says
              which discipline it involves, so this reads the rows tied to it
              and the untied ones that discipline matches. */}
          {!onMedia && (
          <select name="offering" defaultValue={offering ?? ''} className={input}>
            <option value="">All course offerings</option>
            {COURSE_TYPE_OPTIONS.map((g) => (
              <optgroup key={g.category} label={g.label}>
                {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
          )}
          {!onMedia && (
          <select name="venue" defaultValue={venue ?? ''} className={input}>
            <option value="">All venues</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          )}
          <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300 transition-colors">Filter</button>
        </form>

        {/* ── Add ──────────────────────────────────────────────────────── */}
        {/* Documents only — a gear list or schedule is started from its
            own shelf below, where the editor is. */}
        {/* A button, not a line of grey text with a triangle in front of it.
            Adding is the second thing anyone comes here to do and it read as a
            footnote under the filters. */}
        {/* Gear lists holds both shapes, so it takes documents too: a PDF
            that says what to bring is a gear list that was written down, and
            the shelf that holds the structured ones is where somebody goes
            looking for it. The other template shelves build their rows and
            have nothing to file. */}
        {isAdmin && (
          <details className={`mb-6 group ${showDocs || bucket === 'gear' || onMedia ? '' : 'hidden'}`}>
            <summary className="cursor-pointer list-none inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors">
              <span className="text-base leading-none text-zinc-500 group-open:hidden">+</span>
              <span className="hidden text-base leading-none text-zinc-500 group-open:inline">−</span>
              {bucket === 'gear'
                ? 'Add a written gear list — a document or a link'
                : onMedia
                  // Uploading reaches the general album; this is the other
                  // kind of album — a Google Photos link, a Drive folder
                  // somebody keeps themselves — and there was no way to add
                  // one at all. The block that lists them only appeared once
                  // one existed.
                  ? 'Add an album kept somewhere else'
                  : onShelf ? `Add to ${shelfLabel(bucket as LibraryShelf)}` : 'Add an item'}
            </summary>
            <AddLibraryItem
              venues={venues}
              sites={siteOptions}
              defaultBucket={bucket === 'gear' || onMedia ? undefined : bucket}
              defaultKind={bucket === 'gear' ? 'kit_list' : onMedia ? 'media' : undefined}
            />
          </details>
        )}

        {/* The same place on a shelf whose rows are built here rather than
            filed here — a gear list or a running order. */}
        {isAdmin && onShelf && isTemplateShelf(bucket) && bucket !== 'setup' && (
          <div className="mb-6">
            <AddTemplate shelf={bucket} />
          </div>
        )}

        {/* ── Items ────────────────────────────────────────────────────── */}
        {/* ── The shelves ──────────────────────────────────────────────── */}
        {landing && (
          <>
            {/* One grid. The cards were split into "shelves" and "built
                elsewhere" to stop a document being dragged at Gear lists, but
                the line stopped being true the moment Venue information
                started holding maps and beta — which are library rows filed
                to a place. The constraint belongs on the control that moves
                things, where it already is: the group move offers the four
                shelves and nothing else. */}
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
          </>
        )}

        {/* ── Items ────────────────────────────────────────────────────── */}
        {showDocs && (
          <>
            <p className="text-xs text-zinc-600 mb-3">
              {items.length === 0
                ? 'No items'
                : perGroup
                  ? `${items.length} on this shelf`
                  : `Showing ${offset + 1}–${offset + items.length}`}
            </p>
            {(
              <div className="space-y-2">
                {grouped.map(([cat, rows]) => (
                  // Folded, because the headings are the point: what a shelf
                  // holds is the list of kinds on it, and reading that list
                  // should not mean scrolling past three hundred rows to
                  // reach the second heading. One group means nothing to
                  // choose between, so it opens.
                  //
                  // Open, it holds the whole type — not a page of it. That is
                  // what a group is, and the rows are built only once it is
                  // opened, which is what makes holding the whole type free
                  // until somebody wants it.
                  <FoldedGroup
                    key={cat}
                    heading={groupLabel(cat)}
                    count={rows.length}
                    defaultOpen={grouped.length === 1}
                  >
                    {/* The same rows either way. An admin gets the editor,
                        which is a row that can be opened and changed;
                        everyone else gets the row. */}
                    {isAdmin ? (
                      // Ticked rows, not the group: the heading is a type,
                      // and a type is not a destination. What a hand-picked
                      // set can be told is on the bar.
                      <PickSet items={rows} venues={venues} sites={siteOptions} clients={clients} openId={item} />
                    ) : (
                      <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800/70">
                        {rows.map((it) => (
                          <ItemRow key={it.id} item={it} venueName={it.venue_id ? venueName.get(it.venue_id) : null} />
                        ))}
                      </div>
                    )}
                  </FoldedGroup>
                ))}
                {items.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {showTemplates && shelfCount > 0 ? 'No documents match — the shelves below still do.' : 'Nothing here yet.'}
                  </p>
                )}
              </div>
            )}

            {(hasMore || offset > 0) && !perGroup && (
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

        {/* ── Photos & video ───────────────────────────────────────────── */}
        {onMedia && mediaShelf && (
          <MediaShelf
            albums={mediaShelf.albums.filter((a) => albumMatches(a, discipline, q))}
            linked={mediaShelf.linked}
            venues={venues}
            sites={siteOptions}
            discipline={discipline}
            hrefs={{
              '': href({ discipline: undefined }),
              ...Object.fromEntries(CAPABILITY_ORDER.map((c) => [c, href({ discipline: c })])),
            }}
            canUpload={realAdmin || profile?.role === 'instructor'}
            canEdit={isAdmin}
          />
        )}

        {/* ── Venue information ────────────────────────────────────────── */}
        {onPlaces && placesShelf && (
          isAdmin ? (
            <SitesShelf {...placesShelf} />
          ) : (
            // The beta is worth reading to anyone teaching off it; setting up
            // a canyon is not their errand, so they get the rows and none of
            // the forms.
            <div className="space-y-8">
              {placesShelf.sites.filter((x) => x.active).map((x) => (
                <div key={x.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{x.name}</span>
                    {x.kind && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{x.kind}</span>}
                    <span className="text-[11px] text-zinc-600">
                      {placesShelf.venues.find((v) => v.id === x.venue_id)?.name ?? 'no venue'}
                    </span>
                  </div>
                  {x.beta && (
                    <p className="text-xs text-zinc-400 whitespace-pre-line leading-relaxed mt-1.5 max-w-prose">{x.beta}</p>
                  )}
                </div>
              ))}
              {placesShelf.sites.length === 0 && <p className="text-sm text-zinc-500">No sites yet.</p>}
            </div>
          )
        )}

        {/* ── Reusable shelves ─────────────────────────────────────────── */}
        {/* Built in the portal rather than linked to, so these are edited in
            place — the same editors the course page uses, on the template
            itself. Every course keeps its own copy, so a fix here changes what
            the *next* course starts from, never a course already running. */}
        {showTemplates && shelves.map((shelf) => {
          const rows = shelf === 'gear' ? gearTemplates : shelf === 'schedule' ? scheduleTemplates : courseSetups
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
                {/* A setup is a shape imported from Classroom, not something
                    started blank here — there is nothing to add it from. */}
                {isAdmin && shelf !== 'setup' && <AddTemplate shelf={shelf} />}
              </div>
              <div className="space-y-2">
                {/* The written-down kind, first: they are what exists, and
                    the structured ones are what we have started building. */}
                {shelf === 'gear' && isAdmin && kitLists.map((it) => (
                  <LibraryRow key={it.id} item={it} venues={venues} sites={siteOptions} clients={clients} />
                ))}
                {shelf === 'gear' && !isAdmin && kitLists.map((it) => (
                  <ItemRow key={it.id} item={it} venueName={it.venue_id ? venueName.get(it.venue_id) : null} />
                ))}
                {shelf === 'gear' && gearTemplates.map((t) => (
                  isAdmin ? (
                    <TemplateRow
                      key={t.id}
                      shelf="gear"
                      venues={venues}
                      placeSites={siteOptions}
                      clients={clients}
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
                      venues={venues}
                      placeSites={siteOptions}
                      clients={clients}
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
                {shelf === 'setup' && courseSetups.map((t) => (
                  isAdmin
                    ? <CourseSetupRow key={t.id} setup={t} clients={clients} venues={venues} sites={siteOptions} />
                    : <CourseSetupReadOnly key={t.id} setup={t} venues={venues} />
                ))}
                {rows.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {q || discipline
                      ? 'Nothing on this shelf matches.'
                      : shelf === 'setup'
                        ? 'No course setups — these come from the Classroom import.'
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
