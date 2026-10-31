'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddGear, type GearItem } from '@/app/admin/gear/GearListEditor'
import { fmtMoney } from '@/lib/expenses'
import { GEAR_CATEGORIES, brandsIn, productName, unwrap } from '@/lib/gear'
import CategorySelect from '@/app/admin/gear/CategorySelect'
import {
  GEAR_ORDER_STATUS_LABEL, GEAR_ORDER_STATUS_STYLE, isSized, needsProduct, netUnitPrice, orderTotal, typedOverCatalog, sizesTotal, workFirst, safeLink, sizeRows,
  type GearOrder, type GearOrderLine,
} from '@/lib/gear-orders'
import GearSizeRows from '@/components/GearSizeRows'
import ClientPicker from '@/components/ClientPicker'
import type { ClientRow } from '@/lib/clients'
import SizeOptionsField from '@/components/SizeOptionsField'
import PdfLink from '@/components/PdfLink'
import Link from 'next/link'
import { planQty, planSplit } from '@/lib/gear-order-split'
import TrashIcon from '@/components/TrashIcon'
import {
  addCatalogLine, addLineProduct, addOneOffLine, deleteStandaloneLine, deleteStandaloneOrder, sendStandaloneOrder,
  saveLineToCatalog, setLineCategory, setLineProduct, splitStandaloneOrder, undoStandaloneSplit, updateStandaloneLine, updateStandaloneOrder,
} from '../actions'

const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

type Run = (fn: () => Promise<unknown>) => void

export type SplitPartRow = {
  id: string; title: string; status: GearOrder['status']; sent_at: string | null; discount_percent: number | null
  gear_order_lines: { qty_wanted: number | null; unit_price: number | null; discount_percent: number | null; removed: boolean }[]
}
// Numbers being typed, ahead of the save.
type Draft = { qty?: number | null; price?: number | null; discount?: number | null }

export default function OrderEditor({
  order, catalog, clients, parts, parent,
}: {
  order: GearOrder
  catalog: GearItem[]
  clients: ClientRow[]
  parts: SplitPartRow[]
  parent: { id: string; title: string } | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Rows the picker just wrote, which the catalog prop has not caught up with.
  const [fresh, setFresh] = useState<GearItem[]>([])
  // The order the sort produced, held still. Sorting live would move a line out
  // from under you the moment you filled in its last gap. New lines go last.
  const [sorted, setSorted] = useState<string[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  // "What would twelve of everything come to?" Asked of the prices and discounts
  // on the page, and written nowhere, so it can't be mistaken for an answer.
  const [eachCount, setEachCount] = useState('')
  const [orderPercent, setOrderPercent] = useState(order.discount_percent == null ? '' : String(order.discount_percent))

  const run: Run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
    finally { setBusy(false); setDrafts({}) }
  }

  const known = useMemo(() => {
    const ids = new Set(catalog.map((c) => c.id))
    return [...catalog, ...fresh.filter((f) => !ids.has(f.id))]
  }, [catalog, fresh])
  const childrenOf = useMemo(() => {
    const m = new Map<string, GearItem[]>()
    for (const c of known) if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c])
    return m
  }, [known])

  const categories = useMemo(() => {
    const used = known.map((c) => c.category?.trim()).filter((c): c is string => Boolean(c))
    return [...new Set<string>([...GEAR_CATEGORIES, ...used])]
  }, [known])

  const lines = [...order.gear_order_lines].sort((a, b) => a.sort_order - b.sort_order)
  const place = (id: string) => {
    const i = sorted?.indexOf(id) ?? -1
    return i < 0 ? Infinity : i
  }
  const shown = sorted ? [...lines].sort((a, b) => place(a.id) - place(b.id)) : lines
  const toFill = lines.filter(needsProduct).length
  const live = lines.filter((l) => !l.removed)
  const done = live.filter((l) => l.checked).length
  // The total runs off what is in the boxes, so it moves as a number is typed.
  const liveQty = (l: GearOrderLine) => (l.id in drafts && 'qty' in drafts[l.id] ? drafts[l.id].qty ?? null : l.qty_wanted)
  const livePrice = (l: GearOrderLine) => (l.id in drafts && 'price' in drafts[l.id] ? drafts[l.id].price ?? null : l.unit_price ?? null)
  const liveDiscount = (l: GearOrderLine) => (l.id in drafts && 'discount' in drafts[l.id] ? drafts[l.id].discount ?? null : l.discount_percent ?? null)
  const liveOrderPercent = orderPercent === '' ? null : Number(orderPercent)
  const { total, subtotal, saved, unpriced } = orderTotal(
    lines.map((l) => ({ qty: liveQty(l), removed: l.removed, unit_price: livePrice(l), discount_percent: liveDiscount(l) })),
    liveOrderPercent
  )
  const each = Number(eachCount)
  const perSet = orderTotal(
    lines.map((l) => ({ qty: 1, removed: l.removed, unit_price: livePrice(l), discount_percent: liveDiscount(l) })),
    liveOrderPercent
  )
  const atEach = orderTotal(
    lines.map((l) => ({ qty: each, removed: l.removed, unit_price: livePrice(l), discount_percent: liveDiscount(l) })),
    liveOrderPercent
  )
  const units = lines.reduce((n, l) => n + (l.removed ? 0 : Number(liveQty(l) ?? 0)), 0)
  const saveOrder = (patch: Parameters<typeof updateStandaloneOrder>[1]) =>
    run(async () => unwrap(await updateStandaloneOrder(order.id, patch)))

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <input
          key={order.title}
          aria-label="Name"
          defaultValue={order.title ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (!v) { e.target.value = order.title ?? ''; return }
            if (v !== order.title) saveOrder({ title: v })
          }}
          className="flex-1 min-w-48 bg-transparent border border-transparent hover:border-zinc-700 focus:border-zinc-500 rounded px-1.5 py-1 text-2xl font-bold focus:outline-none"
        />
        <span className={`text-[10px] px-2 py-0.5 rounded ${GEAR_ORDER_STATUS_STYLE[order.status]}`}>
          {GEAR_ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      {error && <p className="text-sm text-pr-red mb-3">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {/* Not a Field: a label around this would send every click inside it to
            the picker's first control. */}
        <div className="sm:col-span-2">
          <span className="block text-[11px] text-zinc-500 mb-1">Client</span>
          <ClientPicker
            clients={clients}
            defaultId={order.client_id ?? null}
            name="order_client_id"
            onChange={(id) => saveOrder({ clientId: id })}
          />
        </div>
        <Field label="ES quote number">
          <input
            defaultValue={order.es_quote_number ?? ''}
            onBlur={(e) => { if (e.target.value.trim() !== (order.es_quote_number ?? '')) saveOrder({ esQuoteNumber: e.target.value }) }}
            className={`${input} w-full font-mono`}
          />
        </Field>
        <Field label="Contact name">
          <input
            defaultValue={order.contact_name ?? ''}
            onBlur={(e) => { if (e.target.value.trim() !== (order.contact_name ?? '')) saveOrder({ contactName: e.target.value }) }}
            className={`${input} w-full`}
          />
        </Field>
        <Field label="Contact emails">
          <input
            title="Separate more than one with commas"
            defaultValue={order.contact_email ?? ''}
            onBlur={(e) => { if (e.target.value.trim() !== (order.contact_email ?? '')) saveOrder({ contactEmail: e.target.value }) }}
            className={`${input} w-full`}
          />
        </Field>
        <Field label="Order discount %">
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={orderPercent}
            onChange={(e) => setOrderPercent(e.target.value)}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              if (v !== (order.discount_percent == null ? null : Number(order.discount_percent))) saveOrder({ discountPercent: v })
            }}
            className={`${input} w-full`}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Intro">
            <textarea
              rows={2}
              defaultValue={order.intro ?? ''}
              onBlur={(e) => { if (e.target.value.trim() !== (order.intro ?? '')) saveOrder({ intro: e.target.value }) }}
              className={`${input} w-full resize-y`}
            />
          </Field>
        </div>
      </div>

      {order.client_note && (
        <p className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded px-2.5 py-2 mb-3">
          <span className="text-zinc-500">{order.responded_name ?? 'They'} said:</span> {order.client_note}
        </p>
      )}

      {parent && (
        <p className="text-xs text-zinc-400 mb-3">
          Part of <Link href={`/admin/gear/orders/${parent.id}`} className="underline underline-offset-2 decoration-zinc-600 hover:text-white">{parent.title}</Link>
        </p>
      )}

      {parts.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <p className="text-sm font-medium">
              Split into {parts.length} orders{order.split_cap != null && ` of up to ${fmtMoney(Number(order.split_cap))}`}
            </p>
            {!parts.some((p) => p.sent_at) && (
              <button
                onClick={() => {
                  if (confirm('Undo the split? The parts are deleted and this order opens again.')) {
                    run(async () => unwrap(await undoStandaloneSplit(order.id)))
                  }
                }}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Undo split
              </button>
            )}
          </div>
          <div className="space-y-1">
            {parts.map((p) => (
              <Link key={p.id} href={`/admin/gear/orders/${p.id}`} className="flex items-center gap-3 text-sm hover:text-white text-zinc-300 transition-colors">
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span>{fmtMoney(orderTotal(p.gear_order_lines.map((l) => ({ qty: l.qty_wanted, removed: l.removed, unit_price: l.unit_price, discount_percent: l.discount_percent })), p.discount_percent).total)}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${GEAR_ORDER_STATUS_STYLE[p.status]}`}>{GEAR_ORDER_STATUS_LABEL[p.status]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <datalist id="gear-brands">
        {brandsIn(known).map((b) => <option key={b} value={b} />)}
      </datalist>

      {lines.length > 0 && (
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-zinc-400">{done} of {live.length} checked</span>
          {toFill > 0 && <span className="text-xs text-amber-300/80">{toFill} {toFill === 1 ? 'needs' : 'need'} a product</span>}
          <button
            onClick={() => setSorted(sorted ? null : workFirst(lines).map((l) => l.id))}
            className="ml-auto text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            {sorted ? 'List order' : 'Unchecked first'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((l) => (
          <LineRow key={l.id} line={l} products={productsFor(l, known, childrenOf)} categories={categories} run={run} busy={busy}
            liveQty={liveQty(l)} livePrice={livePrice(l)} liveDiscount={liveDiscount(l)} orderPercent={liveOrderPercent}
            onDraft={(d) => setDrafts((all) => ({ ...all, [l.id]: { ...all[l.id], ...d } }))}
          />
        ))}
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <AddGear
              listId={order.id}
              ownsCatalog
              catalog={known}
              childrenOf={childrenOf}
              oneOffLabel="just this order"
              onPick={(picked) => {
                if (picked.items?.length) setFresh((f) => [...f, ...picked.items!])
                const { gearItemId, name } = picked
                run(async () => unwrap(gearItemId
                  ? await addCatalogLine(order.id, gearItemId)
                  : await addOneOffLine(order.id, name ?? '')))
              }}
              onClose={() => setAdding(false)}
              busy={busy} run={run} input={input}
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            + Add gear
          </button>
        )}
      </div>

      {lines.length > 0 && (
        <div className="sticky bottom-0 z-10 mt-4 rounded-lg border border-zinc-700 bg-zinc-900/95 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-zinc-400">{units} {units === 1 ? 'item' : 'items'}</span>
          <span className="ml-auto text-sm">
            {saved > 0 && (
              <span className="text-xs text-zinc-400 mr-3">
                <span className="line-through">{fmtMoney(subtotal)}</span> <span className="text-emerald-400">{fmtMoney(saved)} off</span>
              </span>
            )}
            <span className="text-zinc-500">Total</span> <span className="font-semibold">{fmtMoney(total)}</span>
            {unpriced > 0 && <span className="text-xs text-amber-300/80"> + {unpriced} unpriced</span>}
          </span>
          <div className="w-full flex items-center gap-2 flex-wrap border-t border-zinc-800 pt-2">
            <label htmlFor="each-count" className="text-xs text-zinc-400">If everyone got one of each, for</label>
            <input
              id="each-count"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={eachCount}
              onChange={(e) => setEachCount(e.target.value)}
              className={`${input} w-16 py-0.5 text-center text-xs`}
            />
            <span className="text-xs text-zinc-400">people</span>
            {each > 0 && (
              <span className="ml-auto text-sm">
                <span className="text-xs text-zinc-400 mr-2">{fmtMoney(perSet.total)} each</span>
                <span className="font-semibold">{fmtMoney(atEach.total)}</span>
                {atEach.unpriced > 0 && <span className="text-xs text-amber-300/80"> + {atEach.unpriced} unpriced</span>}
              </span>
            )}
          </div>
        </div>
      )}

      {!order.split_from && parts.length === 0 && lines.length > 0 && (
        <SplitPanel order={order} lines={lines} run={run} busy={busy} eachCount={each > 0 ? eachCount : ''} />
      )}

      <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center gap-3 flex-wrap">
        <button
          disabled={busy}
          onClick={() => run(async () => unwrap(await sendStandaloneOrder(order.id)))}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {order.sent_at ? 'Send again' : 'Send to team'}
        </button>
        <a
          href={`/gear-order/${order.accept_token}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
        >
          Preview
        </a>
        <PdfLink href={`/api/gear-orders/${order.id}/pdf`} label="PDF" />
        {order.status !== 'closed' && order.responded_at && (
          <button
            onClick={() => saveOrder({ status: 'closed' })}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Mark closed
          </button>
        )}
        <button
          onClick={() => {
            if (!confirm(order.sent_at ? 'Delete this order? The team’s link stops working.' : 'Delete this order?')) return
            run(async () => {
              await deleteStandaloneOrder(order.id)
              router.push('/admin/gear/orders')
            })
          }}
          className="ml-auto text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

// The products that could settle this line: under the generic it names, or
// beside the product it already names.
function productsFor(line: GearOrderLine, catalog: GearItem[], childrenOf: Map<string, GearItem[]>): GearItem[] {
  const item = line.gear_item_id ? catalog.find((c) => c.id === line.gear_item_id) : null
  if (!item) return []
  return childrenOf.get(item.parent_id ?? item.id) ?? []
}

// The product menu only lists what the catalog holds, so the first product of
// anything has to start somewhere. Here, on the line that wants it.
function NewProduct({ lineId, run, busy }: { lineId: string; run: Run; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 block text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        + Product
      </button>
    )
  }
  return (
    <form
      className="mt-2 flex items-center gap-2 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault()
        run(async () => {
          unwrap(await addLineProduct(lineId, { brand, model }))
          setOpen(false); setBrand(''); setModel('')
        })
      }}
    >
      <input autoFocus list="gear-brands" aria-label="Brand" placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={`${input} w-36 text-xs`} />
      <input aria-label="Model" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} className={`${input} min-w-0 flex-1 text-xs`} />
      <button type="submit" disabled={busy || !model.trim() || !brand.trim()} className="text-xs text-zinc-300 hover:text-white disabled:opacity-40">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-600 hover:text-zinc-300">Cancel</button>
    </form>
  )
}

// Keyed on what the server holds, so a saved answer redraws from the record.
function LineSizes({
  line, busy, save, onDraftQty,
}: {
  line: GearOrderLine
  busy: boolean
  save: (patch: Parameters<typeof updateStandaloneLine>[1]) => void
  onDraftQty: (qty: number) => void
}) {
  const [rows, setRows] = useState(() => sizeRows(line.size_options, line.sizes))
  const options = line.size_options ?? []
  const commit = (next: typeof rows) => {
    const before = JSON.stringify(sizeRows(line.size_options, line.sizes))
    if (JSON.stringify(next) !== before) save({ sizes: next })
  }

  if (rows.length === 0) return null
  return (
    <GearSizeRows
      canAdd={false}
      fixed={options.length > 0 && rows.length === options.length}
      rows={rows}
      onChange={(next) => { setRows(next); onDraftQty(sizesTotal(next)) }}
      onCommit={commit}
      disabled={busy}
      input={input}
    />
  )
}

// Splitting by what a team can spend on one order. The plan is drawn as the cap
// is typed, and the same function makes the orders on the server.
function SplitPanel({
  order, lines, run, busy, eachCount,
}: {
  order: GearOrder
  lines: GearOrderLine[]
  run: Run
  busy: boolean
  eachCount: string
}) {
  const [open, setOpen] = useState(false)
  const [cap, setCap] = useState('')
  // Follows the calculator until a number is typed here.
  const [typedFill, setTypedFill] = useState<string | null>(null)
  const fillText = typedFill ?? eachCount
  const fill = Number(fillText) > 0 ? Number(fillText) : null
  const anyBlank = lines.some((l) => !l.removed && !(Number(l.qty_wanted ?? 0) > 0))
  const names = new Map(lines.map((l) => [l.id, l.product ?? l.name]))
  const plan = useMemo(() => planSplit(lines.map((l) => ({
    id: l.id, name: l.product ?? l.name, brand: l.gear_items?.brand ?? null,
    qty: planQty(l.qty_wanted, fill), removed: l.removed, sizes: l.sizes,
    // The cap is what the team spends, so it runs on the discounted price.
    unit_price: l.unit_price == null ? null : netUnitPrice(l.unit_price, l.discount_percent, order.discount_percent),
  })), Number(cap)), [lines, cap, fill, order.discount_percent])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
      >
        Split by budget
      </button>
    )
  }
  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          autoFocus
          type="number"
          min={0}
          step="0.01"
          aria-label="Most one order can be"
          placeholder="Max per order $"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className={`${input} w-40`}
        />
        {anyBlank && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Lines with no quantity:
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={fillText}
              onChange={(e) => setTypedFill(e.target.value)}
              className={`${input} w-16 py-1 text-center text-xs`}
            />
          </label>
        )}
        <button onClick={() => setOpen(false)} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
      </div>

      {plan.unpriced.length > 0 && (
        <p className="text-xs text-amber-300/80">Price these first: {plan.unpriced.join(', ')}</p>
      )}
      {plan.leftOut.length > 0 && Number(cap) > 0 && (
        <p className="text-xs text-zinc-400">No quantity, so left out: {plan.leftOut.join(', ')}</p>
      )}
      {plan.parts.length === 1 && <p className="text-xs text-zinc-400">It already fits in one order.</p>}

      {plan.parts.length > 1 && (
        <>
          <div className="space-y-2">
            {plan.parts.map((part, i) => (
              <div key={i} className="rounded border border-zinc-800 p-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Order {i + 1}</span>
                  {part.overCap && <span className="text-xs text-amber-300/80">one item costs more than the cap</span>}
                  <span className="ml-auto">{fmtMoney(part.cents / 100)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {part.pieces.map((piece) => (
                    <li key={piece.lineId} className="text-xs text-zinc-400 flex gap-2">
                      <span className="shrink-0">{piece.qty} ×</span>
                      <span className="min-w-0 flex-1">{names.get(piece.lineId)}{piece.sizes.length > 0 && ` (${piece.sizes.map((s) => `${s.size} × ${s.qty}`).join(', ')})`}</span>
                      <span className="shrink-0">{fmtMoney(piece.cents / 100)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <button
            disabled={busy}
            onClick={() => {
              if (!confirm(`Create ${plan.parts.length} orders? They start as drafts and this one closes.`)) return
              run(async () => unwrap(await splitStandaloneOrder(order.id, Number(cap), fill)))
            }}
            className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            Create {plan.parts.length} orders
          </button>
        </>
      )}
    </div>
  )
}

function LineRow({
  line, products, categories, run, busy, liveQty, livePrice, liveDiscount, orderPercent, onDraft,
}: {
  line: GearOrderLine
  products: GearItem[]
  categories: string[]
  liveQty: number | null
  livePrice: number | null
  liveDiscount: number | null
  orderPercent: number | null
  onDraft: (d: Draft) => void
  run: Run
  busy: boolean
}) {
  const save = (patch: Parameters<typeof updateStandaloneLine>[1]) =>
    run(async () => unwrap(await updateStandaloneLine(line.id, patch)))
  const money = (n: number | null | undefined) => (n == null ? null : Number(n))
  const link = safeLink(line.url)
  const current = products.find((p) => p.id === line.gear_item_id) ?? null
  const typed = typedOverCatalog(line, current)
  const priceDiffers = typed.price != null && current?.price != null
  const linkDiffers = Boolean(typed.url && current?.url)
  // Shows the moment it is ticked; the save follows behind.
  const [checked, setChecked] = useState(Boolean(line.checked))
  const [seenChecked, setSeenChecked] = useState(Boolean(line.checked))
  if (seenChecked !== Boolean(line.checked)) {
    setSeenChecked(Boolean(line.checked))
    setChecked(Boolean(line.checked))
  }

  return (
    <div className={`rounded-lg border p-3 transition-colors ${checked ? 'border-emerald-700 bg-emerald-950/40' : 'border-zinc-800 bg-zinc-900'} ${line.removed ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Mark ${line.name} as finished`}
          title="Finished"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked)
            save({ checked: e.target.checked })
          }}
          className="shrink-0 size-4 accent-emerald-600"
        />
        <input
          key={line.name}
          aria-label="Item"
          defaultValue={line.name}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (!v) { e.target.value = line.name; return }
            if (v !== line.name) save({ name: v })
          }}
          className={`min-w-0 flex-1 bg-transparent border border-transparent hover:border-zinc-700 focus:border-zinc-500 rounded px-1.5 py-1 text-sm font-medium focus:outline-none ${line.removed ? 'line-through' : ''}`}
        />
        <CategorySelect
          key={line.category}
          value={line.category}
          options={line.category && !categories.includes(line.category) ? [...categories, line.category] : categories}
          disabled={busy}
          onChange={(next) => {
            if (next && next !== line.category) {
              run(async () => unwrap(await setLineCategory(line.id, next)))
            }
          }}
          className="shrink-0 max-w-40 bg-transparent border border-transparent hover:border-zinc-700 focus:border-zinc-500 rounded px-1 py-0.5 text-[11px] text-zinc-500 focus:outline-none"
        />
        <button
          onClick={() => save({ removed: !line.removed })}
          disabled={busy}
          title={line.removed ? 'Put back' : 'Strike off'}
          className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-1 disabled:opacity-40"
        >
          {line.removed ? '↩' : '−'}
        </button>
        <button
          onClick={() => run(async () => unwrap(await deleteStandaloneLine(line.id)))}
          disabled={busy}
          title="Delete the line"
          className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
        >
          <TrashIcon />
        </button>
      </div>

      {needsProduct(line) && (
        <p className="text-[11px] text-amber-300/80 mt-0.5 px-1.5">Needs a product</p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-[5rem_7rem_5rem_1fr] gap-2 mt-2">
        {isSized(line) ? (
          // The sizes add up to this, so it is not a second answer to type.
          <output
            aria-label="Quantity, the total of the sizes"
            title="Total of the sizes below"
            className="flex items-center justify-center rounded border border-transparent px-2 py-1.5 text-sm text-zinc-300"
          >
            {liveQty ?? 0}
          </output>
        ) : (
          <input
            key={`qty-${line.qty_wanted}`}
            type="number"
            min={0}
            aria-label="Quantity"
            placeholder="Qty"
            defaultValue={line.qty_wanted ?? ''}
            onChange={(e) => onDraft({ qty: e.target.value === '' ? null : Number(e.target.value) })}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              if (v !== money(line.qty_wanted)) save({ qtyWanted: v })
            }}
            className={`${input} w-full text-center`}
          />
        )}
        <input
          key={`price-${line.unit_price}`}
          type="number"
          min={0}
          step="0.01"
          aria-label="Unit price"
          placeholder="Price each"
          defaultValue={line.unit_price ?? ''}
          onChange={(e) => onDraft({ price: e.target.value === '' ? null : Number(e.target.value) })}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            if (v !== money(line.unit_price)) save({ unitPrice: v })
          }}
          className={`${input} w-full`}
        />
        <input
          key={`off-${line.discount_percent}`}
          type="number"
          min={0}
          max={100}
          step="0.5"
          aria-label="Discount percent"
          placeholder="% off"
          defaultValue={line.discount_percent ?? ''}
          onChange={(e) => onDraft({ discount: e.target.value === '' ? null : Number(e.target.value) })}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            if (v !== money(line.discount_percent)) save({ discountPercent: v })
          }}
          className={`${input} w-full`}
        />
        <div className="col-span-3 sm:col-span-1 flex items-center gap-2">
          <input
            key={`url-${line.url}`}
            type="url"
            aria-label="Link"
            placeholder="Link"
            defaultValue={line.url ?? ''}
            onBlur={(e) => { if (e.target.value.trim() !== (line.url ?? '')) save({ url: e.target.value }) }}
            className={`${input} min-w-0 flex-1 text-xs`}
          />
          {link && (
            <a href={link} target="_blank" rel="noreferrer" title="Open the link" className="shrink-0 text-zinc-500 hover:text-white transition-colors">
              <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* A number typed before the line had sizes. It still counts until sizes
          replace it, so it is said out loud rather than sitting there looking
          like their total. */}
      {!line.removed && (line.size_options ?? []).length > 0 && !(line.sizes ?? []).length && Number(liveQty ?? 0) > 0 && (
        <p className="text-[11px] text-amber-300/80 mt-1 px-1.5">{liveQty} not split into sizes yet</p>
      )}

      {!line.removed && Number(liveQty ?? 0) > 0 && livePrice != null && (
        <p className="text-xs text-zinc-400 mt-1.5 text-right">
          {(() => {
            const net = netUnitPrice(livePrice, liveDiscount, orderPercent)
            return (
              <>
                {liveQty} × {net < livePrice && <span className="line-through mr-1">{fmtMoney(livePrice)}</span>}{fmtMoney(net)} = <span className="text-zinc-200">{fmtMoney(Number(liveQty) * net)}</span>
              </>
            )
          })()}
        </p>
      )}

      {products.length === 0 && line.product && (
        <p className="text-xs text-zinc-400 mt-2 px-1.5">{line.product}</p>
      )}

      {products.length > 0 && (
        <select
          aria-label="Product"
          value={products.some((p) => p.id === line.gear_item_id) ? line.gear_item_id ?? '' : ''}
          disabled={busy}
          onChange={(e) => {
            const next = products.find((p) => p.id === e.target.value)
            if (!next) return
            // Swapping would replace these, so the person says what they meant.
            const said = [typed.price != null && fmtMoney(typed.price), typed.url && 'the link'].filter(Boolean).join(' and ')
            const keep = current != null && said !== '' && confirm(
              `This line has ${said} typed on it. Keep that for ${productName(next)}?\n\nOK keeps it. Cancel uses what the catalog has for ${productName(next)}.`
            )
            run(async () => unwrap(await setLineProduct(line.id, next.id, { keep })))
          }}
          className={`${input} w-full mt-2 text-xs`}
        >
          <option value="">Choose a product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{productName(p)}</option>)}
        </select>
      )}

      {/* What this line says against the catalog, so it is plain which of the two
          a number lives on. It only reaches the catalog by this button. */}
      {current && (priceDiffers || linkDiffers) && (
        <p className="mt-1.5 px-1.5 text-[11px] text-zinc-400">
          This order only. Catalog has {[priceDiffers && fmtMoney(Number(current.price)), linkDiffers && 'a different link'].filter(Boolean).join(' and ')}.{' '}
          <button
            onClick={() => {
              if (confirm(`Use this line's link and price for ${productName(current)} everywhere from now on?`)) {
                run(async () => unwrap(await saveLineToCatalog(line.id)))
              }
            }}
            className="underline underline-offset-2 decoration-zinc-600 hover:text-white transition-colors"
          >
            Update catalog
          </button>
        </p>
      )}

      {line.gear_item_id && <NewProduct lineId={line.id} run={run} busy={busy} />}

      <div className="mt-2">
        <SizeOptionsField
          value={line.size_options ?? []}
          category={line.category}
          name={line.name}
          onCommit={(next) => save({ sizeOptions: next.join(', ') })}
          input={input}
        />
        <LineSizes
          key={JSON.stringify([line.size_options, line.sizes])}
          line={line}
          busy={busy}
          save={save}
          onDraftQty={(qty) => onDraft({ qty })}
        />
      </div>

      <input
        key={`note-${line.detail}`}
        aria-label="Our note"
        placeholder="Our note"
        defaultValue={line.detail ?? ''}
        onBlur={(e) => { if (e.target.value.trim() !== (line.detail ?? '')) save({ detail: e.target.value }) }}
        className={`${input} w-full mt-2 text-xs`}
      />
      {line.client_note && <p className="text-[11px] text-amber-300/80 mt-1.5 px-1.5">“{line.client_note}”</p>}
    </div>
  )
}
