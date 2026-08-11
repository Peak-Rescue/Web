'use client'

import { useMemo, useState } from 'react'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import { GEAR_CATEGORIES, matchesGear, unwrap, type CatalogItem } from '@/lib/gear'
import { upsertGearItem, retireGearItem, renameGearCategory } from './actions'

type Row = CatalogItem & { active: boolean; uses: number }

// Sentinel for the "make one up" option. Not a category anything can be saved
// under — picking it swaps the select for a text field.
const NEW_CATEGORY = '__new__'

function toggled(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

// One row of ticks per facet. Nothing is hidden behind a dropdown: the whole
// vocabulary is short enough to read, and seeing every category at once is
// half of knowing what the catalog holds.
function Chips({
  label, options, picked, onToggle, labelFor,
}: {
  label: string
  options: readonly string[]
  picked: Set<string>
  onToggle: (value: string) => void
  labelFor?: (value: string) => string
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-600 w-20 shrink-0">{label}</span>
      {options.map((o) => {
        const on = picked.has(o)
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
              on
                ? 'border-pr-red bg-pr-red/10 text-white'
                : 'border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600'
            }`}
          >
            {labelFor ? labelFor(o) : o}
          </button>
        )
      })}
    </div>
  )
}

// The half-finished states worth hunting for while the catalog is being built
// out. Each is a thing that is missing, not a property something has.
type Gap = 'no-products' | 'no-notes' | 'no-link' | 'unused'
const GAP_LABEL: Record<Gap, string> = {
  'no-products': 'No products',
  'no-notes': 'No notes / spec',
  'no-link': 'A product with no link',
  unused: 'On no lists',
}
// Same idea one level down: name a generic item instead of picking one.
const NEW_TYPE = '__new_type__'

// Cells read as text until you touch them. A catalog is read far more often
// than it is edited, and forty rows of boxed inputs is a form, not a table.
const CELL =
  'w-full bg-transparent border border-transparent rounded px-1.5 py-1 hover:border-zinc-700 focus:border-zinc-500 focus:bg-zinc-800 focus:outline-none'

// Category picker that can also invent one. Categories are free text on the
// item, so a new one needs nothing but typing it; the seed list in lib/gear is
// a starting vocabulary, not a closed set.
function CategorySelect({
  value, options, onChange, className, disabled, autoFocus, onDismiss,
}: {
  value: string | null
  options: readonly string[]
  onChange: (next: string) => void
  className: string
  disabled?: boolean
  autoFocus?: boolean
  // Opened in place of a control, it has to be able to close again without
  // choosing — clicking away is how people back out of a menu.
  onDismiss?: () => void
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
      autoFocus={autoFocus}
      onBlur={() => onDismiss?.()}
      onKeyDown={(e) => { if (e.key === 'Escape') onDismiss?.() }}
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
  const [adding, setAdding] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  // Types ticked for a bulk refile. Categories get sorted out in sweeps —
  // you read a whole category, decide two of its five don't belong, and
  // want both somewhere else — so refiling one row at a time is the wrong
  // unit of work for the only job this page really has right now.
  // Which type has its category picker open.
  const [moving, setMoving] = useState<string | null>(null)
  // Which product has its link line open. A link is set once and read by
  // clicking, so it earns an icon and not a field on every row.
  const [linking, setLinking] = useState<string | null>(null)
  // Which row has asked to be deleted and is waiting to be asked again.
  const [confirming, setConfirming] = useState<string | null>(null)

  const types = useMemo(() => items.filter((i) => !i.parent_id), [items])
  const childrenOf = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const i of items) if (i.parent_id) m.set(i.parent_id, [...(m.get(i.parent_id) ?? []), i])
    return m
  }, [items])

  // Facets are combined with AND, and each is a set you tick into: the
  // question is "rope hardware, Petzl, nothing written on it yet", not one
  // axis at a time.
  const [pickedCats, setPickedCats] = useState<Set<string>>(new Set())
  const [pickedBrands, setPickedBrands] = useState<Set<string>>(new Set())
  const [gaps, setGaps] = useState<Set<Gap>>(new Set())

  // A brand belongs to a product, and the rows are generic items — so filtering
  // by brand shows the generic items that have one, carrying only the products
  // that matched. Showing every sibling would answer a question nobody asked.
  const productsOf = (t: Row) => {
    const kids = childrenOf.get(t.id) ?? []
    if (pickedBrands.size === 0) return kids
    return kids.filter((k) => k.brand && pickedBrands.has(k.brand.trim()))
  }

  const shown = useMemo(
    () => types.filter((t) => {
      const kids = childrenOf.get(t.id) ?? []
      if (!matchesGear(t, query, kids)) return false
      if (pickedCats.size > 0 && !pickedCats.has(t.category?.trim() || '')) return false
      if (pickedBrands.size > 0 && !kids.some((k) => k.brand && pickedBrands.has(k.brand.trim()))) return false
      if (gaps.has('no-products') && kids.length > 0) return false
      if (gaps.has('no-notes') && (t.info ?? '').trim()) return false
      if (gaps.has('no-link') && !kids.some((k) => !(k.url ?? '').trim())) return false
      if (gaps.has('unused') && t.uses > 0) return false
      return true
    }),
    [types, query, childrenOf, pickedCats, pickedBrands, gaps]
  )

  const filtering = pickedCats.size > 0 || pickedBrands.size > 0 || gaps.size > 0 || query.trim() !== ''

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
    // An action that hands back a message is reporting something fixable,
    // not succeeding quietly — the catch below is where it belongs.
    try { unwrap((await fn() ?? {}) as object); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  // Merging and retiring are things you do to the catalog perhaps once a month;
  // reading it is what happens the rest of the time. So they stay out of the
  // way until the pointer is on the row — except mid-merge, when every row is a
  // candidate keeper and hiding the target would be absurd.
  function Actions({ row }: { row: Row }) {
    const btn = 'text-[11px] text-zinc-500 hover:text-white transition-colors'
    return (
      <div className="flex items-center justify-end gap-3 whitespace-nowrap shrink-0">
        {/* Types only — a product follows the type it satisfies, so refiling
            one on its own is not a thing that can happen. */}
        {!row.parent_id && (
          moving === row.id ? (
            // Opens where it was clicked. A picker that appears at the far end
            // of the row makes you look for what you just asked for.
            <CategorySelect
              value={row.category}
              options={categories}
              disabled={busy}
              autoFocus
              onDismiss={() => setMoving(null)}
              onChange={(next) => {
                setMoving(null)
                if (next) run(() => upsertGearItem({ id: row.id, name: row.name, category: next }))
              }}
              className={`${input} text-[11px] w-56`}
            />
          ) : (
            <button
              onClick={() => setMoving(row.id)}
              title="File this type under a different category"
              className={btn}
            >
              category
            </button>
          )
        )}

        {/* Products only — nobody publishes a "brake-assist descender", Petzl
            publishes a Grigri. The pencil sets it, the arrow follows it, and
            neither costs a row when there is no link to show. */}
        {row.parent_id && (
          <>
            {row.url && (
              <a
                href={row.url} target="_blank" rel="noreferrer"
                title={`Open ${row.url}`}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
              </a>
            )}
            <button
              onClick={() => setLinking(linking === row.id ? null : row.id)}
              title={row.url ? 'Edit the link' : 'Add a link'}
              className={`transition-colors ${row.url ? 'text-zinc-600 hover:text-white' : 'text-zinc-700 hover:text-white'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          </>
        )}

        {/* The count that used to sit here explained why delete was missing.
            Delete is always offered now, so the explanation belongs at the
            moment of the decision instead — in the confirm, which is the only
            place it changes what you do. */}
        {confirming === row.id ? (
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">
              {row.uses > 0
                ? `on ${row.uses} list${row.uses === 1 ? '' : 's'} — delete?`
                : 'delete?'}
            </span>
            <button
              onClick={() => { setConfirming(null); run(() => retireGearItem(row.id)) }}
              disabled={busy}
              className="text-[11px] px-2 py-0.5 rounded border border-pr-red text-pr-red-light hover:bg-pr-red/10 transition-colors"
            >
              yes, delete
            </button>
            <button
              onClick={() => setConfirming(null)}
              className="text-[11px] text-zinc-500 hover:text-white transition-colors"
            >
              cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(row.id)}
            disabled={busy}
            className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
          >
            delete
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
          <Actions row={row} />
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          <input
            defaultValue={row.info ?? ''}
            onBlur={(e) => e.target.value !== (row.info ?? '') &&
              run(() => upsertGearItem({ id: row.id, name: row.name, info: e.target.value }))}
            placeholder="Notes / spec"
            className={`${CELL} flex-1 min-w-0 text-[11px] text-zinc-500`}
          />
        </div>

        {linking === row.id && (
          <input
            autoFocus
            defaultValue={row.url ?? ''}
            onBlur={(e) => {
              setLinking(null)
              if (e.target.value !== (row.url ?? '')) {
                run(() => upsertGearItem({ id: row.id, name: row.name, url: e.target.value }))
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setLinking(null) }}
            placeholder="https://…"
            className={`${input} mt-1 w-full text-[11px]`}
          />
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

      {/* Check all that apply, like the course and instructor filters. Brands
          and gaps are the two the catalog could never answer: which of these
          are Petzl, and which are still half-written. */}
      <div className="space-y-2">
        <Chips
          label="Category"
          options={categories.filter((c) => types.some((t) => (t.category?.trim() || '') === c))}
          picked={pickedCats}
          onToggle={(v) => setPickedCats(toggled(pickedCats, v))}
        />
        {brands.length > 0 && (
          <Chips
            label="Brand"
            options={brands}
            picked={pickedBrands}
            onToggle={(v) => setPickedBrands(toggled(pickedBrands, v))}
          />
        )}
        <Chips
          label="Still to do"
          options={(Object.keys(GAP_LABEL) as Gap[])}
          labelFor={(g) => GAP_LABEL[g as Gap]}
          picked={gaps as Set<string>}
          onToggle={(v) => setGaps(toggled(gaps as Set<string>, v) as Set<Gap>)}
        />
      </div>

      {filtering && (
        <p className="text-[11px] text-zinc-600">
          Showing {shown.length} of {types.length} generic items
          <button
            onClick={() => { setPickedCats(new Set()); setPickedBrands(new Set()); setGaps(new Set()); setQuery('') }}
            className="ml-3 text-zinc-500 hover:text-white underline transition-colors"
          >
            Clear all filters
          </button>
        </p>
      )}

      {adding && (
        <AddItem types={types} categories={categories} busy={busy} run={run} input={input} onDone={() => setAdding(false)} />
      )}

      {groups.map((g) => (
        <section key={g.name || '__none__'}>
          {/* A category is only the string its members carry, so renaming it
              here writes the new name onto every one of them. The heading is
              the one place that reads as the category itself. */}
          {/* A heading has to survive being an editable field: without weight,
              a colour that carries and a rule running off to the edge, it read
              as one more input in a page made of them. */}
          <div className="flex items-center gap-2.5 mb-2">
            <span className={`w-0.5 h-4 rounded-full ${g.name ? 'bg-pr-red' : 'bg-yellow-500'}`} />
            {g.name ? (
              <input
                defaultValue={g.name}
                key={g.name}
                // Sized to its own name so the rule starts where the word ends
                // rather than at some column the longest category set. Uppercase
                // and letter-spacing both run wider than a ch, so both are paid
                // for — undercounting clips the last letter.
                style={{ width: `calc(${g.name.length} * (1.1ch + 0.14em) + 1.75rem)` }}
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (!next || next === g.name) { e.target.value = g.name; return }
                  run(() => renameGearCategory(g.name, next))
                }}
                aria-label={`Rename the ${g.name} category`}
                className="min-w-0 text-sm font-bold uppercase tracking-[0.14em] text-zinc-100 bg-transparent border border-transparent rounded px-1.5 py-0.5 -ml-1.5 hover:border-zinc-700 focus:border-zinc-500 focus:bg-zinc-800 focus:outline-none"
              />
            ) : (
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-yellow-500">
                No category
              </h2>
            )}
            <span className="flex-1 h-px bg-zinc-800" />
          </div>

          <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {g.rows.map((t) => {
              const products = productsOf(t)
              return (
                <div key={t.id}>
                  <ItemRow row={t} />
                  {/* The products a type is satisfied by, held inside it: one
                      rail down the left so the nesting is a shape rather than
                      an indent you have to measure. */}
                  {(products.length > 0 || addingTo === t.id) && (
                    <div className="ml-6 border-l-2 border-zinc-800 pl-1">
                      {products.map((p) => <ItemRow key={p.id} row={p} sub />)}
                      {addingTo === t.id && (
                        <div className="py-0.5">
                          <AddProduct type={t} busy={busy} run={run} input={input} onDone={() => setAddingTo(null)} />
                        </div>
                      )}
                    </div>
                  )}
                  {addingTo !== t.id && (
                    <button
                      onClick={() => setAddingTo(t.id)}
                      className="ml-6 pl-2 py-1 text-[11px] text-zinc-700 hover:text-white transition-colors"
                    >
                      + product
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {shown.length === 0 && (
        <p className="text-sm text-zinc-500">
          {query.trim() ? `Nothing matches “${query}”.` : 'Nothing matches these filters.'}
        </p>
      )}
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
  // A generic item named here rather than picked. The category dropdown can
  // invent one; this one could not, so adding the first product of something
  // new meant adding the generic item, then starting the form again.
  const [newType, setNewType] = useState<string | null>(null)

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
          onChange={(next) => { setCategory(next); setParentId(''); setNewType(null) }}
          className={`${input} w-44`}
        />
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Generic item</label>
        {newType !== null ? (
          <input
            autoFocus
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setNewType(null) }}
            placeholder="New generic item"
            className={`${input} w-44`}
          />
        ) : (
          <select
            value={parentId}
            onChange={(e) => {
              if (e.target.value === NEW_TYPE) { setNewType(''); setParentId('') }
              else setParentId(e.target.value)
            }}
            className={`${input} w-44`}
          >
            <option value="">— none, this is a generic item —</option>
            {inCategory.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value={NEW_TYPE}>+ New generic item…</option>
          </select>
        )}
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-48`} />
      </div>
      {(parentId || newType) && (
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Brand — or type a new one</label>
          <input list="gear-brands" value={brand} onChange={(e) => setBrand(e.target.value)} className={`${input} w-48`} />
        </div>
      )}
      <button
        onClick={() => name.trim() && run(async () => {
          // A named generic item is created first, in this category, and the
          // product is filed under it — two writes for what reads as one.
          let parent = parentId
          if (newType?.trim()) {
            const { id } = unwrap(await upsertGearItem({ name: newType.trim(), category }))
            parent = id
          }
          await upsertGearItem({
            name, brand: parent ? brand.trim() || null : null, category, parentId: parent || null,
          })
          setName(''); setBrand(''); setParentId(''); setNewType(null); onDone()
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
