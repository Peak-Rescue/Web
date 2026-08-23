'use client'

import { useRef, useState } from 'react'
import SignatureCanvas, {
  renderTypedSignature,
  SIGNATURE_FONTS,
  type SignatureCanvasHandle,
  type SignatureFontId,
} from './SignatureCanvas'

// Sign by typing or by drawing, the same two ways the waiver has always
// offered. Both produce a PNG, so nothing downstream has to know which was
// used — but the row records the mark itself either way, because "they typed
// their name" and "we have their name on file" are not the same evidence.

export default function SignatureField({
  value,
  onChange,
  /** Seeds the typed tab, so a signer isn't retyping a name already on screen. */
  suggestedText,
  kind = 'signature',
  tone = 'dark',
  disabled,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  suggestedText?: string
  kind?: 'signature' | 'initials'
  /** 'light' for the initials block, which sits inside the document itself —
      a dark control on white paper reads as a rendering fault, not a field. */
  tone?: 'dark' | 'light'
  disabled?: boolean
}) {
  const initials = kind === 'initials'
  const light = tone === 'light'
  const box = light
    ? 'bg-zinc-50 border border-zinc-300'
    : 'bg-zinc-900 border border-zinc-800'
  const input = light
    ? 'bg-white border border-zinc-300 text-zinc-900 focus:border-zinc-500'
    : 'bg-zinc-800 border border-zinc-700 focus:border-zinc-500'
  const tabOn = light ? 'bg-zinc-800 text-white' : 'bg-zinc-700 text-white'
  const tabOff = light
    ? 'bg-zinc-200 text-zinc-600 hover:text-zinc-900'
    : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
  const muted = light ? 'text-zinc-600' : 'text-zinc-500'
  const done = light ? 'text-teal-700' : 'text-teal-400'
  const btn = light
    ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
  const [mode, setMode] = useState<'type' | 'draw'>('type')
  const [typed, setTyped] = useState('')
  const [font, setFont] = useState<SignatureFontId>('brush')
  const canvasRef = useRef<SignatureCanvasHandle>(null)

  const width = initials ? 200 : 420
  const height = initials ? 100 : 120
  const noun = initials ? 'initials' : 'signature'

  function applyTyped(text: string, fontId: SignatureFontId) {
    setTyped(text)
    setFont(fontId)
    onChange(renderTypedSignature(text, fontId, { width, height }))
  }

  function reset() {
    setTyped('')
    canvasRef.current?.clear()
    onChange(null)
  }

  // Once a mark exists it is shown as made, not left as a live input — a
  // signature you can still nudge with a stray finger isn't finished.
  if (value) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg ${box}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt={`Your ${noun}`}
          className="bg-white rounded"
          style={{ width: width / 2, height: height / 2 }}
        />
        <span className={`text-xs ${done}`}>Signed ✓</span>
        {!disabled && (
          <button
            type="button"
            onClick={reset}
            className={`ml-auto px-3 py-1.5 rounded text-xs font-medium transition-colors ${btn}`}
          >
            Redo
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`p-4 rounded-lg ${box}`}>
      <div className="flex gap-1 mb-3" role="tablist">
        {(['type', 'draw'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              mode === m ? tabOn : tabOff
            }`}
          >
            {m === 'type' ? `Type ${noun}` : `Draw ${noun}`}
          </button>
        ))}
      </div>

      {mode === 'type' ? (
        <>
          <input
            value={typed}
            onChange={(e) => applyTyped(e.target.value, font)}
            placeholder={initials ? 'Your initials' : (suggestedText ?? 'Your full name')}
            aria-label={`Type your ${noun}`}
            className={`w-full rounded px-3 py-2 text-sm focus:outline-none ${input}`}
          />
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-xs ${muted}`}>Style</span>
            {SIGNATURE_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => applyTyped(typed, f.id)}
                style={{ fontFamily: f.css }}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  font === f.id ? tabOn : tabOff
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {suggestedText && !typed && !initials && (
            <button
              type="button"
              onClick={() => applyTyped(suggestedText, font)}
              className={`mt-3 text-xs underline transition-colors ${muted} hover:opacity-80`}
            >
              Use “{suggestedText}”
            </button>
          )}
        </>
      ) : (
        <>
          <p className={`text-xs mb-2 ${muted}`}>Finger, stylus or mouse.</p>
          <SignatureCanvas
            ref={canvasRef}
            width={width}
            height={height}
            opaque
            onChange={onChange}
            label={`Draw your ${noun}`}
            className={`w-full bg-white rounded touch-none cursor-crosshair ${initials ? 'h-20' : 'h-28'}`}
          />
          <button
            type="button"
            onClick={reset}
            className={`mt-3 px-4 py-2 rounded text-sm font-medium transition-colors ${btn}`}
          >
            Clear
          </button>
        </>
      )}
    </div>
  )
}
