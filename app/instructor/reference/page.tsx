import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KIND_META, LIBRARY_KINDS, type LibraryItem, type Venue } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory } from '@/lib/capabilities'

// The reference path: everything in the library, browsable by staff, with no
// course attached. Classroom was doing double duty as a filing cabinet, and
// that need is real — instructors look things up (tech notes, manuals,
// standards, venue beta) outside of any course they're running. Course content
// and company policy have their own homes; this is the third.

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'

export default async function ReferencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; discipline?: string; kind?: string; venue?: string; page?: string }>
}) {
  const { q, discipline, kind, venue, page } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  // A page of results, not the whole shelf: 800+ rows on every visit cost
  // about half a second to render a list nobody reads end to end.
  const PAGE = 60
  const offset = Math.max(0, Number(page ?? '0')) * PAGE

  let query = admin
    .from('library_items')
    .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, venue_id, expires_at, status, source_class, source_topic, source_item')
    .eq('status', 'published')
    .order('title')
    // One extra row tells us whether there's a next page — an exact count
    // costs a full table scan and we only need "is there more".
    .range(offset, offset + PAGE)

  if (discipline) query = query.contains('disciplines', [discipline])
  if (kind) query = query.eq('kind', kind)
  if (venue) query = query.eq('venue_id', venue)
  if (q) query = query.ilike('title', `%${q}%`)

  const [{ data: itemRows }, { data: venueRows }] = await Promise.all([
    query,
    admin.from('venues').select('id, name, region, client_name, notes, active').order('name'),
  ])
  const fetched = (itemRows ?? []) as LibraryItem[]
  const hasMore = fetched.length > PAGE
  const items = hasMore ? fetched.slice(0, PAGE) : fetched
  const venues = (venueRows ?? []) as Venue[]
  const venueName = new Map(venues.map((v) => [v.id, v.name]))

  // Group by discipline so the shelf has an order; untagged material last.
  const byDiscipline = new Map<string, LibraryItem[]>()
  for (const i of items) {
    const keys = i.disciplines.length ? i.disciplines : ['_untagged']
    for (const k of keys) byDiscipline.set(k, [...(byDiscipline.get(k) ?? []), i])
  }
  const ordered = [
    ...CAPABILITY_ORDER.filter((c) => byDiscipline.has(c)).map((c) => [c, byDiscipline.get(c)!] as const),
    ...(byDiscipline.has('_untagged') ? [['_untagged', byDiscipline.get('_untagged')!] as const] : []),
  ]

  const filtered = Boolean(q || discipline || kind || venue)

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>

        <h1 className="text-2xl font-bold">Reference</h1>
        <p className="text-zinc-400 mt-1 mb-6 text-sm max-w-2xl">
          Everything in the library — teaching material, manuals, standards, venue beta — browsable outside any
          course. Policies and paperwork live in{' '}
          <Link href="/admin/employee-info" className="underline hover:text-zinc-200">Employee Documents</Link>.
        </p>

        <form className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6" action="/instructor/reference">
          <input name="q" defaultValue={q ?? ''} placeholder="Search…" className={input} />
          <select name="discipline" defaultValue={discipline ?? ''} className={input}>
            <option value="">All expertise</option>
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
          <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300 transition-colors">
            Filter
          </button>
        </form>

        {items.length === 0 && (
          <p className="text-sm text-zinc-500">
            {filtered ? 'Nothing matches those filters.' : 'Nothing published to the library yet.'}
          </p>
        )}

        {items.length > 0 && (
          <p className="text-xs text-zinc-600 mb-3">
            Showing {offset + 1}–{offset + items.length}
          </p>
        )}

        <div className="space-y-8">
          {ordered.map(([cat, rows]) => (
            <section key={cat}>
              <h2 className="text-sm font-semibold text-zinc-400 mb-2">
                {cat === '_untagged' ? 'Not tied to an expertise' : CAPABILITY_META[cat as CapabilityCategory].label}
                <span className="text-zinc-600 font-normal ml-2">{rows.length}</span>
              </h2>
              <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800/70">
                {rows.map((i) => (
                  <div key={`${cat}-${i.id}`} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {i.url ? (
                          <a
                            href={
                              i.drive_file_id || /drive\.google\.com|docs\.google\.com/.test(i.url)
                                ? `/api/library/${i.id}`
                                : i.url
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium hover:text-pr-red-light transition-colors truncate"
                          >
                            {i.title}
                          </a>
                        ) : (
                          <span className="text-sm font-medium truncate">{i.title}</span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                          {KIND_META[i.kind as keyof typeof KIND_META] ?? i.kind}
                        </span>
                        {i.venue_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 shrink-0">
                            {venueName.get(i.venue_id)}
                          </span>
                        )}
                        {i.audience === 'internal' && <AudiencePills audience="internal" className="shrink-0" />}
                      </div>
                      {(i.description || i.topics.length > 0) && (
                        <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
                          {i.description ?? i.topics.filter((t) => t !== 'needs-link-check').join(', ')}
                        </p>
                      )}
                    </div>
                    {i.edit_url && (
                      <a
                        href={i.edit_url}
                        target="_blank"
                        rel="noreferrer"
                        title="The team's copy — never shown to participants"
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        instructors
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {(hasMore || offset > 0) && (
          <div className="flex items-center gap-3 mt-8">
            {offset > 0 && (
              <Link
                href={`/instructor/reference?${new URLSearchParams({ ...(q ? { q } : {}), ...(discipline ? { discipline } : {}), ...(kind ? { kind } : {}), ...(venue ? { venue } : {}), page: String(Number(page ?? '0') - 1) })}`}
                className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
              >
                ← Previous
              </Link>
            )}
            {hasMore && (
              <Link
                href={`/instructor/reference?${new URLSearchParams({ ...(q ? { q } : {}), ...(discipline ? { discipline } : {}), ...(kind ? { kind } : {}), ...(venue ? { venue } : {}), page: String(Number(page ?? '0') + 1) })}`}
                className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
