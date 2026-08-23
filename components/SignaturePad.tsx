'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { saveSignature } from '@/app/instructor/expenses/actions'
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas'
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
//
// The drawing itself lives in SignatureCanvas, shared with the waiver. What
// stays here is the part that is only true of an expense signature: that it is
// kept on the profile and reused. A waiver signature is the opposite — made at
// the moment of signing, never reused — which is why that flow holds the PNG
// in form state instead of calling anything like saveSignature.
const SignaturePad = forwardRef<SignaturePadHandle, {
  hasSignature: boolean
  onSaved?: () => void
}>(function SignaturePad({ hasSignature, onSaved }, handleRef) {
  const canvasRef = useRef<SignatureCanvasHandle>(null)
  // Latest PNG off the canvas, waiting for the autosave timer.
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const [status, setStatus] = useState<'blank' | 'drawing' | 'saving' | 'saved' | 'error'>('blank')
  const [saved, setSaved] = useState(hasSignature)
  const [editing, setEditing] = useState(!hasSignature)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useImperativeHandle(handleRef, () => ({
    async saveIfDrawn() {
      if (editing && pending.current) {
        await save()
        // save() clears the pending PNG only on success.
        if (!pending.current) return true
      }
      return saved
    },
  }))

  function onStroke(dataUrl: string | null) {
    if (timer.current) clearTimeout(timer.current)
    pending.current = dataUrl
    if (!dataUrl) { setStatus('blank'); return }
    setStatus('drawing')
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  async function save() {
    const png = pending.current
    if (!png || savingRef.current) return
    if (timer.current) clearTimeout(timer.current)
    savingRef.current = true
    setStatus('saving')
    try {
      await saveSignature(png)
      pending.current = null
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
      <SignatureCanvas ref={canvasRef} onChange={onStroke} label="Draw your signature" />
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => { canvasRef.current?.clear(); if (timer.current) clearTimeout(timer.current) }}
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
