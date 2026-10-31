'use client'

import { useState } from 'react'
import { SIZE_SCALES, defaultScale, parseSizeOptions, sizeRange, type SizeScaleId } from '@/lib/gear-orders'

// What a piece of gear comes in. Typed, because skis and hardware follow no
// pattern; or filled from a range, because nobody should type out EU 38 to 47.
// A range adds to what is there, so a boot can offer both EU and US.
export default function SizeOptionsField({
  value, category, name, onCommit, disabled, input,
}: {
  value: string[]
  category?: string | null
  name?: string | null
  onCommit: (next: string[]) => void
  disabled?: boolean
  input: string
}) {
  const [open, setOpen] = useState(false)
  const [scaleId, setScaleId] = useState<SizeScaleId>(() => defaultScale({ category, name }))
  const scale = SIZE_SCALES[scaleId]
  const [from, setFrom] = useState(String(scale.from))
  const [to, setTo] = useState(String(scale.to))
  const [step, setStep] = useState(scale.step)

  const pickScale = (id: SizeScaleId) => {
    const next = SIZE_SCALES[id]
    setScaleId(id); setFrom(String(next.from)); setTo(String(next.to)); setStep(next.step)
  }
  const small = `${input} text-xs`

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          key={value.join()}
          aria-label="Sizes on offer"
          placeholder="Sizes on offer"
          title="Separated by commas"
          defaultValue={value.join(', ')}
          disabled={disabled}
          onBlur={(e) => {
            const next = parseSizeOptions(e.target.value)
            if (next.join() !== value.join()) onCommit(next)
          }}
          className={`${small} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Range
        </button>
      </div>
      {open && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <select
            aria-label="Scale"
            value={scaleId}
            onChange={(e) => pickScale(e.target.value as SizeScaleId)}
            className={small}
          >
            {(Object.keys(SIZE_SCALES) as SizeScaleId[]).map((id) => (
              <option key={id} value={id}>{SIZE_SCALES[id].label}</option>
            ))}
          </select>
          {scale.values ? (
            <>
              <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={small}>
                {scale.values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={small}>
                {scale.values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="number" aria-label="From" placeholder="From" value={from} onChange={(e) => setFrom(e.target.value)} className={`${small} w-20`} />
              <input type="number" aria-label="To" placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} className={`${small} w-20`} />
              <select aria-label="Step" value={step} onChange={(e) => setStep(Number(e.target.value))} className={small}>
                {scale.steps.map((s) => <option key={s} value={s}>every {s}{scale.suffix}</option>)}
              </select>
            </>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onCommit(parseSizeOptions([...value, ...sizeRange(scaleId, from, to, step)].join(',')))
              setOpen(false)
            }}
            className="text-xs text-zinc-300 hover:text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
