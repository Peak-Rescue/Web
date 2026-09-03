import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KIND_META, type LibraryKind } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory } from '@/lib/capabilities'
import InfoHint from '@/components/InfoHint'
import { todayHere } from '@/lib/course-clock'

// A shape-of-the-library view: what exists at each level, and — more useful —
// what doesn't. Counting rows tells you nothing about whether the canyon set
// has a rescue section or whether a venue has its permits.

type Row = {
  id: string
  title: string
  kind: string
  audience: string
  disciplines: string[]
  topics: string[]
  venue_id: string | null
  status: string
  expires_at: string | null
  url: string | null
  source_class: string | null
}

// What a venue pack is expected to carry. Absence is the point of the view.
const VENUE_EXPECTED: { kind: LibraryKind; label: string }[] = [
  { kind: 'map', label: 'Map' },
  { kind: 'permit', label: 'Permits' },
  { kind: 'rescue_plan', label: 'Rescue plan' },
  { kind: 'reference', label: 'Local info' },
]

export default async function LibraryOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: itemRows }, { data: venueRows }] = await Promise.all([
    admin
      .from('library_items')
      .select('id, title, kind, audience, disciplines, topics, venue_id, status, expires_at, url, source_class')
      .neq('status', 'archived')
      .limit(2000),
    admin.from('venues').select('id, name, region').order('name'),
  ])
  const items = (itemRows ?? []) as Row[]
  const venues = (venueRows ?? []) as { id: string; name: string; region: string | null }[]

  const cleanTopics = (r: Row) => r.topics.filter((t) => t !== 'needs-link-check')
  const today = todayHere()

  // ── Expertise → sections ────────────────────────────────────────────────
  const byDiscipline = CAPABILITY_ORDER.map((cat) => {
    const mine = items.filter((i) => i.disciplines.includes(cat))
    const sections = new Map<string, Row[]>()
    for (const i of mine) {
      const t = cleanTopics(i)[0] ?? 'Untagged'
      sections.set(t, [...(sections.get(t) ?? []), i])
    }
    return {
      cat,
      total: mine.length,
      pending: mine.filter((i) => i.status === 'pending').length,
      sections: [...sections.entries()].sort((a, b) => b[1].length - a[1].length),
    }
  })

  const untagged = items.filter((i) => i.disciplines.length === 0)

  // ── Attention list ──────────────────────────────────────────────────────
  const flags = [
    { label: 'Waiting for review', n: items.filter((i) => i.status === 'pending').length, href: '/admin/library?status=pending' },
    { label: 'No expertise tag', n: untagged.length, href: '/admin/library?status=all' },
    { label: 'Link may be dead', n: items.filter((i) => i.topics.includes('needs-link-check')).length, href: '/admin/library?status=all' },
    { label: 'No link at all', n: items.filter((i) => !i.url).length, href: '/admin/library?status=all' },
    { label: 'Expired', n: items.filter((i) => i.expires_at && i.expires_at < today).length, href: '/admin/library?status=all&kind=permit' },
  ].filter((f) => f.n > 0)

  const card = 'bg-zinc-900 border border-zinc-800 rounded-lg'

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link href="/admin/library" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Library
        </Link>

        <h1 className="text-2xl font-bold">Library coverage</h1>
        <p className="text-zinc-400 mt-1 mb-8 text-sm max-w-2xl">
          What exists at each level, and where the holes are.
        </p>

        {flags.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-zinc-400 mb-2">Needs attention</h2>
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <Link
                  key={f.label}
                  href={f.href}
                  className={`${card} px-3 py-2 hover:border-zinc-600 transition-colors`}
                >
                  <span className="text-lg font-bold">{f.n}</span>
                  <span className="text-xs text-zinc-400 ml-2">{f.label}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── By expertise ──────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">By expertise — sections and depth</h2>
          <div className="space-y-2">
            {byDiscipline.map((d) => (
              <details key={d.cat} className={`${card} group`} open={d.total > 0}>
                <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center gap-3 flex-wrap">
                  <span className="text-zinc-600 text-xs transition-transform group-open:rotate-90">▶</span>
                  <span className="font-medium text-sm">{CAPABILITY_META[d.cat as CapabilityCategory].label}</span>
                  {d.total === 0 ? (
                    <span className="text-xs text-yellow-500/80">no material yet</span>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {d.total} item{d.total === 1 ? '' : 's'} · {d.sections.length} section
                      {d.sections.length === 1 ? '' : 's'}
                      {d.pending > 0 && <span className="text-yellow-500/80"> · {d.pending} pending</span>}
                    </span>
                  )}
                </summary>
                {d.sections.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {d.sections.map(([name, rows]) => {
                      const shared = rows.filter((r) => r.audience === 'shared').length
                      return (
                        <span
                          key={name}
                          title={`${rows.length} item${rows.length === 1 ? '' : 's'} — ${shared} visible to students`}
                          className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300"
                        >
                          {name} <span className="text-zinc-500">{rows.length}</span>
                          {shared === 0 && <span className="text-zinc-600 ml-1">· internal</span>}
                        </span>
                      )
                    })}
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>

        {/* ── By venue ──────────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-zinc-400 mb-1">By venue — what each pack is missing</h2>
          <p className="text-xs text-zinc-600 mb-3">
            Dimmed means nothing of that kind is filed against the venue yet.
          </p>
          <div className={`${card} divide-y divide-zinc-800`}>
            {venues.map((v) => {
              const mine = items.filter((i) => i.venue_id === v.id)
              return (
                <div key={v.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                  <Link href={`/admin/library?status=all&venue=${v.id}`} className="text-sm hover:text-pr-red-light transition-colors">
                    {v.name}
                  </Link>
                  {v.region && <span className="text-[11px] text-zinc-600">{v.region}</span>}
                  <div className="ml-auto flex items-center gap-1.5">
                    {VENUE_EXPECTED.map((e) => {
                      const n = mine.filter((i) => i.kind === e.kind).length
                      return (
                        <span
                          key={e.kind}
                          title={n ? `${n} ${KIND_META[e.kind].toLowerCase()}` : `No ${e.label.toLowerCase()} yet`}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            n ? 'bg-teal-900/40 text-teal-300' : 'bg-zinc-800/60 text-zinc-700'
                          }`}
                        >
                          {e.label}{n ? ` ${n}` : ''}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {venues.length === 0 && <p className="px-4 py-3 text-sm text-zinc-500">No venues yet.</p>}
          </div>
        </section>

        {untagged.length > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 mb-2">
              Not tied to any expertise ({untagged.length})
              <InfoHint text="These never surface as suggestions on a course — only by search or their Classroom class. Company documents belong here; teaching material probably doesn't." />
            </h2>
            <div className={`${card} px-4 py-3 text-xs text-zinc-500 space-y-1`}>
              {[...new Set(untagged.map((i) => i.source_class ?? 'Added in the portal'))].map((c) => (
                <p key={c}>
                  {c} <span className="text-zinc-700">· {untagged.filter((i) => (i.source_class ?? 'Added in the portal') === c).length}</span>
                </p>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
