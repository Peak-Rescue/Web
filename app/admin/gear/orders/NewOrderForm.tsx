'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { unwrap } from '@/lib/gear'
import ClientPicker from '@/components/ClientPicker'
import type { ClientRow } from '@/lib/clients'
import { createStandaloneOrder } from './actions'

const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

export default function NewOrderForm({
  clients, lists,
}: {
  clients: ClientRow[]
  lists: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [listId, setListId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const { id } = unwrap(await createStandaloneOrder({
        title, clientId: clientId || null, listId: listId || null,
      }))
      router.push(`/admin/gear/orders/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div>
        <span className="block text-[11px] text-zinc-500 mb-1">Client</span>
        <ClientPicker clients={clients} name="order_client_id" onChange={(id) => setClientId(id ?? '')} />
      </div>
      <div className="flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-48">
        <label htmlFor="order-title" className="block text-[11px] text-zinc-500 mb-1">Name</label>
        <input id="order-title" value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} w-full`} />
      </div>
      <div>
        <label htmlFor="order-list" className="block text-[11px] text-zinc-500 mb-1">Start from</label>
        <select id="order-list" value={listId} onChange={(e) => setListId(e.target.value)} className={`${input} w-52`}>
          <option value="">Blank</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
      >
        New order
      </button>
      </div>
      {error && <p className="text-sm text-pr-red">{error}</p>}
    </form>
  )
}
