'use client'

import { useState } from 'react'
import { SIZE_SCALES, defaultScale, parseSizeOptions, sizeRange, type SizeScaleId } from '@/lib/gear-orders'

// What a piece of gear comes in. Added one at a time, because skis and hardware
// follow no pattern, or from a range, because nobody should type out EU 38 to 47.
// A range adds to what is there, so a boot can offer both EU and US.
//
// Each size shows the moment it is added and the save follows behind it. A box
// that only saved on leaving it gave no sign anything had happened.
export default function SizeOptionsField({
  value, category, name, onCommit, input,
}: {
  value: string[]
  category?: string | null
  name?: string | null
  onCommit: (next: string[]) => void
  input: string
}) {
  const [items, setItems] = useState(value)
  // The record moved under us (a save came back, another tab wrote it), so it
  // wins. Set during render so the old list never paints.
  const [seen, setSeen] = useState(value)
  if (seen.join() !== value.join()) {
    setSeen(value)
    setItems(value)
  }

  const [draft, setDraft] = useState('')
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
  const write = (next: string[]) => {
    if (next.join() === items.join()) return
    setItems(next)
    onCommit(next)
  }
  const addDraft = () => {
    write(parseSizeOptions([...items, draft].join(',')))
    setDraft('')
  }
  const small = `${input} text-xs`

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {items.map((size) => (
            <span key={size} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">
              {size}
              <button
                type="button"
                aria-label={`Remove ${size}`}
                onClick={() => write(items.filter((s) => s !== size))}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                ×
              </button>
            </span>
          ))}
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => { if (confirm('Remove all of these sizes?')) write([]) }}
              className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          aria-label="Add a size"
          placeholder="Add a size"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
          className={`${small} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="shrink-0 text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          Add
        </button>
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
            onClick={() => {
              write(parseSizeOptions([...items, ...sizeRange(scaleId, from, to, step)].join(',')))
              setOpen(false)
            }}
            className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Add range
          </button>
        </div>
      )}
    </div>
  )
}
