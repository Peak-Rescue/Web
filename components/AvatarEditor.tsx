'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  name: string
  currentAvatar: string | null
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

export default function AvatarEditor({ name, currentAvatar, currentPosition, currentScale }: Props) {
  const [src, setSrc] = useState<string | null>(currentAvatar)
  const [pos, setPos] = useState(() => parsePosition(currentPosition))
  const [scale, setScale] = useState(() => {
    const n = currentScale ? parseFloat(currentScale) : 1
    return Number.isFinite(n) && n >= 1 ? n : 1
  })
  const posStart = useRef({ x: 50, y: 50, px: 0, py: 0, w: 1, h: 1 })
  const posInputRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)

  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2)

  // Round so we store tidy strings like "50% 42%"
  const objectPosition = `${Math.round(pos.x)}% ${Math.round(pos.y)}%`
  // Mirror the public render: scale of exactly 1 means "no transform" → store empty
  const scaleValue = scale > 1.0001 ? String(Math.round(scale * 100) / 100) : ''

  // React sets hidden-input values directly without firing DOM events, so
  // dispatch a bubbling input event when framing changes — this lets an
  // enclosing form (e.g. SaveButton's dirty check) notice drag/zoom edits.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    posInputRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
  }, [objectPosition, scaleValue])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSrc(URL.createObjectURL(file))
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
    <div className="space-y-4">
      {/* Hidden inputs submitted with the form */}
      <input ref={posInputRef} type="hidden" name="avatar_position" value={objectPosition} />
      <input type="hidden" name="avatar_scale" value={scaleValue} />

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Live preview — exactly how the public site frames the photo (3:4 portrait) */}
        <figure className="space-y-1 shrink-0">
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            className="relative w-40 aspect-[3/4] overflow-hidden rounded-lg bg-zinc-800 border border-zinc-700 touch-none select-none cursor-grab active:cursor-grabbing"
          >
            {src ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={imgStyle} />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-2xl text-zinc-600 font-bold">{initials}</span>
            )}
          </div>
          <figcaption className="text-[10px] uppercase tracking-wide text-zinc-600 text-center">Public photo (3:4)</figcaption>
        </figure>

        <div className="flex-1 space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Profile photo</label>
            <input
              type="file"
              name="photo"
              accept="image/*"
              onChange={onFile}
              className="block text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 transition-colors"
            />
            <p className="text-xs text-zinc-600 mt-1">JPG or PNG, max 5 MB</p>
          </div>

          {src && (
            <>
              <p className="text-xs text-zinc-500">Drag the preview to reposition. Use the slider to zoom.</p>
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
              </div>
              <button
                type="button"
                onClick={() => { setPos({ x: 50, y: 50 }); setScale(1) }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Reset framing
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
