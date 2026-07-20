'use client'

import { useRef, useState } from 'react'
import { fmtMoney, round2 } from '@/lib/expenses'
import { saveEstimate, type EstimateItemInput } from '@/app/admin/courses/finance-actions'

export type PricingRate = { id: string; label: string; unit: string | null; rate: number }

type Row = { key: number; label: string; qty: string; rate: string }

const MARGIN_PRESETS = [0.2, 0.25, 0.3]
const SAVE_DEBOUNCE_MS = 900

// Internal cost build-up → margin → quote price. Replaces the per-client
// cost-estimate spreadsheets. Admin-only; auto-saves as you type.
export default function EstimatePanel({
  instanceId,
  initialMargin,
  initialItems,
  rates,
}: {
  instanceId: string
  initialMargin: number
  initialItems: { label: string; qty: number; rate: number }[]
  rates: PricingRate[]
}) {
  const nextKey = useRef(initialItems.length)
  const [rows, setRows] = useState<Row[]>(
    initialItems.map((i, idx) => ({ key: idx, label: i.label, qty: String(i.qty), rate: String(i.rate) }))
  )
  const [margin, setMargin] = useState(initialMargin)
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const stateRef = useRef({ rows, margin })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)
  const rerun = useRef(false)

  function schedule(nextRows: Row[], nextMargin: number) {
    setRows(nextRows)
    setMargin(nextMargin)
    stateRef.current = { rows: nextRows, margin: nextMargin }
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
  }

  async function flush() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (saving.current) {
      rerun.current = true
      return
    }
    saving.current = true
    setStatus('saving')
    try {
      const { rows: r, margin: m } = stateRef.current
      const items: EstimateItemInput[] = r
        .filter((row) => row.label.trim())
        .map((row) => ({ label: row.label, qty: Number(row.qty) || 0, rate: Number(row.rate) || 0 }))
      await saveEstimate(instanceId, { margin: m, items })
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      saving.current = false
      if (rerun.current) {
        rerun.current = false
        void flush()
      }
    }
  }

  function addFromLibrary(rateId: string) {
    const lib = rates.find((r) => r.id === rateId)
    if (!lib) return
    schedule([...rows, { key: nextKey.current++, label: lib.label, qty: '1', rate: String(lib.rate) }], margin)
  }

  function addCustom() {
    schedule([...rows, { key: nextKey.current++, label: '', qty: '1', rate: '' }], margin)
  }

  function updateRow(key: number, patch: Partial<Row>) {
    schedule(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)), margin)
  }

  function removeRow(key: number) {
    schedule(rows.filter((r) => r.key !== key), margin)
  }

  const subtotal = round2(rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0))
  const marginAmount = round2(subtotal * margin)
  const quotePrice = round2(subtotal + marginAmount)

  const inputCls = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500">
          Internal cost build-up — never shown to instructors or clients. The quote gets only the final price.
        </p>
        <span className={`text-xs ${status === 'error' ? 'text-pr-red-light' : status === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed' : status === 'pending' ? '…' : ''}
        </span>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <div key={r.key} className="px-3 py-2 flex items-center gap-2">
              <input
                value={r.label}
                onChange={(e) => updateRow(r.key, { label: e.target.value })}
                placeholder="Line item"
                className={`${inputCls} flex-1 min-w-0`}
              />
              <input
                type="number"
                value={r.qty}
                min="0"
                step="0.5"
                onChange={(e) => updateRow(r.key, { qty: e.target.value })}
                className={`${inputCls} w-20 text-right`}
                title="Quantity"
              />
              <span className="text-zinc-600 text-xs">×</span>
              <input
                type="number"
                value={r.rate}
                min="0"
                step="0.01"
                onChange={(e) => updateRow(r.key, { rate: e.target.value })}
                className={`${inputCls} w-24 text-right`}
                title="Rate"
              />
              <span className="text-sm w-24 text-right shrink-0">
                {fmtMoney(round2((Number(r.qty) || 0) * (Number(r.rate) || 0)))}
              </span>
              <button onClick={() => removeRow(r.key)} className="text-zinc-600 hover:text-pr-red-light text-sm shrink-0">
                ×
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-3 py-3 text-sm text-zinc-500">No line items yet — add costs below.</p>
          )}
        </div>

        <div className="px-3 py-2.5 border-t border-zinc-800 flex items-center gap-2 flex-wrap">
          <select
            value=""
            onChange={(e) => e.target.value && addFromLibrary(e.target.value)}
            className={`${inputCls} text-zinc-400`}
          >
            <option value="">+ Add from rates library…</option>
            {rates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} — {fmtMoney(r.rate)}{r.unit ? ` ${r.unit}` : ''}
              </option>
            ))}
          </select>
          <button onClick={addCustom} className="text-sm text-zinc-400 hover:text-white transition-colors">
            + Custom item
          </button>
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-zinc-400 mb-1.5">Margin (picked per estimate)</p>
            <div className="flex items-center gap-1.5">
              {MARGIN_PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => schedule(rows, m)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    Math.abs(margin - m) < 0.0001
                      ? 'bg-pr-red text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {Math.round(m * 100)}%
                </button>
              ))}
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                value={Math.round(margin * 100)}
                onChange={(e) => schedule(rows, (Number(e.target.value) || 0) / 100)}
                className={`${inputCls} w-16 text-right`}
              />
              <span className="text-xs text-zinc-500">%</span>
            </div>
          </div>
          <div className="text-right text-sm space-y-0.5">
            <p className="text-zinc-400">Cost: {fmtMoney(subtotal)}</p>
            <p className="text-zinc-400">Margin ({Math.round(margin * 100)}%): {fmtMoney(marginAmount)}</p>
            <p className="text-base font-semibold">Quote price: {fmtMoney(quotePrice)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
