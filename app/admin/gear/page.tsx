import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import GearCatalog from './GearCatalog'

export const dynamic = 'force-dynamic'

export default async function GearCatalogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: items }, { data: entries }, { data: lists }] = await Promise.all([
    admin.from('gear_items')
      .select('id, name, info, recommended, url, category, parent_id, aliases, active')
      .eq('active', true)
      .order('name'),
    admin.from('gear_list_entries').select('gear_item_id'),
    admin.from('gear_lists').select('id, name, audience, is_template, course_type, gear_list_entries(id)').eq('is_template', true),
  ])

  // "Unused" is the safe-to-retire signal, so it has to count real usage.
  const uses = new Map<string, number>()
  for (const e of entries ?? []) {
    if (e.gear_item_id) uses.set(e.gear_item_id, (uses.get(e.gear_item_id) ?? 0) + 1)
  }
  const rows = (items ?? []).map((i) => ({ ...i, aliases: i.aliases ?? [], uses: uses.get(i.id) ?? 0 }))

  const templates = (lists ?? []) as unknown as {
    id: string; name: string; audience: string; course_type: string | null; gear_list_entries: unknown[]
  }[]

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Admin</Link>

        <h1 className="text-2xl font-bold mb-1">Gear catalog</h1>
        <p className="text-sm text-zinc-500 mb-8">
          Gear is two levels: a <strong className="text-zinc-400">type</strong> is what a list needs — a descent device —
          and a <strong className="text-zinc-400">model</strong> is a product that satisfies it. Lists name whichever level
          they mean, so the same kit doesn’t end up in the catalog three times under three names.
        </p>

        <GearCatalog items={rows} />

        {templates.length > 0 && (
          <section className="mt-12 pt-8 border-t border-zinc-800">
            <h2 className="text-lg font-semibold mb-3">Saved templates</h2>
            <div className="space-y-1">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm">
                  <span>{t.name}</span>
                  <span className="text-[11px] text-zinc-500">{t.audience}</span>
                  {t.course_type && <span className="text-[11px] text-zinc-600">{t.course_type}</span>}
                  <span className="ml-auto text-[11px] text-zinc-600">{t.gear_list_entries.length} items</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
