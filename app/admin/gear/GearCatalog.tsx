'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GEAR_CATEGORIES, matchesGear, type CatalogItem } from '@/lib/gear'
import { upsertGearItem, mergeGearItems, retireGearItem } from './actions'

type Row = CatalogItem & { active: boolean; uses: number }

// The catalog itself: types with the models that satisfy them, and the merge
// tool for when two rows turn out to be the same piece of kit anyway.
export default function GearCatalog({ items }: { items: Row[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mergeFrom, setMergeFrom] = useState<Row | null>(null)
  const [adding, setAdding] = useState(false)

  const types = useMemo(() => items.filter((i) => !i.parent_id), [items])
  const childrenOf = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const i of items) if (i.parent_id) m.set(i.parent_id, [...(m.get(i.parent_id) ?? []), i])
    return m
  }, [items])

  const shown = useMemo(
    () => types.filter((t) => matchesGear(t, query, childrenOf.get(t.id) ?? [])),
    [types, query, childrenOf]
  )

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  function Item({ row, sub }: { row: Row; sub?: boolean }) {
    const merging = mergeFrom?.id === row.id
    return (
      <div className={`flex items-start gap-2 px-3 py-2 ${sub ? 'pl-8' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              defaultValue={row.name}
              onBlur={(e) => e.target.value !== row.name && run(() => upsertGearItem({ id: row.id, name: e.target.value, category: row.category }))}
              className={`${sub ? 'text-[13px] text-zinc-300' : 'text-sm'} ${input} w-56`}
            />
            {!sub && (
              <select
                defaultValue={row.category ?? ''}
                onChange={(e) => run(() => upsertGearItem({ id: row.id, name: row.name, category: e.target.value }))}
                className={`${input} text-xs`}
              >
                <option value="">— category —</option>
                {GEAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <span className="text-[11px] text-zinc-600">{row.uses > 0 ? `on ${row.uses} list${row.uses === 1 ? '' : 's'}` : 'unused'}</span>
          </div>
          <input
            defaultValue={row.recommended ?? ''}
            onBlur={(e) => e.target.value !== (row.recommended ?? '') && run(() => upsertGearItem({ id: row.id, name: row.name, category: row.category, recommended: e.target.value }))}
            placeholder="What we recommend"
            className={`mt-1 w-full max-w-lg text-[11px] ${input}`}
          />
          <input
            defaultValue={(row.aliases ?? []).join(', ')}
            onBlur={(e) => {
              const next = e.target.value.split(',').map((a) => a.trim()).filter(Boolean)
              if (next.join(',') !== (row.aliases ?? []).join(',')) {
                run(() => upsertGearItem({ id: row.id, name: row.name, category: row.category, aliases: next }))
              }
            }}
            placeholder="Also called — comma separated, so searching finds it"
            className={`mt-1 w-full max-w-lg text-[11px] ${input}`}
          />
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {mergeFrom && !merging ? (
            <button
              onClick={() => {
                if (confirm(`Fold "${mergeFrom.name}" into "${row.name}"? Every list using it will point here instead.`)) {
                  run(async () => { await mergeGearItems(row.id, mergeFrom.id); setMergeFrom(null) })
                }
              }}
              disabled={busy}
              className="text-[11px] px-2 py-0.5 rounded border border-pr-red text-pr-red-light hover:bg-pr-red/10 transition-colors"
            >
              merge into this
            </button>
          ) : (
            <button
              onClick={() => setMergeFrom(merging ? null : row)}
              className={`text-[11px] transition-colors ${merging ? 'text-pr-red-light' : 'text-zinc-600 hover:text-zinc-300'}`}
            >
              {merging ? 'pick the keeper…' : 'merge'}
            </button>
          )}
          {row.uses === 0 && (
            <button
              onClick={() => run(() => retireGearItem(row.id))}
              disabled={busy}
              className="text-[11px] text-zinc-700 hover:text-red-400 transition-colors"
            >
              retire
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gear, synonyms and models"
          className={`flex-1 min-w-56 ${input}`}
        />
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
        >
          + Gear
        </button>
      </div>

      {mergeFrom && (
        <p className="text-xs text-pr-red-light">
          Merging <strong>{mergeFrom.name}</strong> — pick the row to keep.{' '}
          <button onClick={() => setMergeFrom(null)} className="underline text-zinc-400">cancel</button>
        </p>
      )}

      {adding && <AddItem types={types} busy={busy} run={run} input={input} onDone={() => setAdding(false)} />}

      <div className="space-y-2">
        {shown.map((t) => (
          <div key={t.id} className="border border-zinc-800 rounded-lg divide-y divide-zinc-800/70">
            <Item row={t} />
            {(childrenOf.get(t.id) ?? []).map((m) => <Item key={m.id} row={m} sub />)}
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-zinc-500">Nothing matches “{query}”.</p>}
      </div>
    </div>
  )
}

function AddItem({
  types, busy, run, input, onDone,
}: {
  types: CatalogItem[]
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [category, setCategory] = useState<string>(GEAR_CATEGORIES[0])

  return (
    <div className="p-3 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-48`} />
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">A model of</label>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={`${input} w-44`}>
          <option value="">— its own type —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${input} w-44`}>
          {GEAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <button
        onClick={() => name.trim() && run(async () => {
          await upsertGearItem({ name, category, parentId: parentId || null })
          setName(''); setParentId(''); onDone()
        })}
        disabled={busy || !name.trim()}
        className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
      >
        Add
      </button>
      <button onClick={onDone} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
    </div>
  )
}
