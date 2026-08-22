'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { saveSignature } from '@/app/instructor/expenses/actions'
import InfoHint from '@/components/InfoHint'

export type SignaturePadHandle = {
  // Flushes any drawn-but-unsaved strokes. Resolves to whether a signature
  // exists (saved now or previously). Lets the submit flow auto-save instead
  // of erroring on "you drew it but it hasn't saved yet."
  saveIfDrawn: () => Promise<boolean>
}

const AUTOSAVE_MS = 2000

// Draw-once signature: captured on a canvas (finger or mouse), auto-saved to
// the profile shortly after the pen lifts, and stamped onto every generated
// report PDF. No save button — pauses mid-signature are fine because each new
// stroke re-saves the whole canvas.
const SignaturePad = forwardRef<SignaturePadHandle, {
  hasSignature: boolean
  onSaved?: () => void
}>(function SignaturePad({ hasSignature, onSaved }, handleRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirtyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const [status, setStatus] = useState<'blank' | 'drawing' | 'saving' | 'saved' | 'error'>('blank')
  const [saved, setSaved] = useState(hasSignature)
  const [editing, setEditing] = useState(!hasSignature)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scale = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * scale
    canvas.height = canvas.offsetHeight * scale
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(scale, scale)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111'
    }
  }, [editing])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useImperativeHandle(handleRef, () => ({
    async saveIfDrawn() {
      if (editing && dirtyRef.current) {
        await save()
        // save() clears the dirty flag only on success.
        if (!dirtyRef.current) return true
      }
      return saved
    },
  }))

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    if (timer.current) clearTimeout(timer.current)
    setStatus('drawing')
    const ctx = canvasRef.current?.getContext('2d')
    const { x, y } = pos(e)
    ctx?.beginPath()
    ctx?.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const { x, y } = pos(e)
    ctx?.lineTo(x, y)
    ctx?.stroke()
    dirtyRef.current = true
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (!dirtyRef.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (timer.current) clearTimeout(timer.current)
    dirtyRef.current = false
    setStatus('blank')
  }

  async function save() {
    const canvas = canvasRef.current
    if (!canvas || !dirtyRef.current || savingRef.current) return
    if (timer.current) clearTimeout(timer.current)
    savingRef.current = true
    setStatus('saving')
    try {
      // Downscale to keep the stored data URL small.
      const out = document.createElement('canvas')
      out.width = 420
      out.height = 120
      const ctx = out.getContext('2d')!
      ctx.drawImage(canvas, 0, 0, out.width, out.height)
      await saveSignature(out.toDataURL('image/png'))
      dirtyRef.current = false
      setSaved(true)
      setStatus('saved')
      onSaved?.()
    } catch {
      setStatus('error')
    } finally {
      savingRef.current = false
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            Signature on file <span className="text-teal-400">✓</span>
            <InfoHint text="Stamped onto the employee-signature line of each submitted report." />
          </p>
        </div>
        <button
          onClick={() => { setEditing(true); setStatus('blank') }}
          className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
        >
          Redraw
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">Draw your signature</p>
        <span className={`text-xs ${status === 'error' ? 'text-pr-red-light' : status === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed — draw again' : ''}
        </span>
      </div>
      <p className="text-xs text-zinc-500 mb-3">Finger or mouse — it saves by itself.</p>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-28 bg-white rounded touch-none cursor-crosshair"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={clear}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm font-medium transition-colors"
        >
          Clear
        </button>
        {saved && (
          <button
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
})

export default SignaturePad
