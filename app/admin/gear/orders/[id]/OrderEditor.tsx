'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddGear, type GearItem } from '@/app/admin/gear/GearListEditor'
import { fmtMoney } from '@/lib/expenses'
import { productName, unwrap } from '@/lib/gear'
import {
  GEAR_ORDER_STATUS_LABEL, GEAR_ORDER_STATUS_STYLE, orderTotal, safeLink,
  type GearOrder, type GearOrderLine,
} from '@/lib/gear-orders'
import PdfLink from '@/components/PdfLink'
import TrashIcon from '@/components/TrashIcon'
import {
  addCatalogLine, addOneOffLine, deleteStandaloneLine, deleteStandaloneOrder, sendStandaloneOrder,
  setLineProduct, updateStandaloneLine, updateStandaloneOrder,
} from '../actions'

const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

type Run = (fn: () => Promise<unknown>) => void

export default function OrderEditor({
  order, catalog, clients,
}: {
  order: GearOrder
  catalog: GearItem[]
  clients: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Rows the picker just wrote, which the catalog prop has not caught up with.
  const [fresh, setFresh] = useState<GearItem[]>([])

  const run: Run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
    finally { setBusy(false) }
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

  const lines = [...order.gear_order_lines].sort((a, b) => a.sort_order - b.sort_order)
  const { total, unpriced, anyPriced } = orderTotal(
    lines.map((l) => ({ qty: l.qty_wanted, removed: l.removed, unit_price: l.unit_price }))
  )
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

      <div className="space-y-2">
        {lines.map((l) => (
          <LineRow key={l.id} line={l} products={productsFor(l, known, childrenOf)} run={run} busy={busy} />
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

      {anyPriced && (
        <p className="mt-4 text-right text-sm">
          <span className="text-zinc-500">Total</span> <span className="font-medium">{fmtMoney(total)}</span>
          {unpriced > 0 && <span className="text-xs text-amber-300/80"> + {unpriced} unpriced</span>}
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center gap-3 flex-wrap">
        <button
          disabled={busy}
          onClick={() => run(async () => unwrap(await sendStandaloneOrder(order.id)))}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {order.sent_at ? 'Send again' : 'Send to team'}
        </button>
        {order.sent_at && (
          <a
            href={`/gear-order/${order.accept_token}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Their page
          </a>
        )}
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

function LineRow({
  line, products, run, busy,
}: {
  line: GearOrderLine
  products: GearItem[]
  run: Run
  busy: boolean
}) {
  const save = (patch: Parameters<typeof updateStandaloneLine>[1]) =>
    run(async () => unwrap(await updateStandaloneLine(line.id, patch)))
  const money = (n: number | null | undefined) => (n == null ? null : Number(n))
  const link = safeLink(line.url)

  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900 p-3 ${line.removed ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
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
        {line.category && <span className="hidden sm:inline text-[11px] text-zinc-600 shrink-0">{line.category}</span>}
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

      <div className="grid grid-cols-2 sm:grid-cols-[5rem_7rem_1fr] gap-2 mt-2">
        <input
          key={`qty-${line.qty_wanted}`}
          type="number"
          min={0}
          aria-label="Quantity"
          placeholder="Qty"
          defaultValue={line.qty_wanted ?? ''}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            if (v !== money(line.qty_wanted)) save({ qtyWanted: v })
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
