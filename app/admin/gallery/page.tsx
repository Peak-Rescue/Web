import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadGalleryImages, updateGalleryCaption, deleteGalleryImage } from './actions'
import { UploadButton } from './UploadButton'

type GalleryImage = {
  id: string
  url: string
  caption: string | null
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
    .select('id, url, caption, created_at')
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
            Couldn&apos;t load the gallery — the <code>gallery_images</code> table or <code>gallery</code> bucket
            may not exist yet. Run migration 036 against the database.
          </div>
        )}

        {/* Upload */}
        <form action={uploadGalleryImages} className="p-6 bg-zinc-900 rounded-lg border border-zinc-800 mb-10 space-y-3">
          <label className="block text-sm font-medium">Add photos</label>
          <input
            type="file"
            name="photos"
            accept="image/*"
            multiple
            required
            className="block text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 file:cursor-pointer transition-colors"
          />
          <p className="text-xs text-zinc-600">JPG or PNG, up to 15 MB each. You can select multiple.</p>
          <UploadButton />
        </form>

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
                <div className="p-3 space-y-2">
                  <form action={updateGalleryCaption.bind(null, img.id)} className="flex gap-2">
                    <input
                      type="text"
                      name="caption"
                      defaultValue={img.caption ?? ''}
                      placeholder="Add a caption (optional)"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                    />
                    <button type="submit" className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors cursor-pointer">
                      Save
                    </button>
                  </form>
                  <div className="flex justify-end">
                    <form action={deleteGalleryImage.bind(null, img.id)}>
                      <button type="submit" className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
