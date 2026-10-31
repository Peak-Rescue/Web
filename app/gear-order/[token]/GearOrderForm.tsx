'use client'

import { useState } from 'react'
import { submitGearOrder } from './actions'
import { orderTotal, safeLink, sizeRows, sizesTotal, type GearOrderLine, type SizeRow } from '@/lib/gear-orders'
import GearSizeRows from '@/components/GearSizeRows'
import { fmtMoney } from '@/lib/expenses'

const input = 'bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

type Answer = { qty: string; removed: boolean; note: string; sizes: SizeRow[] }

function ItemLink({ url, children }: { url?: string | null; children: React.ReactNode }) {
  const href = safeLink(url)
  if (!href) return <>{children}</>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 decoration-zinc-600 hover:decoration-white hover:text-white transition-colors"
    >
      {children}
    </a>
  )
}

export default function GearOrderForm({
  token,
  lines,
  alreadyAnswered,
  defaultNote,
  defaultName,
  standalone,
  draft,
}: {
  token: string
  lines: GearOrderLine[]
  alreadyAnswered: boolean
  defaultNote: string
  defaultName: string
  standalone: boolean
  draft: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, {
      qty: l.qty_wanted === null ? '' : String(l.qty_wanted),
      removed: l.removed,
      note: l.client_note ?? '',
      sizes: sizeRows(l.size_options, l.sizes),
    }]))
  )
  const [name, setName] = useState(defaultName)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState(defaultNote)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const set = (id: string, patch: Partial<Answer>) =>
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }))

  // Once a line is split into sizes, they are its quantity.
  const qtyOf = (a: Answer | undefined): string =>
    a?.sizes.length ? String(sizesTotal(a.sizes)) : a?.qty ?? ''

  const wanted = lines.filter((l) => !answers[l.id]?.removed && Number(qtyOf(answers[l.id]) || 0) > 0).length

  const { total, unpriced, anyPriced } = orderTotal(lines.map((l) => ({
    qty: Number(qtyOf(answers[l.id]) || 0),
    removed: answers[l.id]?.removed ?? false,
    unit_price: l.unit_price,
  })))

  async function submit() {
    const nameless = lines.find((l) => {
      const a = answers[l.id]
      return !a?.removed && a?.sizes.some((s) => Number(s.qty) > 0 && !s.size.trim())
    })
    if (nameless) { setError(`Say which size you want on ${nameless.name}`); return }

    setBusy(true); setError(null)
    const res = await submitGearOrder(token, {
      name, title, note,
      lines: lines.map((l) => ({
        id: l.id,
        qty: qtyOf(answers[l.id]) === '' ? null : Number(qtyOf(answers[l.id])),
        sizes: answers[l.id]?.sizes ?? [],
        removed: answers[l.id]?.removed ?? false,
        note: answers[l.id]?.note ?? null,
      })),
    })
    setBusy(false)
    if (res.ok) setDone(true)
    else setError(res.error)
  }

  if (done) {
    return (
      <div className="mt-8 rounded-lg border border-teal-800 bg-teal-950/40 p-6">
        <h2 className="text-lg font-semibold text-teal-200">Thank you — we&rsquo;ve got it</h2>
        <p className="text-sm text-zinc-300 mt-2">
          {standalone ? 'Your list is with us and we’ll be in touch.' : 'Your list is with us and goes to purchasing from here.'} If anything changes, this same link stays open —
          come back and send it again.
        </p>
      </div>
    )
  }

  // Grouped the way the gear list itself is, so a long list reads as sections
  // rather than one column of eighty rows.
  const groups = lines.reduce<{ name: string; lines: GearOrderLine[] }[]>((acc, l) => {
    const key = l.category ?? 'Other'
    const g = acc.find((x) => x.name === key)
    if (g) g.lines.push(l)
    else acc.push({ name: key, lines: [l] })
    return acc
  }, [])

  return (
    <div className="mt-8">
      {groups.map((g) => (
        <div key={g.name} className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">{g.name}</h2>
          <div className="space-y-2">
            {g.lines.map((l) => {
              const a = answers[l.id]
              return (
                <div
                  key={l.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    a?.removed ? 'border-zinc-800/60 bg-zinc-900/30' : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${a?.removed ? 'text-zinc-600 line-through' : ''}`}>
                        {/* The link is to the product, so that is the name that
                            carries it. A line with no product has only the one. */}
                        {l.product ? l.name : <ItemLink url={l.url}>{l.name}</ItemLink>}
                      </p>
                      {l.product && (
                        <p className="text-xs text-zinc-300 mt-0.5"><ItemLink url={l.url}>{l.product}</ItemLink></p>
                      )}
                      {l.detail && <p className="text-xs text-zinc-500 mt-0.5">{l.detail}</p>}
                      {l.qty_offered && (
                        <p className="text-[11px] text-zinc-600 mt-0.5">We suggested: {l.qty_offered}</p>
                      )}
                      {l.unit_price != null && (
                        <p className="text-xs text-zinc-400 mt-1">{fmtMoney(Number(l.unit_price))} each</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="sr-only" htmlFor={`qty-${l.id}`}>Quantity for {l.name}</label>
                      {a?.sizes.length ? (
                        <span id={`qty-${l.id}`} className="text-sm text-zinc-300 w-20 text-center">
                          {sizesTotal(a.sizes)} total
                        </span>
                      ) : (
                        <>
                          <input
                            id={`qty-${l.id}`}
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            disabled={a?.removed}
                            value={a?.qty ?? ''}
                            onChange={(e) => set(l.id, { qty: e.target.value })}
                            placeholder="—"
                            className={`${input} w-20 text-center disabled:opacity-30`}
                          />
                          {standalone && !a?.removed && (
                            <button
                              type="button"
                              onClick={() => set(l.id, { sizes: [{ size: '', qty: a?.qty ?? '' }] })}
                              className="text-xs px-2.5 py-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              By size
                            </button>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => set(l.id, { removed: !a?.removed })}
                        className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${
                          a?.removed
                            ? 'border-zinc-700 text-zinc-300 hover:text-white'
                            : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {a?.removed ? 'Put back' : 'Not needed'}
                      </button>
                    </div>
                  </div>
                  {standalone && !a?.removed && (a?.sizes.length ?? 0) > 0 && (
                    <GearSizeRows
                      fixed={(l.size_options ?? []).length > 0 && a?.sizes.length === (l.size_options ?? []).length}
                      rows={a?.sizes ?? []}
                      onChange={(sizes) => set(l.id, { sizes })}
                      input={input}
                    />
                  )}
                  {!a?.removed && (
                    <input
                      value={a?.note ?? ''}
                      onChange={(e) => set(l.id, { note: e.target.value })}
                      placeholder="Note on this item (optional)"
                      className={`${input} w-full mt-2 text-xs`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mt-8">
        <label className="block text-xs text-zinc-400 mb-1">Anything else we should know?</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Delivery timing, sizes, something you'd rather talk through…"
          className={`${input} w-full resize-y`}
        />
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Your name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full`} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Title / unit (optional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} w-full`} />
          </div>
        </div>
        {error && <p className="text-sm text-pr-red mt-3">{error}</p>}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button
            onClick={submit}
            disabled={busy || !name.trim() || draft}
            className="px-5 py-2.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {busy ? 'Sending…' : alreadyAnswered ? 'Send updated list' : 'Send this back to us'}
          </button>
          <p className="text-xs text-zinc-500">
            {wanted} item{wanted === 1 ? '' : 's'} requested
            {anyPriced && <> · {fmtMoney(total)}{unpriced > 0 ? ` + ${unpriced} unpriced` : ''}</>}
          </p>
        </div>
      </div>
    </div>
  )
}
