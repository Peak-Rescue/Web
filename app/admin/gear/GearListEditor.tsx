'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GEAR_CATEGORIES, matchesGear, type CatalogItem } from '@/lib/gear'
import {
  addGearEntry, updateGearEntry, removeGearEntry, updateGearList, copyGearList,
  saveGearListIntoTemplate, setGearEntryOptions, upsertGearItem, renameGearSection,
} from './actions'

// Chosen in two places — the heading a row sits under, and the heading a new
// row lands in — so the "new one" affordance lives here rather than twice.
const NEW_SECTION = "__new_section__"

export type GearTemplateOption = { id: string; name: string; audience: string; entries: number }

export type GearItem = CatalogItem

export type GearEntry = {
  id: string
  gear_item_id: string | null
  name: string | null
  info: string | null
  recommended: string | null
  url: string | null
  // The heading this row prints under on the student's list. Free text, named
  // per list — not the catalog's category, which is how instructors find gear.
  section: string | null
  group_type: 'personal' | 'group'
  quantity: string | null
  sort_order: number
  gear_entry_options?: { gear_item_id: string; sort_order: number }[]
}

export type GearList = {
  id: string
  name: string
  audience: 'student' | 'instructor'
  intro: string | null
  instance_id: string | null
  is_template: boolean
  gear_list_entries: GearEntry[]
}

// Builds a list from the gear catalog instead of retyping it into a document.
//
// The catalog is two levels: a type ("Descent device") and the models that
// satisfy it ("Petzl Grigri"). A line names whichever level it means, and can
// name several models when more than one works.
export default function GearListEditor({
  list,
  catalog,
  courseType,
  templates,
}: {
  list: GearList
  catalog: GearItem[]
  courseType?: string | null
  // The equipment shelf's templates, so a list refined on a course can be saved
  // back over the one it started from instead of only spawning another.
  templates?: GearTemplateOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingOptions, setEditingOptions] = useState<string | null>(null)

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog])
  const childrenOf = useMemo(() => {
    const m = new Map<string, GearItem[]>()
    for (const c of catalog) if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c])
    return m
  }, [catalog])

  const resolve = (e: GearEntry) => {
    const c = e.gear_item_id ? byId.get(e.gear_item_id) : undefined
    const options = (e.gear_entry_options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => byId.get(o.gear_item_id))
      .filter(Boolean) as GearItem[]
    return {
      name: e.name ?? c?.name ?? 'Item',
      info: e.info ?? c?.info ?? null,
      recommended: e.recommended ?? c?.recommended ?? null,
      url: e.url ?? c?.url ?? null,
      section: e.section ?? c?.category ?? 'Other',
      catalogItem: c,
      options,
      models: c ? childrenOf.get(c.id) ?? [] : [],
    }
  }

  // Grouped the way the real lists are: personal kit first, then group kit,
  // each split into the sections this list has named.
  const grouped = useMemo(() => {
    const out: Record<'personal' | 'group', Record<string, (GearEntry & { r: ReturnType<typeof resolve> })[]>> = {
      personal: {}, group: {},
    }
    for (const e of [...list.gear_list_entries].sort((a, b) => a.sort_order - b.sort_order)) {
      const r = resolve(e)
      const bucket = out[e.group_type]
      bucket[r.section] = [...(bucket[r.section] ?? []), { ...e, r }]
    }
    return out
  }, [list.gear_list_entries, byId, childrenOf]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every heading this list already uses, in the order they appear. Offered
  // wherever a section is chosen, so a heading is picked rather than retyped —
  // free text with no picker is how "Environmental Layers" got a lowercase
  // twin sitting under it.
  const sections = useMemo(() => {
    const seen: string[] = []
    for (const e of [...list.gear_list_entries].sort((a, b) => a.sort_order - b.sort_order)) {
      const s = resolve(e).section
      if (!seen.includes(s)) seen.push(s)
    }
    return seen
  }, [list.gear_list_entries, byId, childrenOf]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <textarea
        defaultValue={list.intro ?? ''}
        onBlur={(e) => e.target.value !== (list.intro ?? '') && run(() => updateGearList(list.id, { intro: e.target.value }))}
        rows={2}
        placeholder="Optional intro — why this kit, what the conditions are"
        className={`w-full resize-y ${input}`}
      />

      {(['personal', 'group'] as const).map((gt) => {
        const cats = grouped[gt]
        if (Object.keys(cats).length === 0) return null
        return (
          <div key={gt}>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
              {gt === 'personal' ? 'Personal — each person' : 'Group — shared kit'}
            </h4>
            {Object.entries(cats).map(([cat, entries]) => (
              <div key={cat} className="mb-3">
                {/* The heading is the student's, so it's edited where you can
                    see what sits under it. Renaming moves every row in the
                    section — a section is only the string its rows agree on. */}
                <input
                  defaultValue={cat}
                  onBlur={(ev) => ev.target.value.trim() !== cat && run(() => renameGearSection(list.id, cat, ev.target.value))}
                  aria-label="Section heading"
                  className="text-[11px] text-zinc-500 mb-1 bg-transparent border border-transparent hover:border-zinc-800 focus:border-zinc-700 rounded px-1 -ml-1 focus:outline-none focus:text-zinc-300"
                />
                <div className="border border-zinc-800 rounded divide-y divide-zinc-800/70">
                  {entries.map((e) => {
                    return (
                      <div key={e.id} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.r.url ? (
                                <a href={e.r.url} target="_blank" rel="noreferrer" className="text-sm hover:text-pr-red-light transition-colors">
                                  {e.r.name}
                                </a>
                              ) : (
                                <span className="text-sm">{e.r.name}</span>
                              )}
                              {e.quantity && <span className="text-[11px] text-zinc-500">× {e.quantity}</span>}
                              {!e.r.catalogItem && <span className="text-[10px] text-zinc-700">one-off</span>}
                            </div>
                            {(e.r.info || e.r.recommended) && (
                              <p className="text-[11px] text-zinc-600 mt-0.5">
                                {e.r.info}
                                {e.r.info && e.r.recommended && ' — '}
                                {e.r.recommended && <span className="text-zinc-500">{e.r.recommended}</span>}
                              </p>
                            )}
                            {/* The chosen models belong on the row, not tucked
                                behind the toggle — ticking one has to look
                                like it did something, and the row is the only
                                place that shows what the student will read. */}
                            {/* Ticking nothing is a real answer — any model of
                                the type works — so show which ones that means.
                                The student's list says the same thing, and an
                                editor that showed less made "any" look like a
                                line nobody had finished. */}
                            {e.r.options.length === 0 && e.r.models.length > 0 && (
                              <p className="text-[11px] text-zinc-600 mt-1">
                                {e.r.models.length === 1 ? 'such as ' : 'any of: '}
                                <span className="text-zinc-500">{e.r.models.map((m) => m.name).join(' · ')}</span>
                              </p>
                            )}
                            {e.r.options.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="text-[11px] text-zinc-600">these will do:</span>
                                {e.r.options.map((o) => (
                                  <span
                                    key={o.id}
                                    className="text-[11px] px-1.5 py-0.5 rounded border border-pr-red/60 bg-pr-red/10 text-zinc-200"
                                  >
                                    {o.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {e.r.models.length > 0 && (
                              <button
                                onClick={() => setEditingOptions(editingOptions === e.id ? null : e.id)}
                                className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                              >
                                {e.r.options.length === 0
                                  ? 'Any model works — narrow it'
                                  : 'Change which models work'}
                              </button>
                            )}
                          </div>
                          <select
                            value={e.r.section}
                            onChange={(ev) => {
                              const v = ev.target.value
                              const next = v === NEW_SECTION ? prompt('Name the new section:')?.trim() : v
                              if (next && next !== e.r.section) run(() => updateGearEntry(e.id, { section: next }))
                            }}
                            disabled={busy}
                            aria-label="Section"
                            title="Which heading this sits under on the student's list"
                            className={`w-32 shrink-0 text-[11px] ${input}`}
                          >
                            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                            <option value={NEW_SECTION}>＋ New section…</option>
                          </select>
                          <input
                            defaultValue={e.quantity ?? ''}
                            onBlur={(ev) => ev.target.value !== (e.quantity ?? '') && run(() => updateGearEntry(e.id, { quantity: ev.target.value }))}
                            placeholder="qty"
                            className={`w-16 shrink-0 ${input}`}
                          />
                          <button
                            onClick={() => run(() => removeGearEntry(e.id))}
                            disabled={busy}
                            className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                          >
                            ×
                          </button>
                        </div>

                        {editingOptions === e.id && (
                          <div className="mt-2 p-2 bg-zinc-900 rounded border border-zinc-800">
                            <p className="text-[11px] text-zinc-500 mb-1.5">
                              Tick the models that will do. Tick none and any model of this type is fine.
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {e.r.models.map((m) => {
                                const on = e.r.options.some((o) => o.id === m.id)
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => run(() => setGearEntryOptions(
                                      e.id,
                                      on ? e.r.options.filter((o) => o.id !== m.id).map((o) => o.id)
                                         : [...e.r.options.map((o) => o.id), m.id]
                                    ))}
                                    disabled={busy}
                                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                                      on
                                        ? 'border-pr-red bg-pr-red/10 text-white'
                                        : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                                    }`}
                                  >
                                    {m.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      <AddGearRow list={list} catalog={catalog} childrenOf={childrenOf} sections={sections} busy={busy} run={run} input={input} />

      {!list.is_template && (
        <SaveToShelf
          list={list} templates={templates ?? []} courseType={courseType}
          busy={busy} run={run} input={input}
        />
      )}
    </div>
  )
}

// Two ways onto the equipment shelf: a new template, or over one that's already
// there. Overwriting is the one that needed building — a template you'd refined
// on a course could only be re-saved under another name, so the shelf collected
// three near-identical lists and no way to tell which was current.
function SaveToShelf({
  list, templates, courseType, busy, run, input,
}: {
  list: GearList
  templates: GearTemplateOption[]
  courseType?: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [target, setTarget] = useState('')

  // Overwriting a template built for the other audience is nearly always a
  // mis-click, so those aren't offered.
  const same = templates.filter((t) => t.audience === list.audience)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        onClick={() => {
          const name = prompt('Save this list to the library as a new template. Name it:', list.name)
          if (name) run(() => copyGearList(list.id, { isTemplate: true, name, courseType }))
        }}
        disabled={busy}
        className="text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
      >
        Save as a new template
      </button>

      {same.length > 0 && (
        <>
          <span className="text-zinc-700">or update</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={`${input} text-xs max-w-52`}
          >
            <option value="">— pick a template —</option>
            {same.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.entries})</option>)}
          </select>
          <button
            onClick={() => {
              const t = same.find((x) => x.id === target)
              if (!t) return
              if (!confirm(
                `Replace what's on "${t.name}" with this list? Its name and tags stay, and courses already using it aren't touched.`
              )) return
              run(async () => { await saveGearListIntoTemplate(list.id, t.id); setTarget('') })
            }}
            disabled={busy || !target}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            Update it
          </button>
        </>
      )}
    </div>
  )
}

// Adding is search-first. A dropdown of every item invites you to give up
// scrolling and type a name that already exists under another one — which is
// how the catalog acquired three rows for a belay device. Here you search
// first, across names, synonyms and the models under each type, and "add as
// new" only appears once the search has come back empty.
//
// Nothing is listed until you search or open a category. An idle list of the
// first dozen items alphabetically reads as a suggestion for this course, and
// isn't one — a canyon list was offering tactical rope and weapon retention
// purely because they sort early.
function AddGearRow({
  list, catalog, childrenOf, sections, busy, run, input,
}: {
  list: GearList
  catalog: GearItem[]
  childrenOf: Map<string, GearItem[]>
  // The headings this list already has. Everything added lands in one of them.
  sections: string[]
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState<string | null>(null)
  const [groupType, setGroupType] = useState<'personal' | 'group'>('personal')
  const [newCategory, setNewCategory] = useState<string>(GEAR_CATEGORIES[0])
  const [newParent, setNewParent] = useState('')
  // Where the next item lands, and it stays put between adds — filling a
  // section means adding six things to it, not picking the heading six times.
  // Empty means the catalog decides, which is only right for an empty list.
  const [section, setSection] = useState('')

  const types = useMemo(() => catalog.filter((c) => !c.parent_id), [catalog])

  // Only categories the catalog actually has something in — an empty one is a
  // dead click.
  const categories = useMemo(
    () => GEAR_CATEGORIES.filter((c) => types.some((t) => t.category === c)),
    [types]
  )

  // Searching wins over browsing: typing anything means you've stopped
  // clicking. Search caps at 12 to keep the panel short; a category shows all
  // of itself, because half a category is worse than none.
  const searching = query.trim().length > 0
  const matches = useMemo(() => {
    if (searching) {
      return types.filter((t) => matchesGear(t, query, childrenOf.get(t.id) ?? [])).slice(0, 12)
    }
    if (browsing) return types.filter((t) => t.category === browsing)
    return []
  }, [types, query, searching, browsing, childrenOf])

  const exact = catalog.some((c) =>
    c.name.toLowerCase() === query.trim().toLowerCase() ||
    (c.aliases ?? []).includes(query.trim().toLowerCase())
  )

  function add(itemId: string | null, name?: string) {
    run(async () => {
      await addGearEntry(list.id, { gearItemId: itemId, name, groupType, section: section || null })
      setQuery('')
    })
  }

  return (
    <div className="p-3 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-56">
          <label className="block text-[11px] text-zinc-500 mb-1">Add gear — search the catalog</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. grigri, prusik, wetsuit"
            className={`w-full ${input}`}
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Carried by</label>
          <select value={groupType} onChange={(e) => setGroupType(e.target.value as 'personal' | 'group')} className={input}>
            <option value="personal">Each person</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Into section</label>
          <select
            value={section}
            onChange={(e) => {
              const v = e.target.value
              if (v !== NEW_SECTION) return setSection(v)
              const named = prompt('Name the new section — this is the heading students read:')?.trim()
              if (named) setSection(named)
            }}
            className={`${input} max-w-52`}
          >
            {/* A list with no sections yet has nothing to offer, so the catalog
                seeds the first rows and you rename the headings after. */}
            <option value="">{sections.length ? '— from the catalog —' : '— catalog decides —'}</option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            {/* Sticks around after it's chosen, so it survives a re-render
                before the first item lands in it. */}
            {section && !sections.includes(section) && <option value={section}>{section}</option>}
            <option value={NEW_SECTION}>+ New section…</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const on = !searching && browsing === c
          return (
            <button
              key={c}
              onClick={() => setBrowsing(browsing === c ? null : c)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                on
                  ? 'border-pr-red bg-pr-red/10 text-white'
                  : 'border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500'
              } ${searching ? 'opacity-40' : ''}`}
            >
              {c}
            </button>
          )
        })}
      </div>

      <div className="space-y-1">
        {!searching && !browsing && (
          <p className="px-2 py-1 text-[11px] text-zinc-600">
            Search above, or open a category, to see what the catalog has.
          </p>
        )}

        {matches.map((t) => {
          const models = childrenOf.get(t.id) ?? []
          return (
            <div key={t.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/60">
              <button
                onClick={() => add(t.id)}
                disabled={busy}
                className="min-w-0 flex-1 text-left disabled:opacity-40"
              >
                <span className="text-sm">{t.name}</span>
                {t.recommended && <span className="text-[11px] text-zinc-500 ml-2">{t.recommended}</span>}
                {models.length > 0 && (
                  <span className="block text-[11px] text-zinc-600 mt-0.5">
                    any of: {models.map((m) => m.name).join(' · ')}
                  </span>
                )}
              </button>
              {models.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end max-w-[45%]">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => add(m.id)}
                      disabled={busy}
                      title={`Add just the ${m.name}`}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {query.trim() && !exact && (
          <div className="px-2 py-2 border-t border-zinc-800 space-y-2">
            <p className="text-[11px] text-zinc-500">
              {matches.length > 0
                ? 'Not one of those? Add it — as a model under a type where that fits, so it stays findable.'
                : 'Nothing matches. Add it to the catalog:'}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">A model of</label>
                <select value={newParent} onChange={(e) => setNewParent(e.target.value)} className={`${input} w-44`}>
                  <option value="">— its own type —</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Category</label>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={`${input} w-44`}>
                  {GEAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                onClick={() => run(async () => {
                  const { id } = await upsertGearItem({
                    name: query, category: newCategory, parentId: newParent || null,
                  })
                  await addGearEntry(list.id, { gearItemId: id, groupType })
                  setQuery(''); setNewParent('')
                })}
                disabled={busy}
                className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                Add “{query.trim()}”
              </button>
              <button
                onClick={() => add(null, query)}
                disabled={busy}
                title="Put it on this list only — nothing is added to the catalog"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                just this list
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
