import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SitesShelf from './SitesShelf'
import { loadSitesShelf } from './load'
import InfoHint from '@/components/InfoHint'
import { shelfLink } from '@/lib/library'

// The sites shelf at its own address.
//
// It is also a shelf inside the library, which is where someone goes looking
// for material — a canyon's beta is material, it just isn't a link. This page
// stays because the "Edit beta" button on a schedule day deep-links to a row
// here, and because a screen reached two ways should be one screen: both
// render the same component rather than drifting apart the way the library
// and the old instructor reference page did.
export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>
}) {
  const { added } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const shelf = await loadSitesShelf()

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href={shelfLink('venue').href} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Library</Link>

        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Venue information
          <InfoHint text="A site's beta is written once and shown live on every schedule day that points at it — correcting a rap count here corrects it everywhere. What's only true of one day stays in that day's notes." />
        </h1>
        <p className="text-zinc-400 mt-1 mb-8">The canyons, crags and towers a day happens at — with the maps, weather and contacts for the areas they sit in.</p>

        <SitesShelf {...shelf} added={added} />
      </div>
    </main>
  )
}
