import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createVenue } from '../library/actions'
import VenueRow from './VenueRow'
import RegionSelect from '@/components/RegionSelect'
import { type Venue } from '@/lib/library'

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-xs text-zinc-400 mb-1'

export default async function VenuesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: venueRows }, { data: counts }] = await Promise.all([
    admin.from('venues').select('id, name, region, client_name, notes, active').order('name'),
    admin.from('library_items').select('venue_id').not('venue_id', 'is', null),
  ])

  const venues = (venueRows ?? []) as Venue[]
  const itemCount = new Map<string, number>()
  for (const r of counts ?? []) {
    const k = r.venue_id as string
    itemCount.set(k, (itemCount.get(k) ?? 0) + 1)
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/admin/library?status=all" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Library</Link>

        <h1 className="text-2xl font-bold">Venues</h1>
        <p className="text-zinc-400 mt-1 mb-8">
          Places you run courses and standing client sites. Maps, permits, lodging and rescue plans attach here once —
          setting a course&rsquo;s venue pulls them in automatically.
        </p>

        <div className="space-y-2 mb-10">
          {venues.map((v) => <VenueRow key={v.id} venue={v} itemCount={itemCount.get(v.id) ?? 0} />)}
          {venues.length === 0 && <p className="text-sm text-zinc-500">No venues yet.</p>}
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            <span className="text-zinc-600 mr-2 inline-block transition-transform group-open:rotate-90">▶</span>
            Add a venue
          </summary>
          <form action={createVenue} className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Name *</label>
              <input name="name" required className={input} placeholder="Dingford Creek" />
            </div>
            <div>
              <label className={label}>Region</label>
              <input name="region" className={input} placeholder="North Bend, WA" />
            </div>
            <div>
              <label className={label}>State / country</label>
              <RegionSelect name="region_code" className={input} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Client (for standing client sites)</label>
              <input name="client_name" className={input} placeholder="e.g. Icy Straight Point" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Notes</label>
              <textarea name="notes" rows={2} className={`${input} resize-y`} />
            </div>
            <div className="sm:col-span-2">
              <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                Add venue
              </button>
            </div>
          </form>
        </details>
      </div>
    </main>
  )
}
