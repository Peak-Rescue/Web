'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createGearOrder, updateGearOrder, updateGearOrderLine,
  addGearOrderLine, deleteGearOrderLine, deleteGearOrder, sendGearOrder,
  createGearOrderUploadTargets, attachToGearOrder, detachFromGearOrder,
} from './gear-order-actions'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { GEAR_ORDER_STATUS_LABEL, type GearOrder } from '@/lib/gear-orders'
import PdfLink from '@/components/PdfLink'
import AdminCcPicker from '@/components/AdminCcPicker'
import TrashIcon from '@/components/TrashIcon'

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
          <OrderCard key={o.id} instanceId={instanceId} order={o} run={run} busy={busy} adminCcOptions={adminCcOptions} setError={setError} />
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
  instanceId, order, run, busy, adminCcOptions, setError,
}: {
  instanceId: string
  order: GearOrder
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
  adminCcOptions: { id: string; name: string; email: string }[]
  setError: (m: string | null) => void
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [es, setEs] = useState(order.es_quote_number ?? '')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
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

      {/* Paperwork that travels with the order and is not a line on it — a
          quote, a spec sheet, a signed agreement. It used to have to go in a
          separate email, arriving unattached to the thing it was about. */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[11px] text-zinc-500">Attached</span>
        {(order.attachments ?? []).map((a) => (
          <span key={a.path} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">
            {a.filename}
            <button
              onClick={() => { if (confirm(`Remove "${a.filename}"?`)) run(() => detachFromGearOrder(instanceId, order.id, a.path)) }}
              disabled={busy}
              title="Take it off the order"
              className="text-zinc-500 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        {(order.attachments ?? []).length === 0 && (
          <span className="text-[11px] text-zinc-700">nothing yet</span>
        )}
        <label className="text-[11px] px-2 py-0.5 rounded border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
          {uploading ? 'Uploading…' : '+ file'}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            className="hidden"
            disabled={busy || uploading}
            onChange={async (ev) => {
              const files = Array.from(ev.target.files ?? [])
              ev.target.value = ''
              if (!files.length) return
              setUploading(true); setError(null)
              try {
                // The bytes go straight into the private bucket from here; only
                // the path comes back to the server, same as every other
                // attachment on a course.
                const targets = await createGearOrderUploadTargets(
                  instanceId, files.map((f) => ({ name: f.name, size: f.size }))
                )
                const supabase = createBrowserClient()
                const done: { path: string; filename: string }[] = []
                for (let i = 0; i < files.length; i++) {
                  const { error: upErr } = await supabase.storage
                    .from('task-documents')
                    .uploadToSignedUrl(targets[i].path, targets[i].token, files[i], { contentType: files[i].type })
                  if (upErr) throw new Error(`Upload failed for "${files[i].name}": ${upErr.message}`)
                  done.push({ path: targets[i].path, filename: files[i].name })
                }
                await attachToGearOrder(instanceId, order.id, done)
                router.refresh()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'That upload failed')
              } finally {
                setUploading(false)
              }
            }}
          />
        </label>
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
          {/* Only while there is nothing to send. Once the number exists the
              question is moot, and a standing checkbox for a decision you
              already made is one more thing to read past. */}
          {!es.trim() && (
            <label
              className="flex items-center gap-1.5 text-xs text-amber-300/80 cursor-pointer"
              title="The client gets the list with no number to quote back. You can add one later — it shows when they reopen the link."
            >
              <input type="checkbox" name="send_without_es" className="accent-pr-red size-3.5" />
              send without one
            </label>
          )}
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

      {order.sent_at && !order.es_quote_number && (
        <p className="text-[11px] text-amber-300/80 mb-3">
          Sent without a quote number. Adding one above shows it on their page next time they open the link —
          use Send again if they should get it by email too.
        </p>
      )}

      {order.client_note && (
        <p className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded px-2.5 py-2 mb-3">
          <span className="text-zinc-500">They said:</span> {order.client_note}
        </p>
      )}

      <div className="space-y-1">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_4.5rem_auto] gap-2 items-center">
            <div className="min-w-0">
              <input
                defaultValue={l.name}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (!v) { e.target.value = l.name; return }
                  if (v !== l.name) run(() => updateGearOrderLine(instanceId, l.id, { name: v }))
                }}
                className={`w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-zinc-500 rounded px-1.5 py-1 text-sm focus:outline-none ${l.removed ? 'text-zinc-600 line-through' : ''}`}
              />
              {l.client_note && <p className="text-[11px] text-amber-300/80 truncate px-1.5">“{l.client_note}”</p>}
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
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <form
          className="flex items-center gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = newName.trim()
            if (!v) return
            run(() => addGearOrderLine(instanceId, order.id, v)).then(() => setNewName(''))
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
            placeholder="What are we ordering?"
            className={`${input} flex-1`}
          />
          <button type="submit" disabled={busy || !newName.trim()} className="text-xs text-zinc-300 hover:text-white disabled:opacity-40">
            Add
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName('') }}
            className="text-xs text-zinc-600 hover:text-zinc-300"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={busy}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-2 disabled:opacity-40"
        >
          + Add a line
        </button>
      )}
    </div>
  )
}
