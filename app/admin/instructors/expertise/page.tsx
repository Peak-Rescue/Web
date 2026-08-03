import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ExpertiseGrid, { type GridRow } from './ExpertiseGrid'
import { type CapabilityRole } from '@/lib/capabilities'

export default async function ExpertiseGridPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data } = await admin
    .from('instructors')
    .select('id, name, sectors, instructor_capabilities(category, role)')
    .eq('active', true)
    .order('name')

  const rows: GridRow[] = (data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    sectors: (i.sectors ?? []) as string[],
    caps: Object.fromEntries(
      ((i.instructor_capabilities ?? []) as { category: string; role: CapabilityRole }[])
        .map((c) => [c.category, c.role])
    ),
  }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-full mx-auto px-4 py-10">
        <Link href="/admin/instructors" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← All instructors
        </Link>

        <h1 className="text-2xl font-bold">Expertise &amp; Sector</h1>
        <p className="text-zinc-400 mt-1 mb-6 max-w-3xl text-sm">
          The whole roster in one grid. Staffing needs both: the right skill, and clearance for the client type —
          so someone signed off in Swift Water can run a military water course only if they&rsquo;re also cleared
          for military work.
        </p>

        <ExpertiseGrid rows={rows} />
      </div>
    </main>
  )
}
