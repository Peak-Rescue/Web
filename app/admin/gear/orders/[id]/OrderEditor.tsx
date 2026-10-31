'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddGear, type GearItem } from '@/app/admin/gear/GearListEditor'
import { fmtMoney } from '@/lib/expenses'
import { GEAR_CATEGORIES, brandsIn, productName, unwrap } from '@/lib/gear'
import CategorySelect from '@/app/admin/gear/CategorySelect'
import {
  GEAR_ORDER_STATUS_LABEL, GEAR_ORDER_STATUS_STYLE, needsProduct, orderTotal, sizesTotal, workFirst, safeLink, sizeRows,
  type GearOrder, type GearOrderLine,
} from '@/lib/gear-orders'
import GearSizeRows from '@/components/GearSizeRows'
import SizeOptionsField from '@/components/SizeOptionsField'
import PdfLink from '@/components/PdfLink'
import Link from 'next/link'
import { planSplit } from '@/lib/gear-order-split'
import TrashIcon from '@/components/TrashIcon'
import {
  addCatalogLine, addLineProduct, addOneOffLine, deleteStandaloneLine, deleteStandaloneOrder, sendStandaloneOrder,
  setLineCategory, setLineProduct, splitStandaloneOrder, undoStandaloneSplit, updateStandaloneLine, updateStandaloneOrder,
} from '../actions'

const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

type Run = (fn: () => Promise<unknown>) => void

export type SplitPartRow = {
  id: string; title: string; status: GearOrder['status']; sent_at: string | null
  gear_order_lines: { qty_wanted: number | null; unit_price: number | null; removed: boolean }[]
}
// Numbers being typed, ahead of the save.
type Draft = { qty?: number | null; price?: number | null }

export default function OrderEditor({
  order, catalog, clients, parts, parent,
}: {
  order: GearOrder
  catalog: GearItem[]
  clients: { id: string; label: string }[]
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
  const { total, unpriced } = orderTotal(
    lines.map((l) => ({ qty: liveQty(l), removed: l.removed, unit_price: livePrice(l) }))
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
        <Field label="Client">
          <select
            value={order.client_id ?? ''}
            onChange={(e) => saveOrder({ clientId: e.target.value || null })}
            className={`${input} w-full`}
          >
            <option value="">None</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
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
        <Field label="Contact email">
          <input
            type="email"
            defaultValue={order.contact_email ?? ''}
            onBlur={(e) => { if (e.target.value.trim() !== (order.contact_email ?? '')) saveOrder({ contactEmail: e.target.value }) }}
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
                <span>{fmtMoney(orderTotal(p.gear_order_lines.map((l) => ({ qty: l.qty_wanted, removed: l.removed, unit_price: l.unit_price }))).total)}</span>
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
            liveQty={liveQty(l)} livePrice={livePrice(l)}
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
            <span className="text-zinc-500">Total</span> <span className="font-semibold">{fmtMoney(total)}</span>
            {unpriced > 0 && <span className="text-xs text-amber-300/80"> + {unpriced} unpriced</span>}
          </span>
        </div>
      )}

      {!order.split_from && parts.length === 0 && lines.length > 0 && (
        <SplitPanel order={order} lines={lines} run={run} busy={busy} />
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
  order, lines, run, busy,
}: {
  order: GearOrder
  lines: GearOrderLine[]
  run: Run
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [cap, setCap] = useState('')
  const names = new Map(lines.map((l) => [l.id, l.product ?? l.name]))
  const plan = useMemo(() => planSplit(lines.map((l) => ({
    id: l.id, name: l.product ?? l.name, brand: l.gear_items?.brand ?? null,
    qty: l.qty_wanted, unit_price: l.unit_price ?? null, removed: l.removed, sizes: l.sizes,
  })), Number(cap)), [lines, cap])

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
              run(async () => unwrap(await splitStandaloneOrder(order.id, Number(cap))))
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
  line, products, categories, run, busy, liveQty, livePrice, onDraft,
}: {
  line: GearOrderLine
  products: GearItem[]
  categories: string[]
  liveQty: number | null
  livePrice: number | null
  onDraft: (d: Draft) => void
  run: Run
  busy: boolean
}) {
  const save = (patch: Parameters<typeof updateStandaloneLine>[1]) =>
    run(async () => unwrap(await updateStandaloneLine(line.id, patch)))
  const money = (n: number | null | undefined) => (n == null ? null : Number(n))
  const link = safeLink(line.url)
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

      <div className="grid grid-cols-2 sm:grid-cols-[5rem_7rem_1fr] gap-2 mt-2">
        <input
          key={`qty-${line.qty_wanted}`}
          type="number"
          min={0}
          aria-label="Quantity"
          placeholder="Qty"
          // The sizes add up to this, so it is not a second answer to edit.
          readOnly={(line.sizes ?? []).length > 0}
          title={(line.sizes ?? []).length > 0 ? 'Total of the sizes below' : undefined}
          defaultValue={line.qty_wanted ?? ''}
          onChange={(e) => onDraft({ qty: e.target.value === '' ? null : Number(e.target.value) })}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            if (v !== money(line.qty_wanted) && !(line.sizes ?? []).length) save({ qtyWanted: v })
          }}
          className={`${input} w-full text-center`}
        />
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
        <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
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

      {!line.removed && Number(liveQty ?? 0) > 0 && livePrice != null && (
        <p className="text-xs text-zinc-400 mt-1.5 text-right">
          {liveQty} × {fmtMoney(livePrice)} = <span className="text-zinc-200">{fmtMoney(Number(liveQty) * livePrice)}</span>
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
          onChange={(e) => { if (e.target.value) run(async () => unwrap(await setLineProduct(line.id, e.target.value))) }}
          className={`${input} w-full mt-2 text-xs`}
        >
          <option value="">Choose a product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{productName(p)}</option>)}
        </select>
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
