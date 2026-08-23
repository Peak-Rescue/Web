'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// A surface you draw on, and nothing else.
//
// Pulled out of SignaturePad so the two things that need a signature can stop
// disagreeing about how one is captured. What they don't share is what happens
// next: an expense signature is drawn once and kept on the profile to stamp
// onto future reports, while a waiver signature must be made at the moment of
// signing and is worthless if it was copied from somewhere else. So this
// component holds no opinion about saving — it hands back a PNG and forgets.
//
// Pointer events rather than mouse or touch: one code path covers a finger on
// a phone at a trailhead, a stylus, and a mouse, and it's the same reason the
// rest of the app dropped HTML5 drag-and-drop.

export type SignatureCanvasHandle = {
  clear: () => void
  /** PNG data URL, or null if nothing has been drawn. */
  toDataURL: () => string | null
}

const SignatureCanvas = forwardRef<
  SignatureCanvasHandle,
  {
    /** Output size in CSS pixels. The canvas is drawn at device resolution and
        scaled down to this, so a phone signature isn't a blurry mess. */
    width?: number
    height?: number
    /** Fires on every pen-up with the current PNG, or null once cleared. */
    onChange?: (dataUrl: string | null) => void
    /** Paint a white background behind the strokes. Off by default: an expense
        signature is stamped onto a printed signature line and an opaque box
        would cover it. A waiver signature is shown on its own against a dark
        page, where transparent strokes would be invisible. */
    opaque?: boolean
    className?: string
    label?: string
  }
>(function SignatureCanvas({ width = 420, height = 120, onChange, opaque, className, label }, handleRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  // Re-scaling wipes the bitmap, so this runs once and the canvas keeps its
  // backing size for the life of the component.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scale = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * scale
    canvas.height = canvas.offsetHeight * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(scale, scale)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
  }, [])

  function exportPng(): string | null {
    const canvas = canvasRef.current
    if (!canvas || !dirty.current) return null
    // Downscale to a fixed size: the row that stores this is read back years
    // later, and a retina-sized PNG per signature adds up for no benefit.
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    if (!ctx) return null
    if (opaque) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, out.width, out.height)
    }
    ctx.drawImage(canvas, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    onChange?.(null)
  }

  useImperativeHandle(handleRef, () => ({ clear, toDataURL: exportPng }))

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={label ?? 'Signature'}
      role="img"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = true
        const ctx = canvasRef.current?.getContext('2d')
        const { x, y } = pos(e)
        ctx?.beginPath()
        ctx?.moveTo(x, y)
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return
        const ctx = canvasRef.current?.getContext('2d')
        const { x, y } = pos(e)
        ctx?.lineTo(x, y)
        ctx?.stroke()
        dirty.current = true
      }}
      onPointerUp={() => {
        if (!drawing.current) return
        drawing.current = false
        if (dirty.current) onChange?.(exportPng())
      }}
      onPointerLeave={() => {
        if (!drawing.current) return
        drawing.current = false
        if (dirty.current) onChange?.(exportPng())
      }}
      className={className ?? 'w-full h-28 bg-white rounded touch-none cursor-crosshair'}
    />
  )
})

export default SignatureCanvas

// ─── Typed signatures ───────────────────────────────────────────────────────

/** The handwriting choices, matching the "Change Font" the old waiver offered. */
export const SIGNATURE_FONTS = [
  { id: 'brush', label: 'Brush', css: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: 'formal', label: 'Formal', css: "'Snell Roundhand', 'Apple Chancery', cursive" },
  { id: 'plain', label: 'Plain', css: "'Georgia', serif" },
] as const

export type SignatureFontId = (typeof SIGNATURE_FONTS)[number]['id']

/**
 * A typed name rendered to the same kind of PNG a drawn one produces, so
 * everything downstream — the row, the PDF, the emailed copy — handles one
 * format and never has to care which way it was made.
 */
export function renderTypedSignature(
  text: string,
  fontId: SignatureFontId,
  { width = 420, height = 120 }: { width?: number; height?: number } = {}
): string | null {
  if (!text.trim()) return null
  const canvas = document.createElement('canvas')
  const scale = window.devicePixelRatio || 1
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#111'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const family = SIGNATURE_FONTS.find((f) => f.id === fontId)?.css ?? 'cursive'

  // Shrink to fit rather than overflow: long names are common and a signature
  // clipped at the edge of the box looks like a rendering bug on the PDF.
  let size = Math.round(height * 0.5)
  do {
    ctx.font = `${size}px ${family}`
    if (ctx.measureText(text).width <= width - 24) break
    size -= 2
  } while (size > 12)

  ctx.fillText(text, width / 2, height / 2)
  return canvas.toDataURL('image/png')
}
