'use client'

import { useMemo, useState } from 'react'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import { GEAR_CATEGORIES, matchesGear, type CatalogItem } from '@/lib/gear'
import { upsertGearItem, mergeGearItems, retireGearItem } from './actions'

type Row = CatalogItem & { active: boolean; uses: number }

// Sentinel for the "make one up" option. Not a category anything can be saved
// under — picking it swaps the select for a text field.
const NEW_CATEGORY = '__new__'

// Cells read as text until you touch them. A catalog is read far more often
// than it is edited, and forty rows of boxed inputs is a form, not a table.
const CELL =
  'w-full bg-transparent border border-transparent rounded px-1.5 py-1 hover:border-zinc-700 focus:border-zinc-500 focus:bg-zinc-800 focus:outline-none'

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

// The catalog itself: types with the products that satisfy them, as a table,
// because the question it has to answer is "what have we got, and what is
// missing" — and a blank cell answers that at a glance where a stack of cards
// never could.
export default function GearCatalog({ items }: { items: Row[] }) {
  const refresh = useSteadyRefresh()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mergeFrom, setMergeFrom] = useState<Row | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  // Types ticked for a bulk refile. Categories get sorted out in sweeps —
  // you read a whole category, decide two of its five don't belong, and
  // want both somewhere else — so refiling one row at a time is the wrong
  // unit of work for the only job this page really has right now.
  // Which type has its category picker open.
  const [moving, setMoving] = useState<string | null>(null)
  // Which row has its write-rarely fields open. One at a time: the link and
  // the synonyms are read by search, not by people, so they stay folded.
  const [expanded, setExpanded] = useState<string | null>(null)

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

  // Brands already in use, offered as suggestions so the same maker isn't
  // entered three ways — which is exactly how "BD" and "Black Diamond" came to
  // be two brands before this column existed.
  const brands = useMemo(
    () => [...new Set(items.map((i) => i.brand?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  // A category at a time, in the seed order, with anything filed under a name
  // of your own after it. Uncategorised comes last and is always shown when it
  // has rows — gear with no category is the thing most needing attention.
  const groups = useMemo(() => {
    const byCat = new Map<string, Row[]>()
    for (const t of shown) {
      const k = t.category?.trim() || ''
      byCat.set(k, [...(byCat.get(k) ?? []), t])
    }
    const ordered = categories.filter((c) => byCat.has(c)).map((c) => ({ name: c, rows: byCat.get(c)! }))
    const loose = byCat.get('')
    return loose ? [...ordered, { name: '', rows: loose }] : ordered
  }, [shown, categories])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  // Merging and retiring are things you do to the catalog perhaps once a month;
  // reading it is what happens the rest of the time. So they stay out of the
  // way until the pointer is on the row — except mid-merge, when every row is a
  // candidate keeper and hiding the target would be absurd.
  function Actions({ row, showing }: { row: Row; showing: boolean }) {
    const merging = mergeFrom?.id === row.id
    const btn = 'text-[11px] text-zinc-500 hover:text-white transition-colors'
    return (
      <div className="flex items-center justify-end gap-3 whitespace-nowrap shrink-0">
        {/* Why it can't be retired, where retire would otherwise be. Nobody
            scans the catalog for a usage count; you want it at the moment the
            option you expected isn't there. */}
        <span
          title={row.uses > 0 ? `On ${row.uses} gear list${row.uses === 1 ? '' : 's'}` : 'On no lists'}
          className="text-[11px] text-zinc-700"
        >
          {row.uses > 0 ? `on ${row.uses}` : ''}
        </span>

        {/* Types only — a product follows the type it satisfies, so refiling
            one on its own is not a thing that can happen. Labelled with the
            noun: a checkbox armed a hidden bar and never said what it was for,
            and "move" didn't say move what, or where. */}
        {!row.parent_id && (
          <button
            onClick={() => setMoving(moving === row.id ? null : row.id)}
            title="File this type under a different category"
            className={moving === row.id ? 'text-[11px] text-white' : btn}
          >
            category
          </button>
        )}

        <button
          onClick={() => setExpanded(showing ? null : row.id)}
          title="Link and synonyms"
          className={showing ? 'text-[11px] text-white' : btn}
        >
          {showing ? 'less' : 'more'}
        </button>

        {mergeFrom && !merging ? (
          <button
            onClick={() => {
              if (confirm(`Fold "${mergeFrom.name}" into "${row.name}"? Every list using it will point here instead, and "${mergeFrom.name}" is deleted.`)) {
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
            title="Mark this as a duplicate, then pick the row to keep"
            className={merging ? 'text-[11px] text-pr-red-light' : btn}
          >
            {merging ? 'pick keeper…' : 'duplicate'}
          </button>
        )}

        {row.uses === 0 && (
          <button
            onClick={() => run(() => retireGearItem(row.id))}
            disabled={busy}
            title="Remove from the catalog. Only offered while nothing uses it."
            className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
          >
            retire
          </button>
        )}
      </div>
    )
  }

  // One item, two lines: what it is on the first, what we say about it on the
  // second. The fields that get written once and read by search — the link and
  // the synonyms — stay behind a toggle, because a row that shows every field
  // at all times is a form, and this page is read far more than it is edited.
  function ItemRow({ row, sub }: { row: Row; sub?: boolean }) {
    const showing = expanded === row.id
    return (
      <div className={`px-2 py-1.5 ${sub ? 'pl-9 bg-zinc-950/30' : ''}`}>
        <div className="flex items-center gap-2">
          <input
            defaultValue={row.name}
            onBlur={(e) => e.target.value !== row.name &&
              run(() => upsertGearItem({ id: row.id, name: e.target.value }))}
            className={`${CELL} ${sub ? 'text-[13px] text-zinc-300 w-52' : 'text-sm font-medium w-64'}`}
          />

          {sub && (
            <input
              list="gear-brands"
              defaultValue={row.brand ?? ''}
              onBlur={(e) => e.target.value !== (row.brand ?? '') &&
                run(() => upsertGearItem({ id: row.id, name: row.name, brand: e.target.value }))}
              placeholder="Brand"
              className={`${CELL} text-[13px] text-zinc-300 w-40`}
            />
          )}

          <span className="flex-1" />
          <Actions row={row} showing={showing} />
        </div>

        {moving === row.id && (
          <div className="mt-1">
            <CategorySelect
              value={row.category}
              options={categories}
              disabled={busy}
              onChange={(next) => {
                setMoving(null)
                if (next) run(() => upsertGearItem({ id: row.id, name: row.name, category: next }))
              }}
              className={`${input} text-[11px] w-64`}
            />
          </div>
        )}

        <div className="flex items-center gap-2 mt-0.5">
          <input
            defaultValue={row.info ?? ''}
            onBlur={(e) => e.target.value !== (row.info ?? '') &&
              run(() => upsertGearItem({ id: row.id, name: row.name, info: e.target.value }))}
            placeholder="Notes / spec"
            className={`${CELL} flex-1 min-w-0 text-[11px] text-zinc-500`}
          />
        </div>

        {showing && (
          <div className="flex flex-wrap items-center gap-2 mt-1 pl-5">
            <input
              defaultValue={row.url ?? ''}
              onBlur={(e) => e.target.value !== (row.url ?? '') &&
                run(() => upsertGearItem({ id: row.id, name: row.name, url: e.target.value }))}
              placeholder="Link — manufacturer or spec page"
              className={`${input} flex-1 min-w-56 text-[11px]`}
            />
            <input
              defaultValue={(row.aliases ?? []).join(', ')}
              onBlur={(e) => {
                const next = e.target.value.split(',').map((a) => a.trim()).filter(Boolean)
                if (next.join(',') !== (row.aliases ?? []).join(',')) {
                  run(() => upsertGearItem({ id: row.id, name: row.name, aliases: next }))
                }
              }}
              placeholder="Also called — what people type when searching"
              className={`${input} flex-1 min-w-56 text-[11px]`}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      {/* One list of every brand in use, shared by every brand cell. */}
      <datalist id="gear-brands">
        {brands.map((b) => <option key={b} value={b} />)}
      </datalist>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gear, synonyms and products"
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
        <p className="text-[11px] text-zinc-600">Showing {shown.length} of {types.length} types</p>
      )}

      {mergeFrom && (
        <p className="text-xs text-pr-red-light">
          Merging <strong>{mergeFrom.name}</strong> — pick the row to keep.{' '}
          <button onClick={() => setMergeFrom(null)} className="underline text-zinc-400">cancel</button>
        </p>
      )}

      {adding && (
        <AddItem types={types} categories={categories} busy={busy} run={run} input={input} onDone={() => setAdding(false)} />
      )}

      {groups.map((g) => (
        <section key={g.name || '__none__'}>
          <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${g.name ? 'text-zinc-400' : 'text-yellow-500/80'}`}>
            {g.name || 'No category'}
          </h2>

          <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {g.rows.map((t) => {
              const products = childrenOf.get(t.id) ?? []
              return (
                <div key={t.id}>
                  <ItemRow row={t} />
                  {products.map((p) => <ItemRow key={p.id} row={p} sub />)}
                  <div className="pl-9 py-0.5">
                    {addingTo === t.id ? (
                      <AddProduct type={t} busy={busy} run={run} input={input} onDone={() => setAddingTo(null)} />
                    ) : (
                      <button
                        onClick={() => setAddingTo(t.id)}
                        className="py-1 text-[11px] text-zinc-700 hover:text-white transition-colors"
                      >
                        + product
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {shown.length === 0 && <p className="text-sm text-zinc-500">Nothing matches “{query}”.</p>}
    </div>
  )
}

// Adding a product to the type it satisfies, from the type itself. It inherits
// the type's category: a product is the same kind of kit as what it satisfies,
// and one filed elsewhere would group away from it.
function AddProduct({
  type, busy, run, input, onDone,
}: {
  type: Row
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  onDone: () => void
}) {
  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    run(async () => {
      await upsertGearItem({
        name: name.trim(), brand: brand.trim() || null, category: type.category, parentId: type.id,
      })
      setBrand(''); setName(''); onDone()
    })
  }

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') onDone()
  }

  // Product first, brand second — the same order as the columns this row is
  // adding to. Reversed, the fields didn't line up with the rows above them and
  // the row read as a different kind of thing.
  //
  // Brand is a suggestion list, not a menu: the makers already in the catalog
  // are one keystroke away, and a maker that isn't there yet is typed. The
  // browser draws the datalist arrow either way, which makes it look closed —
  // so the placeholder says out loud that a new one is welcome.
  return (
    <div className="flex flex-wrap items-center gap-2 pl-6 py-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={key}
        placeholder="Product — e.g. Grigri"
        className={`${input} w-52 text-[13px]`}
      />
      <input
        list="gear-brands"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        onKeyDown={key}
        placeholder="Brand — or type a new one"
        className={`${input} w-52 text-[13px]`}
      />
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="px-3 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white text-xs font-medium transition-colors disabled:opacity-40"
      >
        Add
      </button>
      <button onClick={onDone} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
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
  const [brand, setBrand] = useState('')
  const [parentId, setParentId] = useState('')
  const [category, setCategory] = useState<string>(GEAR_CATEGORIES[0])

  // The types this category holds. Offering all forty of them under every
  // category was how a harness ended up satisfying a rope: the list was the
  // same list wherever you were, so nothing said which of them belonged here.
  const inCategory = useMemo(() => types.filter((t) => t.category === category), [types, category])

  return (
    <div className="p-3 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg flex flex-wrap items-end gap-2">
      {/* Where it goes first, widest decision down to narrowest: the category
          it files under, then the type within that category it satisfies.
          Those two are the two halves of one question — a type is filed under
          a category and has no maker; a product is filed with the type it
          satisfies and has one.
          Then the row is named the way the table names it, product before
          brand, so this reads in the same order as everything it's being added
          to — the same order the inline "+ product" row asks in. */}
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Category</label>
        <CategorySelect
          value={category}
          options={categories}
          // The type picked is one of this category's, so changing category
          // un-picks it rather than leaving a product filed against a type
          // that is no longer on offer.
          onChange={(next) => { setCategory(next); setParentId('') }}
          className={`${input} w-44`}
        />
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">A product of</label>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={inCategory.length === 0}
          className={`${input} w-44 disabled:opacity-40`}
        >
          <option value="">{inCategory.length === 0 ? '— nothing here yet —' : '— its own type —'}</option>
          {inCategory.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-48`} />
      </div>
      {parentId && (
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Brand — or type a new one</label>
          <input list="gear-brands" value={brand} onChange={(e) => setBrand(e.target.value)} className={`${input} w-48`} />
        </div>
      )}
      <button
        onClick={() => name.trim() && run(async () => {
          await upsertGearItem({
            name, brand: parentId ? brand.trim() || null : null, category, parentId: parentId || null,
          })
          setName(''); setBrand(''); setParentId(''); onDone()
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
