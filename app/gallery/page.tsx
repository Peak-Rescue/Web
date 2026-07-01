import type { Metadata } from 'next'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Follow along with Peak Rescue operations, training, and expeditions.',
}

export const dynamic = 'force-dynamic'

type GalleryImage = { id: string; url: string; caption: string | null }

export default async function GalleryPage() {
  const { data } = await createAdminClient()
    .from('gallery_images')
    .select('id, url, caption')
    .order('created_at', { ascending: false })

  const images = (data ?? []) as GalleryImage[]

  return (
    <>
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06]">
        <div className="site-container">
          <span className="section-label">Follow Along</span>
          <h1 className="display-lg mt-3 text-pr-text">Gallery</h1>
          <p className="mt-4 text-pr-muted max-w-xl leading-relaxed">
            Operations, training, and expeditions — as they happen.
          </p>
        </div>
      </div>

      <div className="py-20 bg-pr-bg">
        <div className="site-container">
          {images.length === 0 ? (
            <p className="text-pr-muted text-center">Photos coming soon.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
              {images.map(img => (
                <figure key={img.id} className="group relative aspect-[4/3] overflow-hidden bg-pr-surface">
                  <Image
                    src={img.url}
                    alt={img.caption ?? 'Peak Rescue gallery photo'}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 33vw"
                  />
                  {img.caption && (
                    <figcaption className="absolute inset-x-0 bottom-0 p-3 text-xs text-white bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      {img.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
