import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'
import { updateGalleryImage, deleteGalleryImage } from './actions'
import { GalleryUploader } from './GalleryUploader'

const CATEGORY_KEYS = Object.keys(categoryMeta) as ServiceCategory[]

type GalleryImage = {
  id: string
  url: string
  caption: string | null
  categories: string[] | null
  created_at: string
}

function CategoryCheckboxes({ selected }: { selected?: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {CATEGORY_KEYS.map(key => (
        <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            name="categories"
            value={key}
            defaultChecked={selected?.includes(key)}
            className="accent-pr-red cursor-pointer"
          />
          {categoryMeta[key].label}
        </label>
      ))}
    </div>
  )
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
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Admin</Link>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {images.map(img => (
              <div key={img.id} className="rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
                <div className="relative aspect-[4/3] bg-zinc-800">
                  <Image src={img.url} alt={img.caption ?? ''} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
                </div>
                <form action={updateGalleryImage.bind(null, img.id)} className="p-3 space-y-3">
                  <input
                    type="text"
                    name="caption"
                    defaultValue={img.caption ?? ''}
                    placeholder="Add a caption (optional)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                  />
                  <CategoryCheckboxes selected={img.categories ?? []} />
                  <div className="flex items-center justify-between">
                    <button type="submit" className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors cursor-pointer">
                      Save
                    </button>
                    <button
                      type="submit"
                      formAction={deleteGalleryImage.bind(null, img.id)}
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
