'use client'

import { useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import CloseButton from '@/components/CloseButton'

export type LightboxItem = {
  url: string
  caption?: string | null
  /** A video plays here rather than showing its poster frame. `poster` is that
      frame, so there is something to look at before the first byte arrives. */
  kind?: 'image' | 'video'
  poster?: string
}

// Full-screen view of one photo out of a set.
//
// Controlled by the parent: `index` is the photo being shown, null is closed.
// The parent owns it because the set is the parent's — a grid, a course album —
// and the way in is always a click on one of its tiles.
//
// Every way out people try: the close mark, Escape, and the backdrop. Every way
// through: arrow keys, the edge buttons, and a swipe, because half of these are
// looked at on a phone.
export default function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  unoptimized = false,
}: {
  items: LightboxItem[]
  index: number | null
  onIndexChange: (next: number) => void
  onClose: () => void
  /** Set when the photos come from a route that authenticates the viewer. The
      image optimizer fetches on the server without the viewer's cookies, so an
      optimized private URL comes back 401 — and the picture is already sized
      by whoever is serving it. */
  unoptimized?: boolean
}) {
  const open = index !== null && index >= 0 && index < items.length

  // Wrap rather than stop at the ends: at photo 40 of 40 the next press is
  // much more likely to mean "keep going" than "nothing happens".
  const step = useCallback(
    (delta: number) => {
      if (index === null || items.length < 2) return
      onIndexChange((index + delta + items.length) % items.length)
    },
    [index, items.length, onIndexChange],
  )

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, step])

  // The page behind must not scroll while this is up — on a phone a vertical
  // swipe at the photo would otherwise scroll the grid underneath it.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Pointer events, not touch events: one code path covers a finger, a pen and
  // a mouse drag, and it is the same gesture handling used elsewhere here.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null)

  if (!open) return null
  const item = items[index]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
      onPointerDown={(e) => {
        swipeFrom.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const from = swipeFrom.current
        swipeFrom.current = null
        if (!from) return
        const dx = e.clientX - from.x
        // Only a decisively horizontal drag counts, so a fumbled tap or a
        // vertical flick doesn't skip the photo someone is looking at.
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - from.y)) step(dx < 0 ? 1 : -1)
      }}
    >
      <div className="flex items-center justify-between gap-4 p-4 text-xs text-white/60">
        <span>{items.length > 1 ? `${index + 1} / ${items.length}` : ''}</span>
        <CloseButton onClick={onClose} label="Close photo" className="text-white/60 hover:bg-white/10" />
      </div>

      <div className="relative flex-1 min-h-0" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'video' ? (
          // The player swallows pointer events so dragging the scrubber isn't
          // read as a swipe to the next photo. Photos keep the swipe — they
          // have nothing to drag.
          <div
            className="absolute inset-0"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {/* Keyed by url so switching clips tears down the old player rather
                than swapping a source under it, which leaves the last frame up
                and the controls describing the wrong video.

                No autoplay: a course video has sound worth hearing, and a
                browser blocks an unmuted autoplay anyway — so it would land on
                a dead frame rather than the poster. */}
            <video
              key={item.url}
              src={item.url}
              poster={item.poster}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <Image
            key={item.url}
            src={item.url}
            alt={item.caption ?? 'Peak Rescue photo'}
            fill
            sizes="100vw"
            unoptimized={unoptimized}
            className="object-contain"
          />
        )}
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation()
              step(-1)
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white transition-colors"
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation()
              step(1)
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white transition-colors"
          >
            <Chevron dir="right" />
          </button>
        </>
      )}

      {item.caption && (
        <p
          className="px-6 py-4 text-center text-sm text-white/70"
          onClick={(e) => e.stopPropagation()}
        >
          {item.caption}
        </p>
      )}
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}
