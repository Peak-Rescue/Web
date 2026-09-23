'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtMoney, round2 } from '@/lib/expenses'
import { impliedMargin, factorValue, prefillFactor, unitFactorNames, dayCountFollowsCourse, isTripLine } from '@/lib/estimates'
import { publishCoaPrice, retractCoaPrice } from '@/lib/live-coa-prices'
import { saveEstimate, deleteEstimateCoa, setEstimateArchived, type EstimateItemInput } from '@/app/admin/courses/finance-actions'
import { useRouter } from 'next/navigation'
import { CalculatorIcon, NotesIcon } from '@/components/TaskIcons'
import { useUnsavedGuard, withSaveTimeout } from '@/components/useUnsavedGuard'
import TrashIcon from '@/components/TrashIcon'
import InfoHint from '@/components/InfoHint'
import { type OptionRelation } from '@/lib/quotes'
import { btn, card } from '@/lib/ui'

export type PricingRate = { id: string; label: string; unit: string | null; rate: number }

// The course as the estimator's numbers see it. Two day counts: `days` is
// what the course runs with breaks taken out — what a person is paid for —
// and `calendarDays` is first day to last with the breaks left in, which is
// what the vehicle and the room are held for.
export type CourseCounts = {
  instructors: number
  students: number | null
  days: number | null
  calendarDays: number | null
}

type Row = {
  key: number
  label: string
  qty: string
  rate: string
  notes: string
  factors: Factors | null
  flabels: (string | null)[]
  rateId: string | null // library rate the line came from — survives renames
  ack: CourseCounts | null // counts when this quantity was deliberately kept
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
  initialPriceOverride,
  initialItems,
  rates,
  canDelete,
  canArchive,
  solo,
  counts,
  initialStartsAt,
  initialEndsAt,
  initialExtendsId,
  initialRelation,
  siblings,
  courseSpan,
}: {
  instanceId: string
  estimateId: string | null // null = not yet persisted (first COA, untouched)
  initialTitle: string
  initialMargin: number
  initialPriceOverride: number | null // hand-set price; null = use the calculated one
  initialItems: { label: string; qty: number | null; rate: number; notes: string | null; factors: number[] | null; factor_labels: (string | null)[] | null; rate_id: string | null; drift_ack: { i: number; s: number | null; d: number | null; c?: number | null } | null }[]
  rates: PricingRate[]
  canDelete: boolean
  /** Whether this COA can be set aside — false when it is the only live one,
      since a course with nothing in play has nothing to compare. */
  canArchive: boolean
  solo: boolean // only COA on the course — the default "COA n" title stays hidden until a second exists
  counts: CourseCounts
  /** The window this COA prices, null for each end that follows the course. */
  initialStartsAt: string | null
  initialEndsAt: string | null
  /** The COA this one prices an addition to, when the addition goes on one in
      particular rather than on whatever the client takes. */
  initialExtendsId: string | null
  /** What this COA is to the others, null until somebody says. */
  initialRelation: OptionRelation | null
  /** The other live COAs on this course that an addition could be built on —
      already filtered to the ones that are not additions themselves. */
  siblings: { id: string; title: string }[]
  /** The course's own dates — what the empty boxes are standing in for. */
  courseSpan: { starts_at: string | null; ends_at: string | null }
}) {
  const router = useRouter()
  const estimateIdRef = useRef<string | null>(estimateId)
  const [persistedId, setPersistedId] = useState<string | null>(estimateId)
  const [title, setTitle] = useState(initialTitle)
  const [startsAt, setStartsAt] = useState(initialStartsAt ?? '')
  const [endsAt, setEndsAt] = useState(initialEndsAt ?? '')
  // The dates stay out of the way until they are worth looking at: a COA that
  // prices the whole course has nothing to say about its own length, and two
  // date boxes on every panel would be two boxes nobody reads.
  const [spanOpen, setSpanOpen] = useState(Boolean(initialStartsAt || initialEndsAt))
  const [extendsId, setExtendsId] = useState(initialExtendsId ?? '')
  const [relation, setRelation] = useState<OptionRelation | ''>(initialRelation ?? '')
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const nextKey = useRef(initialItems.length)
  const [rows, setRows] = useState<Row[]>(
    initialItems.map((i, idx) => ({
      key: idx,
      label: i.label,
      qty: i.qty === null ? '' : String(i.qty),
      rate: String(i.rate),
      notes: i.notes ?? '',
      factors: i.factors && i.factors.length >= 2 ? i.factors.map(String) : null,
      flabels: i.factor_labels ?? [],
      rateId: i.rate_id,
      // `c` postdates the column: a line kept before the calendar span was a
      // number of its own is read as having been kept for the span it has
      // now, so an old decision is not reopened for a course nobody touched.
      ack: i.drift_ack
        ? {
            instructors: i.drift_ack.i,
            students: i.drift_ack.s,
            days: i.drift_ack.d,
            calendarDays: i.drift_ack.c === undefined ? counts.calendarDays : i.drift_ack.c,
          }
        : null,
    }))
  )
  const [notesOpen, setNotesOpen] = useState<Set<number>>(
    () => new Set(initialItems.map((i, idx) => (i.notes ? idx : -1)).filter((k) => k >= 0))
  )
  const [calcOpen, setCalcOpen] = useState<Set<number>>(new Set())
  const [driftOpen, setDriftOpen] = useState(false)
  const [margin, setMargin] = useState(initialMargin)
  // Held as a string so the field can be empty — empty means "no override,
  // use the calculated price", which is different from an override of $0.
  const [override, setOverride] = useState(initialPriceOverride === null ? '' : String(initialPriceOverride))
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const stateRef = useRef({ rows, margin, title: initialTitle, override, startsAt: initialStartsAt ?? '', endsAt: initialEndsAt ?? '', extendsId: initialExtendsId ?? '', relation: (initialRelation ?? '') as OptionRelation | '' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)
  const rerun = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState(false)

  const dirty = status === 'pending' || status === 'saving' || status === 'error'
  useUnsavedGuard({
    dirty,
    message:
      status === 'error'
        ? 'This estimate failed to save. Leave anyway and lose the changes?'
        : 'This estimate is still saving. Leave anyway? Changes may be lost.',
    onLeaveAttempt: () => {
      if (status === 'pending' || status === 'error') void flush()
    },
    onBlocked: () => {
      setHighlight(true)
      setTimeout(() => setHighlight(false), 2500)
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  })

  function schedule(nextRows: Row[], nextMargin: number, nextTitle?: string, nextOverride?: string) {
    setRows(nextRows)
    setMargin(nextMargin)
    if (nextTitle !== undefined) setTitle(nextTitle)
    if (nextOverride !== undefined) setOverride(nextOverride)
    stateRef.current = {
      ...stateRef.current,
      rows: nextRows,
      margin: nextMargin,
      title: nextTitle ?? stateRef.current.title,
      override: nextOverride ?? stateRef.current.override,
    }
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
  }

  // The COA's own window. Saved on the same debounce as the rest of the panel,
  // because a date is an edit like any other — but it also re-derives the day
  // counts on the server, so the page is refreshed once it lands: the drift
  // warnings and the prefilled quantities are the point of changing it.
  function scheduleSpan(nextStart: string, nextEnd: string) {
    setStartsAt(nextStart)
    setEndsAt(nextEnd)
    stateRef.current = { ...stateRef.current, startsAt: nextStart, endsAt: nextEnd }
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush({ thenRefresh: true }), SAVE_DEBOUNCE_MS)
  }

  // Which COA this one is an addition to. Refreshes like the span does, since
  // it changes what the panel has to warn about.
  function scheduleRelation(nextRelation: OptionRelation | '', nextExtends: string) {
    // Only an addition may name a parent, the same rule the column carries, so
    // switching away from "addition" cannot leave a stale one behind.
    const parent = nextRelation === 'addition' ? nextExtends : ''
    setRelation(nextRelation)
    setExtendsId(parent)
    stateRef.current = { ...stateRef.current, relation: nextRelation, extendsId: parent }
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush({ thenRefresh: true }), SAVE_DEBOUNCE_MS)
  }

  async function flush(opts: { thenRefresh?: boolean } = {}) {
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
      const { rows: r, margin: m, title: t, override: o, startsAt: sa, endsAt: ea, extendsId: ex, relation: rel } = stateRef.current
      const items: EstimateItemInput[] = r
        .filter((row) => row.label.trim())
        .map((row) => {
          const trimmed = row.factors ? trimFactors(row.factors).map((f) => Number(f) || 0) : []
          const trimmedLabels = trimmed.map((_, i) => row.flabels[i] ?? null)
          return {
            label: row.label,
            qty: row.qty.trim() === '' ? null : Number(row.qty) || 0,
            rate: Number(row.rate) || 0,
            notes: row.notes || null,
            factors: trimmed.length >= 2 ? trimmed : null,
            factor_labels: trimmed.length >= 2 ? trimmedLabels : null,
            rate_id: row.rateId,
            drift_ack: row.ack ? { i: row.ack.instructors, s: row.ack.students, d: row.ack.days, c: row.ack.calendarDays } : null,
          }
        })
      const priceOverride = o.trim() === '' ? null : Number(o)
      const saved = await withSaveTimeout(
        saveEstimate(instanceId, estimateIdRef.current, {
          title: t,
          margin: m,
          priceOverride: priceOverride !== null && Number.isFinite(priceOverride) ? priceOverride : null,
          items,
          startsAt: sa.trim() === '' ? null : sa,
          endsAt: ea.trim() === '' ? null : ea,
          extendsId: ex.trim() === '' ? null : ex,
          relation: rel === '' ? null : rel,
        })
      )
      estimateIdRef.current = saved.id
      setPersistedId(saved.id)
      setStatus('saved')
      if (opts.thenRefresh) router.refresh()
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

  // The course's own number for a factor, and the number a fresh line starts
  // at — both from lib/estimates, so what gets prefilled and what counts as
  // out of date are answered by the same rules.
  function countForFactor(name: string, rateLabel: string): number | null {
    return factorValue(name, rateLabel, counts)
  }

  // A factor that was built from a course number and no longer matches it.
  // Only lines whose quantity is an explicit breakdown (or a single-dimension
  // rate, where the qty *is* the count) can drift — a hand-typed qty on a
  // multi-factor rate says nothing about how it was arrived at, so it is left
  // alone rather than guessed at.
  // Keeping a quantity means "this is right for a course of this shape", not
  // "never ask again" — so the moment the course's length, instructors or
  // students move, the decision is worth revisiting and the line speaks up.
  function keptForThisCourse(ack: CourseCounts | null): boolean {
    return (
      ack !== null &&
      ack.instructors === counts.instructors &&
      ack.students === counts.students &&
      ack.days === counts.days &&
      ack.calendarDays === counts.calendarDays
    )
  }

  type Drift = { idx: number; name: string; current: number; expected: number }
  function rowDrifts(r: Row): Drift[] {
    if (keptForThisCourse(r.ack)) return []
    const libLabels = factorLabels(r)
    const explicit = r.factors !== null
    if (!explicit && libLabels.length !== 1) return []
    const factors = rowFactors(r)
    return factors.flatMap((f, i) => {
      const name = (libLabels[i] ?? r.flabels[i] ?? '').trim()
      if (!name) return []
      // A bare per-day line is usually a judgment about which days are being
      // paid for, not a copy of the course's length: a venue can be held for
      // eight days on a five-day course. Those are left alone. The rental
      // vehicle and the lodging are the exception — they run the course's
      // dates, breaks and all, plus a day at each end, so they are read off
      // the calendar and have to move with it. A bare headcount always
      // tracks: nobody types a student number meaning anything other than the
      // students. And a day inside a breakdown somebody built by hand tracks
      // the course too.
      if (!explicit && /^(day|night)/i.test(name) && !dayCountFollowsCourse(r.label)) return []
      const expected = countForFactor(name, r.label)
      const current = f.trim() === '' ? 1 : Number(f) || 0
      return expected !== null && expected !== current ? [{ idx: i, name, current, expected }] : []
    })
  }

  // Pull the named factors up to the course's current numbers and recompute
  // the quantity from the breakdown. Everything else on the line — the rate,
  // the notes, factors nobody can derive — is untouched.
  function syncRow(r: Row): Row {
    const drifts = rowDrifts(r)
    if (drifts.length === 0) return r
    const next = [...rowFactors(r)]
    for (const d of drifts) next[d.idx] = String(d.expected)
    const product = next.reduce((p, f) => p * (f.trim() === '' ? 1 : Number(f) || 0), 1)
    return { ...r, factors: next.length >= 2 ? next : null, qty: String(round2(product)), ack: null }
  }

  // Keep these quantities as they are, against the course as it stands now.
  function keepRows(keys: number[]) {
    const wanted = new Set(keys)
    schedule(rows.map((r) => (wanted.has(r.key) ? { ...r, ack: counts } : r)), margin)
  }

  function syncRows(keys: number[]) {
    const wanted = new Set(keys)
    schedule(rows.map((r) => (wanted.has(r.key) ? syncRow(r) : r)), margin)
  }

  function addFromLibrary(rateId: string) {
    const lib = rates.find((r) => r.id === rateId)
    if (!lib) return
    const labels = unitFactorNames(lib.unit)
    const values = labels.map((l) => prefillFactor(l, lib.label, counts))
    // Anything the course cannot supply arrives blank rather than as a 1 that
    // reads like a real number.
    const unknown = values.some((v) => v === null)
    const qty = unknown ? '' : String((values as number[]).reduce((p, v) => p * v, 1))
    schedule(
      [...rows, {
        key: nextKey.current++,
        label: lib.label,
        qty,
        rate: String(lib.rate),
        notes: '',
        factors: !unknown && labels.length >= 2 ? values.map(String) : null,
        flabels: [],
        rateId: lib.id,
        ack: null,
      }],
      margin
    )
  }

  function addCustom() {
    schedule([...rows, { key: nextKey.current++, label: '', qty: '', rate: '', notes: '', factors: null, flabels: [], rateId: null, ack: null }], margin)
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
    const n = Math.max(factorLabels(r).length, 1)
    return [r.qty.trim() || '1', ...Array.from({ length: n - 1 }, () => '1')]
  }

  function removeFactor(key: number, idx: number) {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const current = rowFactors(row)
    if (current.length <= 1) return
    const next = current.filter((_, i) => i !== idx)
    const nextLabels = row.flabels.filter((_, i) => i !== idx)
    const product = next.reduce((p, f) => p * (f.trim() === '' ? 1 : Number(f) || 0), 1)
    updateRow(key, { factors: next.length >= 2 ? next : null, flabels: nextLabels, qty: String(round2(product)) })
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
    // Typing a quantity is a fresh decision about it, so it stops counting as
    // one already kept.
    const clearsAck = ('qty' in patch || 'factors' in patch) && !('ack' in patch)
    schedule(rows.map((r) => (r.key === key ? { ...r, ...patch, ...(clearsAck ? { ack: null } : {}) } : r)), margin)
  }

  function removeRow(key: number) {
    schedule(rows.filter((r) => r.key !== key), margin)
  }

  // The library rate behind a line: by stored id first (survives library
  // renames), else by exact label (older lines and hand-typed matches).
  function rateFor(r: { rateId: string | null; label: string }): PricingRate | undefined {
    return (r.rateId ? rates.find((x) => x.id === r.rateId) : undefined) ?? rates.find((x) => x.label === r.label)
  }

  // What the quantity means for library items: "per mile" → "miles",
  // "per student per day" → "student × day". Null for custom lines.
  function qtyFactors(r: Row): string | null {
    const unit = rateFor(r)?.unit
    if (!unit) return null
    const factors = unit.replace(/^per\s+/, '').split(/\s+per\s+/)
    return factors.length > 1 ? factors.join(' × ') : `${factors[0]}s`
  }

  // Boxes for a line, named by its rate's unit. Extra boxes beyond the unit
  // are spares the user named themselves.
  function factorLabels(r: Row): string[] {
    return unitFactorNames(rateFor(r)?.unit ?? null)
  }

  // The rate's unit text, e.g. "per mile", "per person per night".
  function rateUnit(r: Row): string | null {
    return rateFor(r)?.unit ?? null
  }

  // Hint under the qty box: the saved breakdown ("= 3 × 5") when there is
  // one, else what the quantity means for the rate's unit.
  function qtyHint(r: Row): string | null {
    const breakdown = r.factors ? trimFactors(r.factors) : []
    if (breakdown.length >= 2) return `= ${breakdown.join(' × ')}`
    return qtyFactors(r)
  }

  // Lines nobody has put a number on yet. Kept distinct from a quantity of
  // zero, which is a real answer — none of this cost.
  const unsetRows = rows.filter((r) => r.label.trim() && r.qty.trim() === '')

  // Lines still carrying the numbers the course had when they were written.
  const driftedRows = rows.map((r) => ({ row: r, drifts: rowDrifts(r) })).filter((d) => d.drifts.length > 0)
  const driftsByKey = new Map(driftedRows.map((d) => [d.row.key, d.drifts]))
  const countSummary = [
    counts.instructors ? `${counts.instructors} instructor${counts.instructors === 1 ? '' : 's'}` : null,
    counts.students ? `${counts.students} student${counts.students === 1 ? '' : 's'}` : null,
    counts.days ? `${counts.days} day${counts.days === 1 ? '' : 's'}` : null,
    // Only worth saying when a break has pulled the two apart; otherwise it
    // is the same number twice.
    counts.calendarDays && counts.calendarDays !== counts.days
      ? `${counts.calendarDays} on the calendar`
      : null,
  ].filter(Boolean).join(' · ')

  const subtotal = round2(rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0))
  const marginAmount = round2(subtotal * margin)
  const calculated = round2(subtotal + marginAmount)
  // What this COA actually quotes at, and — when that's a hand-set number —
  // the margin it really implies, so overriding can't hide what it did.
  const overridden = override.trim() !== '' && Number.isFinite(Number(override))
  const quotePrice = overridden ? round2(Number(override)) : calculated
  const realMargin = overridden ? impliedMargin(subtotal, quotePrice) : null

  // Tell the quote fields what this COA costs as it's typed, so pulling a
  // price never waits on the save + revalidate round trip.
  useEffect(() => {
    if (persistedId) publishCoaPrice(persistedId, quotePrice)
  }, [persistedId, quotePrice])
  useEffect(() => {
    if (!persistedId) return
    return () => retractCoaPrice(persistedId)
  }, [persistedId])

  const inputCls = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  // What the span line says when it is closed: the COA's own window when it has
  // one, and otherwise nothing — a COA that prices the whole course is the
  // ordinary case and does not need a sentence about it.
  const fmtDay = (d: string) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const ownSpan = Boolean(startsAt || endsAt)
  const hasSiblings = siblings.length > 0
  const parent = siblings.find((sib) => sib.id === extendsId) ?? null
  // Lines an addition must not carry: the deployment is already priced in the
  // COA it extends. Warned about rather than refused, because the numbers are
  // the estimator's to set — but warned about with the fix attached, since the
  // seeded default lines put them here without being asked.
  const tripRows = relation === 'addition' ? rows.filter((r) => r.label.trim() && isTripLine(r.label)) : []
  const spanFrom = startsAt || courseSpan.starts_at
  const spanTo = endsAt || courseSpan.ends_at
  const spanLabel =
    spanFrom && spanTo
      ? `${fmtDay(spanFrom)} – ${fmtDay(spanTo)}${counts.days ? ` · ${counts.days} day${counts.days === 1 ? '' : 's'}` : ''}`
      : 'Set dates'

  return (
    <div ref={rootRef} className={highlight ? 'ring-1 ring-pr-red-light rounded' : undefined}>
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* The COA's name is a heading you can type in, and the only thing
            that said so was a border appearing on hover. A dotted underline
            says it standing still. */}
        <input
          value={solo && title === 'COA 1' ? '' : title}
          onChange={(e) => schedule(rows, margin, e.target.value)}
          placeholder={solo ? 'Estimate name (optional)' : ''}
          className="bg-transparent border-b border-dashed border-zinc-800 hover:border-zinc-600 focus:border-solid focus:border-zinc-500 focus:outline-none text-sm font-semibold flex-1 min-w-0 max-w-md placeholder:text-zinc-600 placeholder:font-normal"
          title="Name this COA (e.g. 'Drive team', 'Fly-in option')"
        />
        <div className="flex items-center gap-3">
          <span className={`text-xs ${status === 'error' ? 'text-pr-red-light' : status === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed — not saved' : status === 'pending' ? '…' : ''}
          </span>
          {status === 'error' && (
            <button onClick={() => void flush()} className="text-xs text-zinc-300 underline hover:text-white">
              Retry
            </button>
          )}
          {canArchive && persistedId && (
            <button
              onClick={async () => {
                if (archiving) return
                setArchiving(true)
                try {
                  // Flush first: setting aside re-renders the panel as a
                  // summary row, and an in-flight edit would go with it.
                  await flush()
                  await setEstimateArchived(instanceId, estimateIdRef.current!, true)
                  router.refresh()
                } finally {
                  setArchiving(false)
                }
              }}
              disabled={archiving}
              className={btn.quiet}
              title="Collapse this COA out of the comparison — it keeps its lines and can be brought back"
            >
              Set aside
            </button>
          )}
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
              className={btn.danger}
            >
              Delete COA
            </button>
          )}
        </div>
      </div>

      {/* The COA's window. A COA almost always prices the whole course, so this
          is one quiet line until somebody opens it — and it stops being quiet
          the moment a COA carries its own dates, because then the panel's day
          counts are not the course's and the reader has to be told. */}
      <div className="mb-2 flex items-center gap-2 flex-wrap text-[11px]">
        <button
          type="button"
          onClick={() => setSpanOpen((o) => !o)}
          className={`border-b border-dashed transition-colors ${
            ownSpan
              ? 'text-amber-400/90 border-amber-700/60 hover:text-amber-200'
              : 'text-zinc-600 border-zinc-800 hover:text-zinc-400'
          }`}
          title={ownSpan ? 'This COA prices part of the course' : 'This COA prices the whole course'}
        >
          {ownSpan ? `Prices ${spanLabel}` : spanLabel}
        </button>
        <InfoHint text="A COA can price part of the course — the first week of a blended course, quoted beside the pair. Its day counts, prefilled quantities and out-of-date warnings then follow these dates instead of the course's. Empty means the whole course, which is what nearly every COA wants." />
        {/* What this COA is to the others. Unanswered while a second COA exists
            is a gap, not a default: which combinations of tick boxes are real
            money is the whole of what an options quote says, and by omission it
            used to say "any of them". */}
        {hasSiblings && (
          <>
            <select
              value={relation === 'addition' && extendsId ? `addition:${extendsId}` : relation}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('addition:')) scheduleRelation('addition', v.slice('addition:'.length))
                else scheduleRelation(v as OptionRelation | '', '')
              }}
              className={`bg-zinc-800 border rounded px-1.5 py-1 text-[11px] focus:outline-none ${
                relation === '' ? 'border-amber-600 text-amber-400' : 'border-zinc-700 text-zinc-300'
              }`}
              title="Which combinations of these options a client may accept"
            >
              <option value="">Relationship not set…</option>
              <option value="standalone">Stands on its own</option>
              <option value="alternative">Either/or with the other options</option>
              <option value="addition">Addition to whatever they take</option>
              {siblings.map((sib) => (
                <option key={sib.id} value={`addition:${sib.id}`}>Addition to {sib.title}</option>
              ))}
            </select>
            <InfoHint text="Stands on its own: takeable alone or with anything. Either/or: one of a set the client picks between — the drive team and the fly-in are one course reached two ways, and both would bill two trips for one. Addition: priced as the difference and taken on top, either of one named option (a second week the first week's travel got the crew to) or of whatever they take (a gear package, the same money for one week or two)." />
          </>
        )}
        {spanOpen && (
          <span className="flex items-center gap-1.5">
            <input
              type="date"
              value={startsAt}
              min={courseSpan.starts_at ?? undefined}
              max={endsAt || courseSpan.ends_at || undefined}
              onChange={(e) => scheduleSpan(e.target.value, endsAt)}
              className={`${inputCls} text-[11px] py-1`}
              title="First day this COA prices — empty follows the course"
            />
            <span className="text-zinc-600">→</span>
            <input
              type="date"
              value={endsAt}
              min={startsAt || courseSpan.starts_at || undefined}
              max={courseSpan.ends_at ?? undefined}
              onChange={(e) => scheduleSpan(startsAt, e.target.value)}
              className={`${inputCls} text-[11px] py-1`}
              title="Last day this COA prices — empty follows the course"
            />
            {ownSpan && (
              <button
                type="button"
                onClick={() => scheduleSpan('', '')}
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
                title="Price the whole course again"
              >
                Whole course
              </button>
            )}
          </span>
        )}
      </div>

      {tripRows.length > 0 && (
        <div className="mb-1.5 text-[11px] flex items-center gap-2 flex-wrap text-zinc-500">
          <InfoHint
            below
            caution
            text="This COA is an addition, so the trip out and back is already priced in the COA it extends. Left here, a client accepting both pays to travel twice."
          />
          <span className="text-amber-500/80">
            {tripRows.length === 1 ? 'A line prices' : 'Lines price'} the trip {parent ? `already in ${parent.title}` : 'twice'}
          </span>
          <span className="text-zinc-600 min-w-0 truncate">{tripRows.map((r) => r.label.trim()).join(', ')}</span>
          <button
            type="button"
            onClick={() => schedule(rows.filter((r) => !tripRows.includes(r)), margin)}
            className="text-amber-400 hover:text-amber-200 transition-colors underline decoration-amber-800"
            title={`Remove ${tripRows.length === 1 ? 'it' : 'them'} — ${parent?.title ?? 'the other COA'} pays for the trip`}
          >
            Remove
          </button>
        </div>
      )}

      {unsetRows.length > 0 && (
        <div className="mb-1.5 text-[11px] flex items-center gap-2 flex-wrap text-zinc-500">
          <InfoHint
            below
            caution
            text="These lines are in the estimate with no quantity — miles, admin days, meals. The course cannot guess them, and the cost total leaves them out until you do."
          />
          <span className="text-amber-500/80">
            {unsetRows.length} line{unsetRows.length === 1 ? '' : 's'} need{unsetRows.length === 1 ? 's' : ''} a number
          </span>
          <span className="text-zinc-600 min-w-0 truncate">{unsetRows.map((r) => r.label.trim()).join(', ')}</span>
        </div>
      )}

      {driftedRows.length > 0 && (
        <div className="mb-1.5 text-[11px]">
          <div className="flex items-center gap-2 flex-wrap text-zinc-500">
            <InfoHint below caution text="Lines whose quantity was built from the course's instructors, students or days, and no longer matches Details. Update recomputes the quantity; Keep leaves it, and asks again only if the course changes shape." />
            <button
              onClick={() => setDriftOpen((o) => !o)}
              className="text-amber-500/80 hover:text-amber-300 transition-colors"
              title="Which lines, and what would change"
            >
              {driftedRows.length} line{driftedRows.length === 1 ? '' : 's'} {driftedRows.length === 1 ? 'uses' : 'use'} older numbers
            </button>
            {countSummary && <span className="text-zinc-600">course is now {countSummary}</span>}
            <button
              onClick={() => syncRows(driftedRows.map((d) => d.row.key))}
              className="text-zinc-500 hover:text-white underline underline-offset-2 transition-colors"
            >
              Update all
            </button>
          </div>
          {driftOpen && (
            <ul className="mt-1 ml-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
              {driftedRows.map(({ row, drifts }) => (
                <li key={row.key} className="flex items-center justify-between gap-3 text-zinc-500">
                  <span className="min-w-0 truncate">
                    <span className="text-zinc-400">{row.label || 'Untitled line'}</span>
                    {' — '}
                    {drifts.map((d) => `${d.name} ${d.current} → ${d.expected}`).join(', ')}
                  </span>
                  <span className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => syncRows([row.key])}
                      className="underline underline-offset-2 hover:text-white transition-colors"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => keepRows([row.key])}
                      title="Keep this quantity — asked again only if the course's length, instructors or students change"
                      className="underline underline-offset-2 hover:text-white transition-colors"
                    >
                      Keep
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={card}>
        <div className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <div key={r.key} className="px-3 py-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 min-w-0">
                <button
                  onClick={() => toggleNotes(r.key)}
                  title="Notes for this line"
                  className={`shrink-0 transition-colors ${r.notes || notesOpen.has(r.key) ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  <NotesIcon />
                </button>
                <button
                  onClick={() => toggleCalc(r.key)}
                  title={
                    driftsByKey.has(r.key)
                      ? `Built from older course numbers — ${driftsByKey.get(r.key)!.map((d) => `${d.name} ${d.current} → ${d.expected}`).join(', ')}`
                      : 'Quantity calculator — build qty from people × days × units'
                  }
                  className={`shrink-0 transition-colors ${
                    driftsByKey.has(r.key)
                      ? 'text-amber-400 hover:text-amber-300'
                      : r.factors || calcOpen.has(r.key)
                        ? 'text-zinc-300 hover:text-white'
                        : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  <CalculatorIcon />
                </button>
                <input
                  value={r.label}
                  onChange={(e) => updateRow(r.key, { label: e.target.value })}
                  placeholder="Line item"
                  className={`${inputCls} flex-1 min-w-0`}
                />
              </div>
              <div className="flex items-start gap-2 ml-auto">
                <div className="flex flex-col items-center w-20 shrink-0">
                  <input
                    type="number"
                    value={r.qty}
                    min="0"
                    step="1"
                    onChange={(e) => updateRow(r.key, { qty: e.target.value, factors: null })}
                    placeholder="—"
                    className={`${inputCls} w-20 text-right ${r.qty.trim() === '' ? 'border-amber-600' : ''}`}
                    title={qtyFactors(r) ? `Quantity = ${qtyFactors(r)}` : 'Quantity'}
                  />
                  {r.qty.trim() === '' ? (
                    <span className="mt-0.5 text-[10px] text-amber-500/80 text-center leading-tight">needs a number</span>
                  ) : (
                    qtyHint(r) && (
                      <span className="mt-0.5 text-[10px] text-zinc-600 text-center leading-tight">{qtyHint(r)}</span>
                    )
                  )}
                </div>
                <span className="text-zinc-600 text-xs mt-2.5 shrink-0">×&nbsp;&nbsp;$</span>
                <div className="flex flex-col items-center w-24 shrink-0">
                  <input
                    type="number"
                    value={r.rate}
                    min="0"
                    step="10"
                    onChange={(e) => updateRow(r.key, { rate: e.target.value })}
                    className={`${inputCls} w-24 text-right`}
                    title={rateUnit(r) ? `Dollars ${rateUnit(r)}` : 'Dollar rate'}
                  />
                  <span className="mt-0.5 text-[10px] text-zinc-600 text-center leading-tight">
                    {rateUnit(r) ?? 'dollars'}
                  </span>
                </div>
                <span className={`text-sm w-24 text-right shrink-0 mt-2 ${r.qty.trim() === '' ? 'text-zinc-600' : ''}`}>
                  {r.qty.trim() === '' ? '—' : fmtMoney(round2((Number(r.qty) || 0) * (Number(r.rate) || 0)))}
                </span>
                <button onClick={() => removeRow(r.key)} className="text-zinc-600 hover:text-pr-red-light text-sm shrink-0 mt-1.5">
                  <TrashIcon />
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
                        step="1"
                        onChange={(e) => setFactor(r.key, i, e.target.value)}
                        className={`${inputCls} w-16 text-right ${
                          driftsByKey.get(r.key)?.some((d) => d.idx === i) ? 'border-amber-600' : ''
                        }`}
                      />
                      {driftsByKey.get(r.key)?.filter((d) => d.idx === i).map((d) => (
                        <button
                          key={d.idx}
                          onClick={() => setFactor(r.key, i, String(d.expected))}
                          title={`The course now has ${d.expected} ${d.name}`}
                          className="mt-0.5 text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
                        >
                          → {d.expected}
                        </button>
                      ))}
                      {factorLabels(r)[i] ? (
                        <span className="mt-0.5 text-[10px] text-zinc-600">{factorLabels(r)[i]}</span>
                      ) : (
                        <span className="mt-0.5 flex items-center gap-1">
                          <input
                            value={r.flabels[i] ?? ''}
                            onChange={(e) => setFactorLabel(r.key, i, e.target.value)}
                            placeholder="name"
                            className="w-14 bg-transparent border-b border-zinc-800 focus:border-zinc-500 focus:outline-none text-[10px] text-zinc-400 text-center"
                          />
                          {i >= factorLabels(r).length && rowFactors(r).length > 1 && (
                            <button
                              onClick={() => removeFactor(r.key, i)}
                              title="Remove this multiplier"
                              className="text-[10px] text-zinc-600 hover:text-pr-red-light"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </span>
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
            <p className="px-3 py-3 text-sm text-zinc-500">No line items yet.</p>
          )}
        </div>

        {/* One row for the ways a line gets here. It was three strips stacked
            on each other — a select, a text button and an underlined link,
            three affordances for one job — which made the bottom of every COA
            look like the bottom of three. */}
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
          <button onClick={addCustom} className={btn.secondary}>
            + Custom item
          </button>
          <a href="/admin/expenses/rates" target="_blank" className={`ml-auto ${btn.quiet}`}>
            Rates library ↗
          </a>
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
          {/* The most-read four lines on the panel, and they were four
              right-aligned sentences in four weights. Label on the left,
              number on the right, the arithmetic in the order it happens, and
              the one figure that leaves this page — the quote price — last
              and heaviest. */}
          <div className="text-sm space-y-1 min-w-56">
            <div className="flex items-baseline justify-between gap-6">
              <span className="text-zinc-500">Cost</span>
              <span className="text-zinc-300 tabular-nums">
                {fmtMoney(subtotal)}
                {unsetRows.length > 0 && (
                  <span className="text-amber-500/80"> + {unsetRows.length} unpriced</span>
                )}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <span className="text-zinc-500">Margin {Math.round(margin * 100)}%</span>
              <span className="text-zinc-300 tabular-nums">{fmtMoney(marginAmount)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-6 pt-1 border-t border-zinc-800">
              <span className="text-zinc-500">Calculated</span>
              <span className={`tabular-nums ${overridden ? 'text-zinc-500' : 'text-zinc-200 font-medium'}`}>
                {fmtMoney(calculated)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 pt-0.5">
              <span className="text-zinc-300">Quote price</span>
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-600 text-xs">$</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={override}
                  onChange={(e) => schedule(rows, margin, undefined, e.target.value)}
                  placeholder={String(calculated)}
                  title="Set the price by hand — leave empty to quote the calculated number"
                  className={`${inputCls} w-28 text-right tabular-nums ${overridden ? 'font-semibold' : 'placeholder:text-zinc-500'}`}
                />
              </span>
            </div>
            {overridden && (
              <p className="text-[10px] text-zinc-500 text-right">
                set by hand{realMargin !== null ? ` · ${Math.round(realMargin * 100)}% margin` : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
