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

  const [{ data: items }, { data: entries }, { count: templateCount }] = await Promise.all([
    admin.from('gear_items')
      .select('id, name, brand, url, category, parent_id, aliases, disciplines, active')
      .eq('active', true)
      .order('name'),
    admin.from('gear_list_entries').select('gear_item_id'),
    // Saved lists are browsed and edited on the library's equipment shelf, not
    // here — this page is the catalog the lists draw from.
    admin.from('gear_lists').select('id', { count: 'exact', head: true }).eq('is_template', true),
  ])

  // "Unused" is the safe-to-retire signal, so it has to count real usage.
  const uses = new Map<string, number>()
  for (const e of entries ?? []) {
    if (e.gear_item_id) uses.set(e.gear_item_id, (uses.get(e.gear_item_id) ?? 0) + 1)
  }
  const rows = (items ?? []).map((i) => ({ ...i, aliases: i.aliases ?? [], uses: uses.get(i.id) ?? 0 }))

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

        <section className="mt-12 pt-8 border-t border-zinc-800">
          <h2 className="text-lg font-semibold mb-1">Saved equipment lists</h2>
          <p className="text-sm text-zinc-500">
            {templateCount
              ? `${templateCount} reusable list${templateCount === 1 ? '' : 's'} live on the library's equipment shelf, where they can be edited, retagged and retired.`
              : 'Reusable lists live on the library’s equipment shelf. There aren’t any yet — start one there, or save one from a course.'}
          </p>
          <Link
            href="/admin/library?bucket=gear&status=all"
            className="mt-3 inline-block text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
          >
            Open the equipment shelf
          </Link>
        </section>
      </div>
    </main>
  )
}
