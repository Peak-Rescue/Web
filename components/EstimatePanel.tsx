'use client'

import { useRef, useState } from 'react'
import { fmtMoney, round2 } from '@/lib/expenses'
import { saveEstimate, deleteEstimateCoa, type EstimateItemInput } from '@/app/admin/courses/finance-actions'
import { useRouter } from 'next/navigation'

export type PricingRate = { id: string; label: string; unit: string | null; rate: number }

export type CourseCounts = { instructors: number; students: number | null; days: number | null }

type Row = {
  key: number
  label: string
  qty: string
  rate: string
  notes: string
  factors: Factors | null
  flabels: (string | null)[]
}
// Variable-length: as many boxes as the rate's unit has dimensions, plus any
// explicitly added multipliers (max 4).
type Factors = string[]

// Drop trailing ×1 factors; a breakdown needs ≥2 left to mean anything.
function trimFactors(f: Factors): string[] {
  const out: string[] = [...f]
  while (out.length > 1) {
    const last = out[out.length - 1].trim()
    if (last === '' || Number(last) === 1) out.pop()
    else break
  }
  return out
}

const MARGIN_PRESETS = [0.2, 0.25, 0.3]
const SAVE_DEBOUNCE_MS = 900

// Internal cost build-up → margin → quote price. Replaces the per-client
// cost-estimate spreadsheets. Admin-only; auto-saves as you type.
export default function EstimatePanel({
  instanceId,
  estimateId,
  initialTitle,
  initialMargin,
  initialItems,
  rates,
  canDelete,
  solo,
  counts,
}: {
  instanceId: string
  estimateId: string | null // null = not yet persisted (first COA, untouched)
  initialTitle: string
  initialMargin: number
  initialItems: { label: string; qty: number; rate: number; notes: string | null; factors: number[] | null; factor_labels: (string | null)[] | null }[]
  rates: PricingRate[]
  canDelete: boolean
  solo: boolean // only COA on the course — the default "COA n" title stays hidden until a second exists
  counts: CourseCounts
}) {
  const router = useRouter()
  const estimateIdRef = useRef<string | null>(estimateId)
  const [persistedId, setPersistedId] = useState<string | null>(estimateId)
  const [title, setTitle] = useState(initialTitle)
  const [deleting, setDeleting] = useState(false)
  const nextKey = useRef(initialItems.length)
  const [rows, setRows] = useState<Row[]>(
    initialItems.map((i, idx) => ({
      key: idx,
      label: i.label,
      qty: String(i.qty),
      rate: String(i.rate),
      notes: i.notes ?? '',
      factors: i.factors && i.factors.length >= 2 ? i.factors.map(String) : null,
      flabels: i.factor_labels ?? [],
    }))
  )
  const [notesOpen, setNotesOpen] = useState<Set<number>>(
    () => new Set(initialItems.map((i, idx) => (i.notes ? idx : -1)).filter((k) => k >= 0))
  )
  const [calcOpen, setCalcOpen] = useState<Set<number>>(new Set())
  const [margin, setMargin] = useState(initialMargin)
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const stateRef = useRef({ rows, margin, title: initialTitle })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)
  const rerun = useRef(false)

  function schedule(nextRows: Row[], nextMargin: number, nextTitle?: string) {
    setRows(nextRows)
    setMargin(nextMargin)
    if (nextTitle !== undefined) setTitle(nextTitle)
    stateRef.current = { rows: nextRows, margin: nextMargin, title: nextTitle ?? stateRef.current.title }
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
      const { rows: r, margin: m, title: t } = stateRef.current
      const items: EstimateItemInput[] = r
        .filter((row) => row.label.trim())
        .map((row) => {
          const trimmed = row.factors ? trimFactors(row.factors).map((f) => Number(f) || 0) : []
          const trimmedLabels = trimmed.map((_, i) => row.flabels[i] ?? null)
          return {
            label: row.label,
            qty: Number(row.qty) || 0,
            rate: Number(row.rate) || 0,
            notes: row.notes || null,
            factors: trimmed.length >= 2 ? trimmed : null,
            factor_labels: trimmed.length >= 2 ? trimmedLabels : null,
          }
        })
      const saved = await saveEstimate(instanceId, estimateIdRef.current, { title: t, margin: m, items })
      estimateIdRef.current = saved.id
      setPersistedId(saved.id)
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

  // A known unit dimension prefills from the course itself.
  function countForFactor(name: string): number | null {
    const n = name.toLowerCase()
    if (n.startsWith('instructor') || n.startsWith('person')) return counts.instructors || null
    if (n.startsWith('day') || n.startsWith('night')) return counts.days
    if (n.startsWith('student')) return counts.students
    return null
  }

  function addFromLibrary(rateId: string) {
    const lib = rates.find((r) => r.id === rateId)
    if (!lib) return
    const labels = factorLabels(lib.label)
    const values = labels.map((l) => countForFactor(l) ?? 1)
    const qty = values.reduce((p, v) => p * v, 1)
    schedule(
      [...rows, {
        key: nextKey.current++,
        label: lib.label,
        qty: String(qty || 1),
        rate: String(lib.rate),
        notes: '',
        factors: labels.length >= 2 ? values.map(String) : null,
        flabels: [],
      }],
      margin
    )
  }

  function addCustom() {
    schedule([...rows, { key: nextKey.current++, label: '', qty: '1', rate: '', notes: '', factors: null, flabels: [] }], margin)
  }

  function toggleNotes(key: number) {
    setNotesOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // The qty calculator: people × days × units. The breakdown saves with the
  // line (qty_factors) so the math behind a quantity is visible later;
  // typing a qty directly clears it.
  function rowFactors(r: Row): Factors {
    if (r.factors) return r.factors
    const n = Math.max(factorLabels(r.label).length, 2)
    return [r.qty.trim() || '1', ...Array.from({ length: n - 1 }, () => '1')]
  }

  function addFactor(key: number) {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const current = rowFactors(row)
    if (current.length >= 4) return
    updateRow(key, { factors: [...current, '1'] })
  }

  function setFactorLabel(key: number, idx: number, value: string) {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const next = [...row.flabels]
    while (next.length <= idx) next.push(null)
    next[idx] = value || null
    updateRow(key, { flabels: next })
  }

  function toggleCalc(key: number) {
    setCalcOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setFactor(key: number, idx: number, value: string) {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const next: Factors = [...rowFactors(row)]
    next[idx] = value
    const product = next.reduce((p, f) => p * (f.trim() === '' ? 1 : Number(f) || 0), 1)
    updateRow(key, { qty: String(round2(product)), factors: next })
  }

  function updateRow(key: number, patch: Partial<Row>) {
    schedule(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)), margin)
  }

  function removeRow(key: number) {
    schedule(rows.filter((r) => r.key !== key), margin)
  }

  // What the quantity means for library items: "per mile" → "miles",
  // "per student per day" → "student × day". Null for custom lines.
  function qtyFactors(label: string): string | null {
    const unit = rates.find((r) => r.label === label)?.unit
    if (!unit) return null
    const factors = unit.replace(/^per\s+/, '').split(/\s+per\s+/)
    return factors.length > 1 ? factors.join(' × ') : `${factors[0]}s`
  }

  // The rate's unit text, e.g. "per mile", "per person per night".
  // Labels for the factor boxes, from the rate's unit: "per instructor per
  // day" → ['instructors', 'days']. Extra boxes beyond the unit are spares.
  function factorLabels(label: string): string[] {
    const unit = rates.find((r) => r.label === label)?.unit
    if (!unit) return []
    return unit
      .replace(/^per\s+/, '')
      .split(/\s+per\s+/)
      .map((f) => (f.endsWith('s') ? f : `${f}s`))
  }

  function rateUnit(label: string): string | null {
    return rates.find((r) => r.label === label)?.unit ?? null
  }

  // Hint under the qty box: the saved breakdown ("= 3 × 5") when there is
  // one, else what the quantity means for the rate's unit.
  function qtyHint(r: Row): string | null {
    const breakdown = r.factors ? trimFactors(r.factors) : []
    if (breakdown.length >= 2) return `= ${breakdown.join(' × ')}`
    return qtyFactors(r.label)
  }

  const subtotal = round2(rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0))
  const marginAmount = round2(subtotal * margin)
  const quotePrice = round2(subtotal + marginAmount)

  const inputCls = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <input
          value={solo && title === 'COA 1' ? '' : title}
          onChange={(e) => schedule(rows, margin, e.target.value)}
          placeholder={solo ? 'Estimate name (optional)' : ''}
          className="bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-zinc-500 focus:outline-none text-sm font-semibold w-52 placeholder:text-zinc-600 placeholder:font-normal"
          title="Name this COA (e.g. 'Drive team', 'Fly-in option')"
        />
        <div className="flex items-center gap-3">
          <span className={`text-xs ${status === 'error' ? 'text-pr-red-light' : status === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed' : status === 'pending' ? '…' : ''}
          </span>
          {canDelete && persistedId && (
            <button
              onClick={async () => {
                if (deleting || !confirm(`Delete estimate "${title}"?`)) return
                setDeleting(true)
                try {
                  await deleteEstimateCoa(instanceId, estimateIdRef.current!)
                  router.refresh()
                } finally {
                  setDeleting(false)
                }
              }}
              disabled={deleting}
              className="text-xs text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-50"
            >
              Delete COA
            </button>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <div key={r.key} className="px-3 py-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 min-w-0">
                <button
                  onClick={() => toggleNotes(r.key)}
                  title="Notes for this line"
                  className={`text-sm shrink-0 transition-colors ${r.notes || notesOpen.has(r.key) ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  📝
                </button>
                <button
                  onClick={() => toggleCalc(r.key)}
                  title="Quantity calculator — build qty from people × days × units"
                  className={`text-sm shrink-0 transition-colors ${r.factors || calcOpen.has(r.key) ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  🔢
                </button>
                <input
                  value={r.label}
                  onChange={(e) => updateRow(r.key, { label: e.target.value })}
                  placeholder="Line item"
                  className={`${inputCls} flex-1 min-w-0`}
                />
              </div>
              <div className="flex items-start gap-2 ml-auto">
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    value={r.qty}
                    min="0"
                    step="0.5"
                    onChange={(e) => updateRow(r.key, { qty: e.target.value, factors: null })}
                    className={`${inputCls} w-20 text-right`}
                    title={qtyFactors(r.label) ? `Quantity = ${qtyFactors(r.label)}` : 'Quantity'}
                  />
                  {qtyHint(r) && (
                    <span className="mt-0.5 text-[10px] text-zinc-600 whitespace-nowrap">{qtyHint(r)}</span>
                  )}
                </div>
                <span className="text-zinc-600 text-xs mt-2.5">×&nbsp;&nbsp;$</span>
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    value={r.rate}
                    min="0"
                    step="0.01"
                    onChange={(e) => updateRow(r.key, { rate: e.target.value })}
                    className={`${inputCls} w-24 text-right`}
                    title={rateUnit(r.label) ? `Dollars ${rateUnit(r.label)}` : 'Dollar rate'}
                  />
                  <span className="mt-0.5 text-[10px] text-zinc-600 whitespace-nowrap">
                    {rateUnit(r.label) ?? 'dollars'}
                  </span>
                </div>
                <span className="text-sm w-24 text-right shrink-0 mt-2">
                  {fmtMoney(round2((Number(r.qty) || 0) * (Number(r.rate) || 0)))}
                </span>
                <button onClick={() => removeRow(r.key)} className="text-zinc-600 hover:text-pr-red-light text-sm shrink-0 mt-1.5">
                  ×
                </button>
              </div>
            </div>
            {calcOpen.has(r.key) && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-zinc-500">Qty =</span>
                {rowFactors(r).map((f, i) => (
                  <span key={i} className="flex items-start gap-1.5">
                    {i > 0 && <span className="text-xs text-zinc-600 mt-2">×</span>}
                    <span className="flex flex-col items-center">
                      <input
                        type="number"
                        value={f}
                        min="0"
                        step="0.5"
                        onChange={(e) => setFactor(r.key, i, e.target.value)}
                        className={`${inputCls} w-16 text-right`}
                      />
                      {factorLabels(r.label)[i] ? (
                        <span className="mt-0.5 text-[10px] text-zinc-600">{factorLabels(r.label)[i]}</span>
                      ) : (
                        <input
                          value={r.flabels[i] ?? ''}
                          onChange={(e) => setFactorLabel(r.key, i, e.target.value)}
                          placeholder="name"
                          className="mt-0.5 w-16 bg-transparent border-b border-zinc-800 focus:border-zinc-500 focus:outline-none text-[10px] text-zinc-400 text-center"
                        />
                      )}
                    </span>
                  </span>
                ))}
                {rowFactors(r).length < 4 && (
                  <button
                    onClick={() => addFactor(r.key)}
                    title="Add another multiplier"
                    className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-1"
                  >
                    + ×
                  </button>
                )}
                <span className="text-xs text-zinc-400 font-medium">= {Number(r.qty) || 0}</span>
              </div>
            )}
            {notesOpen.has(r.key) && (
              <input
                value={r.notes}
                onChange={(e) => updateRow(r.key, { notes: e.target.value })}
                placeholder="Notes — vendor, assumptions, confirm rate…"
                className={`${inputCls} w-full mt-1.5 text-xs text-zinc-300`}
              />
            )}
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
          <a
            href="/admin/expenses/rates"
            target="_blank"
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors"
          >
            Edit library rates →
          </a>
        </div>

        <div className="px-3 py-2.5 border-t border-zinc-800">
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
