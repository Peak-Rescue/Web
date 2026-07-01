import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Follow along with Peak Rescue operations, training, and expeditions.',
}

export const dynamic = 'force-dynamic'

const CATEGORY_KEYS = Object.keys(categoryMeta) as ServiceCategory[]

type GalleryImage = { id: string; url: string; caption: string | null; categories: string[] | null }

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const active = CATEGORY_KEYS.includes(category as ServiceCategory) ? (category as ServiceCategory) : null

  const { data } = await createAdminClient()
    .from('gallery_images')
    .select('id, url, caption, categories')
    .order('created_at', { ascending: false })

  const all = (data ?? []) as GalleryImage[]
  const images = active ? all.filter(img => img.categories?.includes(active)) : all

  const tabClass = (isActive: boolean) =>
    `px-4 py-2 text-xs font-display font-600 tracking-widest uppercase transition-colors border ${
      isActive
        ? 'bg-pr-red border-pr-red text-white'
        : 'border-white/15 text-pr-muted hover:text-pr-text hover:border-white/30'
    }`

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
          {all.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10">
              <Link href="/gallery" className={tabClass(active === null)}>All</Link>
              {CATEGORY_KEYS.map(key => (
                <Link key={key} href={`/gallery?category=${key}`} className={tabClass(active === key)}>
                  {categoryMeta[key].label}
                </Link>
              ))}
            </div>
          )}

          {images.length === 0 ? (
            <p className="text-pr-muted text-center">
              {all.length === 0 ? 'Photos coming soon.' : 'No photos in this category yet.'}
            </p>
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
