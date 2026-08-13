'use client'

import { useState } from 'react'
import { fmtMoney } from '@/lib/expenses'
import { useLiveCoaPrices } from '@/lib/live-coa-prices'

export type QuoteOptionField = { estimate_id?: string | null; title: string; total: number }

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const labelCls = 'block text-xs text-zinc-400 mb-1'

// The price fields of a draft quote, plus the button that re-pulls the COA's
// current price. A quote's total is a snapshot taken at creation — it has to
// be, or editing a COA would silently change a quote already sent — so this
// is how a draft catches up after the estimate moves or after you type over
// the number. It only touches the input; the surrounding form still saves,
// so pulling a price never discards the other edits in flight. The price it
// offers comes from the COA's panel as it's typed, not from the last save.
export default function QuoteTotalFields({
  total,
  options,
  estimateId,
  coaPrices,
}: {
  total: number
  options: QuoteOptionField[] | null
  estimateId: string | null
  coaPrices: Record<string, number> // server snapshot: every COA still on the course
}) {
  const [totalValue, setTotalValue] = useState(String(total))
  const [optionValues, setOptionValues] = useState(() => (options ?? []).map((o) => String(o.total)))
  // A mounted panel knows its price before the server does; fall back to the
  // server's for COAs that aren't on screen.
  const livePrices = useLiveCoaPrices()
  const priceOf = (id: string | null | undefined): number | undefined =>
    id ? livePrices[id] ?? coaPrices[id] : undefined

  if (options) {
    // Each option is a different COA, so "update" means re-pulling each one
    // that still exists. Options whose COA was deleted keep their number.
    const pullable = options.filter((o) => priceOf(o.estimate_id) !== undefined)
    const stale = options.some((o, i) => {
      const p = priceOf(o.estimate_id)
      return p !== undefined && p !== Number(optionValues[i])
    })
    return (
      <div className="sm:col-span-3">
        <label className={labelCls}>Options (client picks one or more when accepting)</label>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input name={`opt_title_${i}`} defaultValue={o.title} className={`${inputCls} flex-1`} />
              <span className="text-zinc-600 text-xs">$</span>
              <input
                name={`opt_total_${i}`}
                type="number"
                step="0.01"
                min="0"
                value={optionValues[i]}
                onChange={(e) => setOptionValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                className={`${inputCls} basis-32 shrink-0 text-right`}
              />
            </div>
          ))}
        </div>
        {pullable.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setOptionValues((v) =>
                v.map((x, i) => {
                  const p = priceOf(options[i].estimate_id)
                  return p !== undefined ? String(p) : x
                })
              )
            }
            className="mt-2 text-xs text-zinc-400 hover:text-white underline transition-colors"
          >
            Update prices from estimates{stale ? ' (they have changed)' : ''}
          </button>
        )}
      </div>
    )
  }

  const current = priceOf(estimateId)
  return (
    <div>
      <label className={labelCls}>Total price (USD)</label>
      <input
        name="total"
        type="number"
        step="0.01"
        min="0"
        value={totalValue}
        onChange={(e) => setTotalValue(e.target.value)}
        className={inputCls}
      />
      {current !== undefined && (
        <button
          type="button"
          onClick={() => setTotalValue(String(current))}
          className="mt-1 text-xs text-zinc-400 hover:text-white underline transition-colors"
        >
          Update from estimate
          {current !== Number(totalValue) && <span className="ml-1 text-zinc-500">({fmtMoney(current)})</span>}
        </button>
      )}
    </div>
  )
}
