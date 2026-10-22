'use client'

import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'
import InfoHint from '@/components/InfoHint'

// Which course offerings a thing is for — one control, wherever the question
// is asked.
//
// It was asked twice, differently: a library item took a list and a gear list
// took one value, because they were built months apart on different tables.
// Both are rows on a library shelf and both are found the same way, so the
// question has one shape and one answer now. What the answer *means* still
// differs by half a sentence — on an item it limits who is offered the row,
// on a template it ranks — which is the hint's job, not the control's.
export default function OfferingChips({
  value,
  onChange,
  hint,
  label = 'Course offerings',
  className,
}: {
  value: string[]
  onChange: (next: string[]) => void
  hint: string
  label?: string
  className?: string
}) {
  const input =
    className ??
    'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-1">
        {label}
        <InfoHint text={hint} />
      </label>
      <select
        className={input}
        value=""
        onChange={(e) => {
          const ct = e.target.value
          if (ct && !value.includes(ct)) onChange([...value, ct])
        }}
      >
        <option value="">+ Add an offering…</option>
        {COURSE_TYPE_OPTIONS.map((g) => (
          <optgroup key={g.category} label={g.label.toUpperCase()}>
            {g.options
              .filter((o) => !value.includes(o.value))
              .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      <div className={`flex items-center gap-1.5 flex-wrap ${value.length ? 'mt-1.5' : ''}`}>
        {value.map((ct) => (
          <span
            key={ct}
            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300"
          >
            {courseShortName(ct, null)}
            <button
              type="button"
              aria-label={`Not for ${courseShortName(ct, null)}`}
              onClick={() => onChange(value.filter((x) => x !== ct))}
              className="text-blue-300/60 hover:text-white transition-colors"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
