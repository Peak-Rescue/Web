'use client'

import { useState } from 'react'
import { fmtMoney } from '@/lib/expenses'
import { useLiveCoaPrices } from '@/lib/live-coa-prices'

export type QuoteOptionField = { estimate_id?: string | null; title: string; total: number }

const inputBase = 'w-full bg-zinc-800 border rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const inputCls = `${inputBase} border-zinc-700`
// A price that no longer matches its COA — the one state worth a colour.
const staleInputCls = `${inputBase} border-yellow-700`
const labelCls = 'block text-xs text-zinc-400 mb-1'
const staleLinkCls = 'text-xs text-yellow-300 hover:text-yellow-200 underline transition-colors'

// The price fields of a draft quote, plus the button that re-pulls the COA's
// current price. A quote's total is a snapshot taken at creation — it has to
// be, or editing a COA would silently change a quote already sent — so this
// is how a draft catches up after the estimate moves or after you type over
// the number. It only touches the input; the surrounding form still saves,
// so pulling a price never discards the other edits in flight. The price it
// offers comes from the COA's panel as it's typed, not from the last save.
//
// Nothing to pull, nothing to show: the button appears only while the two
// numbers disagree, so it never offers an action that would change nothing.
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
    const staleAt = options.map((o, i) => {
      const p = priceOf(o.estimate_id)
      return p !== undefined && p !== Number(optionValues[i])
    })
    const stale = staleAt.some(Boolean)
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
                className={`${staleAt[i] ? staleInputCls : inputCls} basis-32 shrink-0 text-right`}
                title={staleAt[i] ? `Its COA now quotes ${fmtMoney(priceOf(o.estimate_id)!)}` : undefined}
              />
            </div>
          ))}
        </div>
        {stale && (
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
            className={`${staleLinkCls} mt-2`}
          >
            Update prices from estimates
          </button>
        )}
      </div>
    )
  }

  const current = priceOf(estimateId)
  const stale = current !== undefined && current !== Number(totalValue)
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
        className={stale ? staleInputCls : inputCls}
      />
      {stale && (
        <button type="button" onClick={() => setTotalValue(String(current))} className={`mt-1 ${staleLinkCls}`}>
          Update to {fmtMoney(current!)}
        </button>
      )}
    </div>
  )
}
