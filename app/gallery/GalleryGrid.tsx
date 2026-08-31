'use client'

import { useState } from 'react'
import Image from 'next/image'
import Lightbox from '@/components/Lightbox'

export type GalleryTile = { id: string; url: string; caption: string | null }

// The grid exists as a client component only to hold which tile is open. The
// page around it stays on the server, and so does the query behind it.
export default function GalleryGrid({ images }: { images: GalleryTile[] }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
        {images.map((img, i) => (
          <figure key={img.id} className="group relative aspect-[4/3] overflow-hidden bg-pr-surface">
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={img.caption ? `Enlarge: ${img.caption}` : 'Enlarge photo'}
              className="absolute inset-0 z-10 cursor-zoom-in"
            />
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

      <Lightbox items={images} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </>
  )
}
