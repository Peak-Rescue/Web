'use client'

import type { SizeRow } from '@/lib/gear-orders'

// How many of each size, for one line of a gear order. The team's page and the
// admin editor draw the same thing, so a number read over the phone goes in the
// way the team would have typed it.
//
// Known sizes are a box each. Otherwise sizes are typed, because a ski length
// or a boot's mondo is no list of ours to require.
export default function GearSizeRows({
  fixed, rows, onChange, onCommit, disabled, input,
}: {
  /** The line has a size list, so the sizes themselves aren't editable here. */
  fixed: boolean
  rows: SizeRow[]
  onChange: (rows: SizeRow[]) => void
  onCommit?: (rows: SizeRow[]) => void
  disabled?: boolean
  input: string
}) {
  const set = (i: number, patch: Partial<SizeRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          {fixed ? (
            <span className="text-xs text-zinc-300 min-w-6 text-right">{r.size}</span>
          ) : (
            <input
              aria-label="Size"
              placeholder="Size"
              value={r.size}
              disabled={disabled}
              onChange={(e) => set(i, { size: e.target.value })}
              onBlur={() => onCommit?.(rows)}
              className={`${input} w-20 text-xs`}
            />
          )}
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            aria-label={r.size ? `Quantity in ${r.size}` : 'Quantity'}
            placeholder="Qty"
            value={r.qty}
            disabled={disabled}
            onChange={(e) => set(i, { qty: e.target.value })}
            onBlur={() => onCommit?.(rows)}
            className={`${input} w-16 text-center`}
          />
          {!fixed && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = rows.filter((_, j) => j !== i)
                onChange(next)
                onCommit?.(next)
              }}
              title="Remove this size"
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-1"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!fixed && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...rows, { size: '', qty: '' }])}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          + Size
        </button>
      )}
    </div>
  )
}
