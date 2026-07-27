import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GalleryUploader } from './GalleryUploader'
import { GalleryEditor } from './GalleryEditor'

type GalleryImage = {
  id: string
  url: string
  caption: string | null
  categories: string[] | null
  created_at: string
}

export default async function AdminGalleryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data, error } = await admin
    .from('gallery_images')
    .select('id, url, caption, categories, created_at')
    .order('created_at', { ascending: false })

  const images = (data ?? []) as GalleryImage[]

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-1">Gallery</h1>
        <p className="text-zinc-400 mb-8">Photos shown on the public gallery page.</p>

        {error && (
          <div className="p-4 rounded-lg bg-yellow-900/30 border border-yellow-800 text-sm text-yellow-200 mb-6">
            Couldn&apos;t load the gallery — the <code>gallery_images</code> table/column or <code>gallery</code>
            bucket may not exist yet. Run migrations 036 and 037 against the database.
          </div>
        )}

        {/* Upload — direct-to-storage so large/bulk uploads bypass the request size limit */}
        <GalleryUploader />

        {/* Existing images */}
        {images.length === 0 ? (
          <p className="text-zinc-500 text-sm">No photos yet — add some above.</p>
        ) : (
          <GalleryEditor images={images} />
        )}
      </div>
    </main>
  )
}
