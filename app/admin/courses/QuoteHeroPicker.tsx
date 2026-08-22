'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'
import type { HeroChoice } from '@/lib/quote-heroes'
import { updateQuoteHero } from './actions'

// Quote-page hero override, folded behind a compact button so it doesn't
// crowd the Quotes section: the modal shows the photo pool (curated shots +
// gallery uploads) filtered by the same category tabs as the gallery, then
// frames the pick exactly like the instructor avatar editor — drag the
// preview to reposition, slider to zoom. Framing stores as object-position
// "x% y%" + scale text; no photo = automatic (course type → category → default).

const CATEGORY_KEYS = Object.keys(categoryMeta) as ServiceCategory[]

type Props = {
  instanceId: string
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

function parseScale(value: string | null): number {
  const n = value ? parseFloat(value) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export default function QuoteHeroPicker({ instanceId, choices, currentImage, currentPosition, currentScale }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | ServiceCategory>('all')
  const [src, setSrc] = useState<string | null>(currentImage)
  const [pos, setPos] = useState(() => parsePosition(currentPosition))
  const [scale, setScale] = useState(() => parseScale(currentScale))
  const [pending, startTransition] = useTransition()
  const posStart = useRef({ x: 50, y: 50, px: 0, py: 0, w: 1, h: 1 })
  const router = useRouter()

  const currentLabel = currentImage
    ? choices.find((c) => c.value === currentImage)?.label ?? 'Custom photo'
    : 'Automatic'

  // Round so we store tidy strings like "50% 42%"
  const objectPosition = `${Math.round(pos.x)}% ${Math.round(pos.y)}%`
  // Mirror the public render: scale of exactly 1 means "no transform" → store empty
  const scaleValue = scale > 1.0001 ? String(Math.round(scale * 100) / 100) : ''

  const visible = filter === 'all' ? choices : choices.filter((c) => c.categories.includes(filter))

  function openModal() {
    // Fresh session each time, seeded from what's saved.
    setFilter('all')
    setSrc(currentImage)
    setPos(parsePosition(currentPosition))
    setScale(parseScale(currentScale))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function onPick(value: string | null) {
    setSrc(value)
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

  function save() {
    const fd = new FormData()
    fd.set('hero_image', src ?? '')
    fd.set('hero_position', src ? objectPosition : '')
    fd.set('hero_scale', src ? scaleValue : '')
    startTransition(async () => {
      await updateQuoteHero(instanceId, fd)
      // The quote page renders outside the revalidated admin path — refresh
      // whatever page the picker is mounted on so the new framing shows.
      router.refresh()
      setOpen(false)
    })
  }

  const imgStyle: React.CSSProperties = {
    objectPosition,
    transform: scaleValue ? `scale(${scaleValue})` : undefined,
    transformOrigin: objectPosition,
  }

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-xs uppercase tracking-wide rounded border transition-colors cursor-pointer ${
      active
        ? 'bg-pr-red border-pr-red text-white'
        : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
    }`

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg text-xs text-zinc-400 transition-colors cursor-pointer"
      >
        {currentImage && (
          <span className="relative w-10 h-5 rounded overflow-hidden bg-zinc-800 shrink-0">
            <Image src={currentImage} alt="" fill className="object-cover" sizes="40px" />
          </span>
        )}
        <span>Quote page photo: <span className="text-zinc-200">{currentLabel}</span></span>
        <span className="text-zinc-600">change…</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Quote page photo</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Header of the client-facing quote page — automatic uses the course type&apos;s photo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none cursor-pointer"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setFilter('all')} className={tabCls(filter === 'all')}>All</button>
              {CATEGORY_KEYS.map((key) => (
                <button key={key} type="button" onClick={() => setFilter(key)} className={tabCls(filter === key)}>
                  {categoryMeta[key].label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => onPick(null)}
                className={`relative aspect-[4/3] rounded border-2 border-dashed flex items-center justify-center text-center p-2 text-xs transition-colors cursor-pointer ${
                  src === null ? 'border-pr-red text-zinc-200' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                }`}
              >
                Automatic — based on course type
              </button>
              {visible.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onPick(c.value)}
                  title={c.label}
                  className={`group relative aspect-[4/3] rounded overflow-hidden bg-zinc-800 border-2 transition-colors cursor-pointer ${
                    src === c.value ? 'border-pr-red' : 'border-transparent hover:border-zinc-500'
                  }`}
                >
                  <Image src={c.value} alt={c.label} fill className="object-cover" sizes="(max-width: 640px) 33vw, 180px" />
                  <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] leading-tight text-white text-left bg-gradient-to-t from-black/80 to-transparent truncate">
                    {c.label}
                  </span>
                </button>
              ))}
              {visible.length === 0 && (
                <p className="col-span-full py-6 text-center text-xs text-zinc-500">No photos in this category yet.</p>
              )}
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
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    Reset framing
                  </button>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors cursor-pointer"
              >
                {pending ? 'Saving…' : 'Save photo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
