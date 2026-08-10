'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GEAR_CATEGORIES, matchesGear, type CatalogItem } from '@/lib/gear'
import { upsertGearItem, mergeGearItems, retireGearItem } from './actions'

type Row = CatalogItem & { active: boolean; uses: number }

// Sentinel for the "make one up" option. Not a category anything can be saved
// under — picking it swaps the select for a text field.
const NEW_CATEGORY = '__new__'

// Category picker that can also invent one. Categories are free text on the
// item, so a new one needs nothing but typing it; the seed list in lib/gear is
// a starting vocabulary, not a closed set.
function CategorySelect({
  value, options, onChange, className, disabled,
}: {
  value: string | null
  options: readonly string[]
  onChange: (next: string) => void
  className: string
  disabled?: boolean
}) {
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')

  if (naming) {
    const commit = () => {
      const next = draft.trim()
      setNaming(false); setDraft('')
      if (next) onChange(next)
    }
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setNaming(false); setDraft('') }
        }}
        placeholder="New category name"
        className={className}
      />
    )
  }

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => (e.target.value === NEW_CATEGORY ? setNaming(true) : onChange(e.target.value))}
      className={className}
    >
      <option value="">— category —</option>
      {options.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NEW_CATEGORY}>+ New category…</option>
    </select>
  )
}

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

  // Every category anything is actually filed under, plus the seed list. A
  // category invented on one row has to appear on the next row's dropdown or
  // it can never be used twice.
  const categories = useMemo(() => {
    const used = new Set(types.map((t) => t.category?.trim()).filter(Boolean) as string[])
    const seeded: readonly string[] = GEAR_CATEGORIES
    const extra = [...used].filter((c) => !seeded.includes(c)).sort((a, b) => a.localeCompare(b))
    return [...seeded, ...extra]
  }, [types])

  // The catalog reads as a shelf, not an alphabet: a category at a time, in the
  // seed order, with anything filed under a name of your own after it.
  // Uncategorised comes last and is always shown when it has rows — gear with
  // no category is the thing most needing attention, so it must not hide.
  const groups = useMemo(() => {
    const byCat = new Map<string, Row[]>()
    for (const t of shown) {
      const k = t.category?.trim() || ''
      byCat.set(k, [...(byCat.get(k) ?? []), t])
    }
    const ordered = categories
      .filter((c) => byCat.has(c))
      .map((c) => ({ name: c, rows: byCat.get(c)! }))
    const loose = byCat.get('')
    return loose ? [...ordered, { name: '', rows: loose }] : ordered
  }, [shown, categories])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  // Adding a branded product to the type it satisfies, from the type itself —
  // the top "+ Gear" form can do it via its "a model of" dropdown, but that
  // means naming a type you are already looking at.
  function AddModel({ type }: { type: Row }) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')

    const submit = () => {
      const next = name.trim()
      if (!next) return
      // A product inherits its type's category — it is the same kind of kit,
      // and a model filed elsewhere would group away from what it satisfies.
      run(async () => {
        await upsertGearItem({ name: next, category: type.category, parentId: type.id })
        setName(''); setOpen(false)
      })
    }

    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left px-3 py-2 text-[11px] text-zinc-600 hover:text-white hover:bg-zinc-800/40 transition-colors border-t border-zinc-800/70"
        >
          + Add a product to {type.name}
        </button>
      )
    }

    return (
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800/70 bg-zinc-900">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') { setOpen(false); setName('') }
          }}
          placeholder="Brand and model — e.g. Petzl Grigri"
          className={`flex-1 min-w-0 text-sm ${input}`}
        />
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="shrink-0 px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-xs font-medium transition-colors disabled:opacity-40"
        >
          Add
        </button>
        <button
          onClick={() => { setOpen(false); setName('') }}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  function Item({ row, sub }: { row: Row; sub?: boolean }) {
    const merging = mergeFrom?.id === row.id
    return (
      <div className={`flex items-start gap-2 px-3 py-2 ${sub ? 'pl-4' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {!sub && (
              <span className="text-[10px] uppercase tracking-wide text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 shrink-0">
                Type
              </span>
            )}
            <input
              defaultValue={row.name}
              onBlur={(e) => e.target.value !== row.name && run(() => upsertGearItem({ id: row.id, name: e.target.value, category: row.category }))}
              className={`${sub ? 'text-[13px] text-zinc-300 w-52' : 'text-sm font-medium w-64'} ${input}`}
            />
            {!sub && (
              <CategorySelect
                value={row.category}
                options={categories}
                disabled={busy}
                onChange={(next) => run(() => upsertGearItem({ id: row.id, name: row.name, category: next }))}
                className={`${input} text-xs`}
              />
            )}
            <span className="text-[11px] text-zinc-600">{row.uses > 0 ? `on ${row.uses} list${row.uses === 1 ? '' : 's'}` : 'unused'}</span>
          </div>
          <input
            defaultValue={row.recommended ?? ''}
            onBlur={(e) => e.target.value !== (row.recommended ?? '') && run(() => upsertGearItem({ id: row.id, name: row.name, category: row.category, recommended: e.target.value }))}
            placeholder={sub ? 'Note on this product' : 'What we recommend for this type'}
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
            placeholder={sub ? 'Also called — so searching finds this product' : 'Also called — comma separated, so searching finds it'}
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

      {/* Only while searching: the rest of the catalog is hidden then, and how
          much of it is hidden is the one thing looking at the page can't tell
          you. Unfiltered, everything is on screen and a total says nothing. */}
      {query.trim() && shown.length > 0 && (
        <p className="text-[11px] text-zinc-600">
          Showing {shown.length} of {types.length} types
        </p>
      )}

      {mergeFrom && (
        <p className="text-xs text-pr-red-light">
          Merging <strong>{mergeFrom.name}</strong> — pick the row to keep.{' '}
          <button onClick={() => setMergeFrom(null)} className="underline text-zinc-400">cancel</button>
        </p>
      )}

      {adding && <AddItem types={types} categories={categories} busy={busy} run={run} input={input} onDone={() => setAdding(false)} />}

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.name || '__none__'}>
            <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${g.name ? 'text-zinc-400' : 'text-yellow-500/80'}`}>
              {g.name || 'No category'}
            </h2>
            <div className="space-y-3">
              {g.rows.map((t) => {
                const models = childrenOf.get(t.id) ?? []
                return (
                  <div key={t.id} className="border border-zinc-800 rounded-lg overflow-hidden">
                    {/* The type: what a list asks for. Sits on its own band so
                        it reads as the heading of the card, not the first of a
                        set of equals. */}
                    <div className="bg-zinc-800/40">
                      <Item row={t} />
                    </div>

                    {models.length > 0 && (
                      <div className="pt-2 pb-1">
                        <p className="px-3 text-[10px] uppercase tracking-wide text-zinc-600 mb-1">
                          Products that satisfy it
                        </p>
                        <div className="ml-3 border-l-2 border-zinc-800 divide-y divide-zinc-800/50">
                          {models.map((m) => <Item key={m.id} row={m} sub />)}
                        </div>
                      </div>
                    )}

                    <AddModel type={t} />
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        {shown.length === 0 && <p className="text-sm text-zinc-500">Nothing matches “{query}”.</p>}
      </div>
    </div>
  )
}

function AddItem({
  types, categories, busy, run, input, onDone,
}: {
  types: CatalogItem[]
  categories: readonly string[]
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
        <CategorySelect
          value={category}
          options={categories}
          onChange={setCategory}
          className={`${input} w-44`}
        />
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
