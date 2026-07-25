'use client'

import { useEffect, useRef, useState } from 'react'
import type { HeroChoice } from '@/lib/quote-heroes'

// Quote-page hero override: pick a photo from the site's pool, then frame it
// exactly like the instructor avatar editor — drag the preview to reposition,
// slider to zoom. Framing stores as object-position "x% y%" + scale text;
// empty image = automatic (course type photo → category → default).

type Props = {
  choices: HeroChoice[]
  currentImage: string | null
  currentPosition: string | null
  currentScale: string | null
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

function parsePosition(value: string | null): { x: number; y: number } {
  if (!value) return { x: 50, y: 50 }
  const m = value.match(/([\d.]+)%\s+([\d.]+)%/)
  if (!m) return { x: 50, y: 50 }
  return { x: clamp(parseFloat(m[1])), y: clamp(parseFloat(m[2])) }
}

export default function HeroImagePicker({ choices, currentImage, currentPosition, currentScale }: Props) {
  const [src, setSrc] = useState<string | null>(currentImage)
  const [pos, setPos] = useState(() => parsePosition(currentPosition))
  const [scale, setScale] = useState(() => {
    const n = currentScale ? parseFloat(currentScale) : 1
    return Number.isFinite(n) && n >= 1 ? n : 1
  })
  const posStart = useRef({ x: 50, y: 50, px: 0, py: 0, w: 1, h: 1 })
  const posInputRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)

  // Round so we store tidy strings like "50% 42%"
  const objectPosition = `${Math.round(pos.x)}% ${Math.round(pos.y)}%`
  // Mirror the public render: scale of exactly 1 means "no transform" → store empty
  const scaleValue = scale > 1.0001 ? String(Math.round(scale * 100) / 100) : ''

  // React sets hidden-input values directly without firing DOM events, so
  // dispatch a bubbling input event when framing changes — this lets the
  // enclosing AutoSaveForm notice drag/zoom edits.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    posInputRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
  }, [objectPosition, scaleValue])

  function onPick(value: string) {
    setSrc(value || null)
    // New photo, fresh framing.
    setPos({ x: 50, y: 50 })
    setScale(1)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!src) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    posStart.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY, w: rect.width, h: rect.height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!src || e.buttons === 0) return
    const s = posStart.current
    // Drag the photo: moving the pointer right reveals the left of the image,
    // so object-position X decreases. Same for vertical.
    const nx = clamp(s.x - ((e.clientX - s.px) / s.w) * 100)
    const ny = clamp(s.y - ((e.clientY - s.py) / s.h) * 100)
    setPos({ x: nx, y: ny })
  }

  const imgStyle: React.CSSProperties = {
    objectPosition,
    transform: scaleValue ? `scale(${scaleValue})` : undefined,
    transformOrigin: objectPosition,
  }

  return (
    <div className="space-y-3">
      {/* Hidden framing inputs submitted with the form */}
      <input ref={posInputRef} type="hidden" name="hero_position" value={src ? objectPosition : ''} />
      <input type="hidden" name="hero_scale" value={src ? scaleValue : ''} />

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Quote page photo</label>
        <select
          name="hero_image"
          value={src ?? ''}
          onChange={(e) => onPick(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
        >
          <option value="">Automatic — based on course type</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {src && (
        <>
          {/* Live preview at the quote hero's wide crop */}
          <figure className="space-y-1">
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              className="relative w-full aspect-[3/1] overflow-hidden rounded-lg bg-zinc-800 border border-zinc-700 touch-none select-none cursor-grab active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={imgStyle} />
            </div>
            <figcaption className="text-[10px] uppercase tracking-wide text-zinc-600 text-center">
              Quote hero preview — drag to reposition
            </figcaption>
          </figure>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 w-10">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="flex-1 accent-zinc-400"
            />
            <span className="text-xs text-zinc-500 w-10 tabular-nums">{scale.toFixed(2)}×</span>
            <button
              type="button"
              onClick={() => { setPos({ x: 50, y: 50 }); setScale(1) }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Reset framing
            </button>
          </div>
        </>
      )}
    </div>
  )
}
