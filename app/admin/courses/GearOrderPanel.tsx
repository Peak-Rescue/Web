'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createGearOrder, updateGearOrder, updateGearOrderLine,
  addGearOrderLine, deleteGearOrderLine, deleteGearOrder, sendGearOrder,
} from './gear-order-actions'
import { GEAR_ORDER_STATUS_LABEL, type GearOrder } from '@/lib/gear-orders'
import PdfLink from '@/components/PdfLink'
import AdminCcPicker from '@/components/AdminCcPicker'

const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400',
  sent: 'bg-amber-900/40 text-amber-300',
  responded: 'bg-teal-900/40 text-teal-300',
  closed: 'bg-zinc-800 text-zinc-500',
}

// Everything about supplying gear to the client, folded away. Admins only, and
// closed by default — it matters on the day you send it and the day they answer,
// and is noise on every other day.
export default function GearOrderPanel({
  instanceId,
  orders,
  lists,
  adminCcOptions,
}: {
  instanceId: string
  orders: GearOrder[]
  lists: { id: string; name: string; audience: string }[]
  adminCcOptions: { id: string; name: string; email: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
    finally { setBusy(false) }
  }

  const open = orders.filter((o) => o.status !== 'closed').length

  return (
    <details className="mt-8 group rounded-lg border border-zinc-800 bg-zinc-900/40">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2">
        <span className="text-zinc-600 transition-transform group-open:rotate-90">▶</span>
        <span className="text-sm font-medium">Gear orders</span>
        <span className="text-xs text-zinc-500">
          {orders.length === 0 ? 'none yet' : `${orders.length} · ${open} open`}
        </span>
        <span className="ml-auto text-[11px] text-zinc-600">Admin only — not shown on the course</span>
      </summary>

      <div className="px-4 pb-4 pt-1 border-t border-zinc-800">
        {error && <p className="text-sm text-pr-red mb-3">{error}</p>}

        {orders.map((o) => (
          <OrderCard key={o.id} instanceId={instanceId} order={o} run={run} busy={busy} adminCcOptions={adminCcOptions} />
        ))}

        {lists.length > 0 ? (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500">Build an order from:</span>
            {lists.map((l) => (
              <button
                key={l.id}
                disabled={busy}
                onClick={() => run(() => createGearOrder(instanceId, l.id))}
                className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
              >
                {l.name} <span className="text-zinc-600">({l.audience})</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 mt-3">Build a gear list above first — an order is a snapshot of one.</p>
        )}
      </div>
    </details>
  )
}

function OrderCard({
  instanceId, order, run, busy, adminCcOptions,
}: {
  instanceId: string
  order: GearOrder
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
  adminCcOptions: { id: string; name: string; email: string }[]
}) {
  const [es, setEs] = useState(order.es_quote_number ?? '')
  const lines = [...order.gear_order_lines].sort((a, b) => a.sort_order - b.sort_order)
  const wanted = lines.filter((l) => !l.removed && Number(l.qty_wanted ?? 0) > 0)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`text-[10px] px-2 py-0.5 rounded ${STATUS_STYLE[order.status]}`}>
          {GEAR_ORDER_STATUS_LABEL[order.status]}
        </span>
        {order.responded_at && (
          <span className="text-xs text-zinc-500">
            {order.responded_name} answered {new Date(order.responded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <span className="text-xs text-zinc-600">{wanted.length} of {lines.length} wanted</span>
        <div className="ml-auto flex items-center gap-2">
          <PdfLink href={`/api/gear-orders/${order.id}/pdf`} label="For purchasing" />
          <button
            onClick={() => { if (confirm('Delete this order? The client link stops working.')) run(() => deleteGearOrder(instanceId, order.id)) }}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* The number the client quotes back. Sending is gated on it, because an
          order they can't reference against their own paperwork is a phone call. */}
      <div className="flex items-end gap-2 flex-wrap mb-3">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">ES quote number</label>
          <input
            value={es}
            onChange={(e) => setEs(e.target.value)}
            onBlur={() => es !== (order.es_quote_number ?? '') && run(() => updateGearOrder(instanceId, order.id, { es_quote_number: es }))}
            placeholder="from the ES system"
            className={`${input} font-mono w-48`}
          />
        </div>
        <form action={sendGearOrder.bind(null, instanceId, order.id)} className="flex items-center gap-2.5">
          <AdminCcPicker admins={adminCcOptions} />
          <button
            disabled={busy}
            className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {order.sent_at ? 'Send again' : 'Send to client'}
          </button>
        </form>
        {order.status !== 'closed' && order.responded_at && (
          <button
            onClick={() => run(() => updateGearOrder(instanceId, order.id, { status: 'closed' }))}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Mark closed
          </button>
        )}
      </div>

      {order.client_note && (
        <p className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded px-2.5 py-2 mb-3">
          <span className="text-zinc-500">They said:</span> {order.client_note}
        </p>
      )}

      <div className="space-y-1">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_4.5rem_auto] gap-2 items-center">
            <div className="min-w-0">
              <p className={`text-sm truncate ${l.removed ? 'text-zinc-600 line-through' : ''}`}>{l.name}</p>
              {l.client_note && <p className="text-[11px] text-amber-300/80 truncate">“{l.client_note}”</p>}
            </div>
            <input
              type="number"
              min={0}
              defaultValue={l.qty_wanted ?? ''}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                if (v !== l.qty_wanted) run(() => updateGearOrderLine(instanceId, l.id, { qty_wanted: v }))
              }}
              className={`${input} w-full text-center`}
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => run(() => updateGearOrderLine(instanceId, l.id, { removed: !l.removed }))}
                title={l.removed ? 'Put back' : 'Strike off'}
                className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-1"
              >
                {l.removed ? '↩' : '−'}
              </button>
              <button
                onClick={() => run(() => deleteGearOrderLine(instanceId, l.id))}
                title="Delete the line entirely"
                className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-1"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => run(() => addGearOrderLine(instanceId, order.id))}
        disabled={busy}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-2 disabled:opacity-40"
      >
        + Add a line
      </button>
    </div>
  )
}
