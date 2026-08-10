'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GEAR_CATEGORIES, matchesGear, type CatalogItem } from '@/lib/gear'
import {
  addGearEntry, updateGearEntry, removeGearEntry, updateGearList, copyGearList,
  saveGearListIntoTemplate, setGearEntryOptions, upsertGearItem, renameGearSection,
  removeGearSection, ungroupGearSection, moveGearEntry,
} from './actions'

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

type GroupType = 'personal' | 'group'

const GROUP_LABEL: Record<GroupType, string> = {
  personal: 'Personal — each person',
  group: 'Group — shared kit',
}

// A row picked up and not yet dropped.
type Drag = { id: string }

// Builds a list from the gear catalog instead of retyping it into a document.
//
// The catalog is two levels: a type ("Descent device") and the models that
// satisfy it ("Petzl Grigri"). A line names whichever level it means, and can
// name several models when more than one works.
//
// The list is built section by section: name a heading, then fill it. Sections
// are the structure here, not a property each row carries — even though the
// database still stores them that way, because a heading is nothing more than
// what its rows agree on.
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
  // Which section's add panel is open, as "personal:Ropes". One at a time —
  // two open panels and it stops being obvious where the next item lands.
  const [adding, setAdding] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // Sections named but not yet filled. A heading with no rows has nowhere to
  // live in the database, so it lives here until the first item lands in it.
  const [drafts, setDrafts] = useState<{ key: GroupType; name: string }[]>([])
  // The list as the editor has it, ahead of the server. Every write to a row
  // is drawn here first: a click has to land instantly, and the server can't
  // oblige — an add is three round trips to Supabase and then a rebuild of the
  // whole course page, which is most of a second even when nothing is wrong.
  const [pending, setPending] = useState<GearEntry[] | null>(null)
  const inflight = useRef(0)

  const entries = pending ?? list.gear_list_entries
  // Fresh props mean the server has caught up — unless writes are still in the
  // air, in which case the props are behind what's on screen and dropping the
  // local copy would flash rows out of existence and back.
  useEffect(() => { if (inflight.current === 0) setPending(null) }, [list.gear_list_entries])

  const patch = (fn: (es: GearEntry[]) => GearEntry[]) =>
    setPending((p) => fn(p ?? list.gear_list_entries))

  // Row-level edits: draw the result, then send it. Nothing is disabled while
  // it flies, so six items go onto a list as fast as they can be clicked
  // instead of one per round trip.
  function apply(optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) {
    setError(null)
    patch(optimistic)
    inflight.current += 1
    fn()
      .then(() => router.refresh())
      .catch((e) => { setError(e instanceof Error ? e.message : 'That didn’t save'); setPending(null) })
      .finally(() => { inflight.current -= 1 })
  }

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
      // No section is the normal case: the row sits directly under Personal or
      // Group. A heading is something you add on purpose.
      section: e.section,
      catalogItem: c,
      options,
      models: c ? childrenOf.get(c.id) ?? [] : [],
    }
  }

  // Every row in the order the list is stored in. Drag maths happen against
  // this, so a row moved between sections keeps its place relative to rows it
  // was never next to on screen.
  const ordered = useMemo(
    () => [...entries].sort((a, b) => a.sort_order - b.sort_order).map((e) => ({ ...e, r: resolve(e) })),
    [entries, byId, childrenOf] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Grouped the way the real lists are: personal kit first, then group kit.
  // Each side has a bucket of gear filed under no heading at all — that comes
  // first and always exists, so a list can be built by adding gear and nothing
  // else — then whatever sections this list has named, in the order they appear.
  const grouped = useMemo(() => {
    const out: Record<GroupType, { loose: typeof ordered; sections: { name: string; rows: typeof ordered }[] }> = {
      personal: { loose: [], sections: [] },
      group: { loose: [], sections: [] },
    }
    for (const e of ordered) {
      const block = out[e.group_type]
      if (!e.r.section) { block.loose.push(e); continue }
      const found = block.sections.find((s) => s.name === e.r.section)
      if (found) found.rows.push(e)
      else block.sections.push({ name: e.r.section, rows: [e] })
    }
    return out
  }, [ordered])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save'); setPending(null) }
    finally { setBusy(false) }
  }

  // Dropping is always expressed as "this row goes immediately before that
  // one", with the end of a section standing in for "after everything in it".
  // An empty section has nothing to sit before, so the row goes to the end.
  function drop(gt: GroupType, section: string | null, beforeId: string | null) {
    if (!drag) return
    const dragged = ordered.find((e) => e.id === drag.id)
    setDrag(null)
    if (!dragged) return
    if (dragged.group_type === gt && dragged.r.section === section && beforeId === drag.id) return

    const rest = ordered.filter((e) => e.id !== drag.id)
    let at: number
    if (beforeId) {
      at = rest.findIndex((e) => e.id === beforeId)
      if (at < 0) at = rest.length
    } else {
      // Last row of the section it was dropped into, so it lands under the
      // gear already there rather than at the bottom of the whole list.
      let last = -1
      rest.forEach((e, i) => { if (e.group_type === gt && e.r.section === section) last = i })
      at = last < 0 ? rest.length : last + 1
    }

    const moved = { ...dragged, group_type: gt, section }
    const next = [...rest.slice(0, at), moved, ...rest.slice(at)]
      .map(({ r: _r, ...e }, i) => ({ ...e, sort_order: i })) // eslint-disable-line @typescript-eslint/no-unused-vars
    apply(() => next, () => moveGearEntry(list.id, drag.id, {
      section, groupType: gt, orderedIds: next.map((e) => e.id),
      instanceId: list.instance_id,
    }))
  }

  // The added row is drawn from what the catalog already says about the item,
  // under an id the server hasn't issued yet. It is replaced wholesale by the
  // real one when the page catches up.
  function addEntry(input: { gearItemId?: string | null; name?: string; section: string | null; groupType: GroupType }) {
    const sortOrder = entries.reduce((m, e) => Math.max(m, e.sort_order), -1) + 1
    const temp: GearEntry = {
      id: `pending-${sortOrder}-${input.gearItemId ?? input.name ?? ''}`,
      gear_item_id: input.gearItemId ?? null,
      name: input.gearItemId ? null : input.name?.trim() || null,
      info: null, recommended: null, url: null,
      section: input.section, group_type: input.groupType, quantity: null,
      sort_order: sortOrder, gear_entry_options: [],
    }
    apply((es) => [...es, temp], () => addGearEntry(list.id, {
      gearItemId: input.gearItemId, name: input.name,
      section: input.section, groupType: input.groupType,
      sortOrder, instanceId: list.instance_id,
    }))
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <textarea
        defaultValue={list.intro ?? ''}
        onBlur={(e) => e.target.value !== (list.intro ?? '') && run(() => updateGearList(list.id, { intro: e.target.value }))}
        rows={2}
        placeholder="Optional intro — why this kit, what the conditions are"
        className={`w-full resize-y ${input}`}
      />

      {(['personal', 'group'] as const).map((gt) => {
        const { loose, sections: real } = grouped[gt]
        // A draft the first item has already landed in is a real section now.
        const draft = drafts.filter((d) => d.key === gt && !real.some((s) => s.name === d.name))
        return (
          <div key={gt}>
            <h4 className="text-[11px] font-medium text-zinc-600 uppercase tracking-widest mb-2">
              {GROUP_LABEL[gt]}
            </h4>

            <div className="space-y-3">
              {/* Always here, headed by nothing. Gear that needs no heading is
                  the common case, so it can't be behind naming one first. */}
              <SectionCard
                key={`${gt}:loose`}
                listId={list.id} groupType={gt} name={null} rows={loose}
                catalog={catalog} childrenOf={childrenOf}
                adding={adding === `${gt}:loose`}
                setAdding={(on) => setAdding(on ? `${gt}:loose` : null)}
                editingOptions={editingOptions} setEditingOptions={setEditingOptions}
                drag={drag} setDrag={setDrag} onDrop={drop}
                apply={apply} addEntry={addEntry} instanceId={list.instance_id}
                busy={busy} run={run} input={input}
              />

              {real.map((s) => (
                <SectionCard
                  key={`${gt}:${s.name}`}
                  listId={list.id} groupType={gt} name={s.name} rows={s.rows}
                  catalog={catalog} childrenOf={childrenOf}
                  adding={adding === `${gt}:${s.name}`}
                  setAdding={(on) => setAdding(on ? `${gt}:${s.name}` : null)}
                  editingOptions={editingOptions} setEditingOptions={setEditingOptions}
                  drag={drag} setDrag={setDrag} onDrop={drop}
                  apply={apply} addEntry={addEntry} instanceId={list.instance_id}
                  busy={busy} run={run} input={input}
                />
              ))}

              {draft.map((d) => (
                <SectionCard
                  key={`draft:${gt}:${d.name}`}
                  listId={list.id} groupType={gt} name={d.name} rows={[]} isDraft
                  catalog={catalog} childrenOf={childrenOf}
                  adding={adding === `${gt}:${d.name}`}
                  setAdding={(on) => setAdding(on ? `${gt}:${d.name}` : null)}
                  editingOptions={editingOptions} setEditingOptions={setEditingOptions}
                  drag={drag} setDrag={setDrag} onDrop={drop}
                  apply={apply} addEntry={addEntry} instanceId={list.instance_id}
                  onDiscard={() => setDrafts((xs) => xs.filter((x) => !(x.key === gt && x.name === d.name)))}
                  onRename={(next) => setDrafts((xs) => xs.map((x) =>
                    x.key === gt && x.name === d.name ? { ...x, name: next } : x
                  ))}
                  busy={busy} run={run} input={input}
                />
              ))}

              <button
                onClick={() => {
                  const named = prompt('Name the new section — this is the heading students read:')?.trim()
                  if (!named) return
                  if (real.some((s) => s.name === named) || draft.some((d) => d.name === named)) {
                    return setAdding(`${gt}:${named}`)
                  }
                  setDrafts((xs) => [...xs, { key: gt, name: named }])
                  setAdding(`${gt}:${named}`)
                }}
                className="text-xs text-zinc-500 hover:text-white border border-dashed border-zinc-800 hover:border-zinc-600 rounded-lg w-full py-2 transition-colors"
              >
                + New section
              </button>
            </div>
          </div>
        )
      })}

      {!list.is_template && (
        <SaveToShelf
          list={list} templates={templates ?? []} courseType={courseType}
          busy={busy} run={run} input={input}
        />
      )}
    </div>
  )
}

// One heading and what sits under it. The header bar is the point: the section
// name is the thing you scan for and the thing you rename, so it outranks
// everything else in the card and reads as a field rather than a caption.
//
// A null name is the gear filed under no heading, which is most of it. That
// card has no header — there is nothing to name, rename or delete — but it
// takes drops and adds like any other.
function SectionCard({
  listId, groupType, name, rows, isDraft, catalog, childrenOf,
  adding, setAdding, editingOptions, setEditingOptions,
  drag, setDrag, onDrop, apply, addEntry, instanceId,
  onDiscard, onRename, busy, run, input,
}: {
  listId: string
  groupType: GroupType
  name: string | null
  rows: (GearEntry & { r: { name: string; info: string | null; recommended: string | null; url: string | null; section: string | null; catalogItem?: GearItem; options: GearItem[]; models: GearItem[] } })[]
  isDraft?: boolean
  catalog: GearItem[]
  childrenOf: Map<string, GearItem[]>
  adding: boolean
  setAdding: (on: boolean) => void
  editingOptions: string | null
  setEditingOptions: (id: string | null) => void
  drag: Drag | null
  setDrag: (d: Drag | null) => void
  onDrop: (gt: GroupType, section: string | null, beforeId: string | null) => void
  apply: (optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) => void
  addEntry: (input: { gearItemId?: string | null; name?: string; section: string | null; groupType: GroupType }) => void
  instanceId: string | null
  onDiscard?: () => void
  onRename?: (next: string) => void
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  // Which gap the row being dragged would land in. Null while nothing hovers,
  // 'end' for the space under the last row.
  const [over, setOver] = useState<string | 'end' | null>(null)
  const dragging = drag !== null

  // A drag abandoned outside any card would otherwise leave its landing line
  // drawn across a section nothing is being dropped into.
  useEffect(() => { if (!dragging) setOver(null) }, [dragging])

  // A row's own gap has to win over the card's catch-all, so the line is drawn
  // where the row would land rather than always at the end of the section.
  const gap = (beforeId: string | 'end') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return
      e.preventDefault(); e.stopPropagation()
      setOver(beforeId)
    },
    onDragLeave: () => setOver((o) => (o === beforeId ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      setOver(null)
      onDrop(groupType, name, beforeId === 'end' ? null : beforeId)
    },
  })

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        dragging && over ? 'border-pr-red/70' : 'border-zinc-800'
      }`}
      {...gap('end')}
    >
      {name !== null && (
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border-b border-zinc-800">
          <input
            defaultValue={name}
            key={name}
            onBlur={(ev) => {
              const next = ev.target.value.trim()
              if (!next || next === name) { ev.target.value = name; return }
              if (isDraft) return onRename?.(next)
              run(() => renameGearSection(listId, groupType, name, next))
            }}
            aria-label="Section heading"
            className="min-w-0 flex-1 text-sm font-semibold text-white bg-transparent rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
          />
          <span className="shrink-0 text-[11px] text-zinc-500">
            {isDraft ? 'empty' : `${rows.length} item${rows.length === 1 ? '' : 's'}`}
          </span>
          {!isDraft && rows.length > 0 && (
            <button
              onClick={() => run(() => ungroupGearSection(listId, groupType, name))}
              disabled={busy}
              title="Drop the heading and keep the gear"
              className="shrink-0 text-[11px] text-zinc-600 hover:text-white transition-colors disabled:opacity-40"
            >
              ungroup
            </button>
          )}
          <button
            onClick={() => {
              if (isDraft) return onDiscard?.()
              if (!confirm(`Delete “${name}” and the ${rows.length} item${rows.length === 1 ? '' : 's'} under it?`)) return
              run(() => removeGearSection(listId, groupType, name))
            }}
            disabled={busy}
            title={isDraft ? 'Discard this section' : 'Delete this section and its gear'}
            className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            ×
          </button>
        </div>
      )}

      {isDraft && rows.length === 0 && (
        <p className="px-3 py-2 text-[11px] text-zinc-600">
          Nothing in here yet. Add the first item and the heading sticks.
        </p>
      )}

      <div className="divide-y divide-zinc-800/70">
        {rows.map((e) => (
          <Row
            key={e.id} e={e}
            editingOptions={editingOptions} setEditingOptions={setEditingOptions}
            dragging={dragging} isOver={over === e.id}
            onDragStart={() => setDrag({ id: e.id })}
            onDragEnd={() => { setDrag(null); setOver(null) }}
            gap={gap(e.id)}
            apply={apply} instanceId={instanceId}
            busy={busy} run={run} input={input}
          />
        ))}
      </div>

      <div className={rows.length > 0 ? 'border-t border-zinc-800/70' : ''}>
        {adding ? (
          <AddGear
            listId={listId} section={name} groupType={groupType}
            catalog={catalog} childrenOf={childrenOf} addEntry={addEntry}
            onClose={() => setAdding(false)}
            busy={busy} run={run} input={input}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800/40 transition-colors"
          >
            + Add gear{name ? ` to ${name}` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({
  e, editingOptions, setEditingOptions, dragging, isOver,
  onDragStart, onDragEnd, gap, apply, instanceId, busy, run, input,
}: {
  e: GearEntry & { r: { name: string; info: string | null; recommended: string | null; url: string | null; section: string | null; catalogItem?: GearItem; options: GearItem[]; models: GearItem[] } }
  editingOptions: string | null
  setEditingOptions: (id: string | null) => void
  dragging: boolean
  isOver: boolean
  onDragStart: () => void
  onDragEnd: () => void
  gap: { onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void }
  apply: (optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) => void
  instanceId: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const [newModel, setNewModel] = useState('')

  // A type is a line the student has to satisfy with something they own, so it
  // can carry recommendations. A row that already names one specific model, or
  // that was typed in as a one-off, has nothing to recommend under it.
  const type = e.r.catalogItem && !e.r.catalogItem.parent_id ? e.r.catalogItem : null

  // Recommendations are stored as the whole set, so every change to them is
  // "here is the new list of models" — drawn on the row before it is sent.
  const setOptions = (ids: string[]) => apply(
    (es) => es.map((x) => x.id === e.id
      ? { ...x, gear_entry_options: ids.map((gear_item_id, i) => ({ gear_item_id, sort_order: i })) }
      : x),
    () => setGearEntryOptions(e.id, ids, instanceId)
  )

  return (
    <div
      ref={row}
      {...gap}
      className={`px-3 py-2 group ${isOver ? 'border-t-2 border-pr-red' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Only the handle starts a drag, so the quantity field and the model
            buttons still take a click. The row is the drag image, because a
            lone handle floating across the page says nothing about what's
            moving. */}
        <span
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.effectAllowed = 'move'
            ev.dataTransfer.setData('text/plain', e.id)
            if (row.current) ev.dataTransfer.setDragImage(row.current, 12, 12)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          title="Drag to reorder, or into another section"
          className={`shrink-0 mt-0.5 cursor-grab active:cursor-grabbing select-none text-zinc-700 hover:text-zinc-400 transition-opacity ${
            dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          ⠿
        </span>
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
          {/* The products we point people at sit directly under the name,
              ahead of the description, because the model someone has to go and
              buy is the answer to the question the row is asking. Everything
              that used to explain them — "these will do", "change which models
              work" — was wording stacked in front of the thing itself. */}
          {type && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {e.r.options.map((o) => (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1.5 py-1 rounded border border-pr-red/60 bg-pr-red/10 text-white"
                >
                  {o.name}
                  <button
                    onClick={() => setOptions(e.r.options.filter((x) => x.id !== o.id).map((x) => x.id))}
                    title={`Stop recommending the ${o.name}`}
                    className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* Recommending nothing is a real answer — any model of the type
                  works — but it has to say so, or the line looks unfinished. */}
              {e.r.options.length === 0 && (
                <span className="text-[11px] text-zinc-600">Any {e.r.name.toLowerCase()} works</span>
              )}
              <button
                onClick={() => setEditingOptions(editingOptions === e.id ? null : e.id)}
                title={e.r.options.length === 0 ? 'Recommend a specific model' : 'Recommend another model'}
                className={`inline-flex items-center justify-center w-6 h-6 rounded border text-sm leading-none transition-colors ${
                  editingOptions === e.id
                    ? 'border-zinc-500 text-white bg-zinc-800'
                    : 'border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500'
                }`}
              >
                +
              </button>
            </div>
          )}
          {(e.r.info || e.r.recommended) && (
            <p className="text-[11px] text-zinc-600 mt-1">
              {e.r.info}
              {e.r.info && e.r.recommended && ' — '}
              {e.r.recommended && <span className="text-zinc-500">{e.r.recommended}</span>}
            </p>
          )}
        </div>
        <input
          defaultValue={e.quantity ?? ''}
          onBlur={(ev) => {
            const v = ev.target.value
            if (v === (e.quantity ?? '')) return
            apply(
              (es) => es.map((x) => (x.id === e.id ? { ...x, quantity: v.trim() || null } : x)),
              () => updateGearEntry(e.id, { quantity: v }, instanceId)
            )
          }}
          placeholder="qty"
          className={`w-16 shrink-0 ${input}`}
        />
        <button
          onClick={() => apply(
            (es) => es.filter((x) => x.id !== e.id),
            () => removeGearEntry(e.id, instanceId)
          )}
          className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          ×
        </button>
      </div>

      {/* The panel only ever adds. Taking a recommendation back is the × on
          the chip itself, where the thing being removed is.

          The library not having the product yet is the ordinary case the first
          time anyone recommends something, so naming it here adds it to the
          catalog and recommends it in one go — otherwise the + is a dead end
          on exactly the row where you had a product in mind. */}
      {editingOptions === e.id && type && (() => {
        const rest = e.r.models.filter((m) => !e.r.options.some((o) => o.id === m.id))
        // This one waits: the chip can't be drawn from a catalog that doesn't
        // have the product in it yet.
        const addNew = () => run(async () => {
          const { id } = await upsertGearItem({
            name: newModel, category: type.category, parentId: type.id,
          })
          await setGearEntryOptions(e.id, [...e.r.options.map((o) => o.id), id], instanceId)
          setNewModel('')
        })
        return (
          <div className="mt-2 p-2 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <p className="text-[11px] text-zinc-500">
              {e.r.models.length === 0
                ? `The library has no models of ${type.name.toLowerCase()} yet. Name the product you recommend.`
                : rest.length > 0
                  ? 'Recommend a model. Recommend none and any one of them is fine.'
                  : 'Every model in the library is already recommended. Add another product below.'}
            </p>
            {rest.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rest.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setOptions([...e.r.options.map((o) => o.id), m.id])}
                    className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
                  >
                    + {m.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                value={newModel}
                onChange={(ev) => setNewModel(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && newModel.trim()) addNew() }}
                placeholder={`New ${type.name.toLowerCase()} — e.g. Petzl RollClip`}
                className={`flex-1 min-w-0 ${input}`}
              />
              <button
                onClick={addNew}
                disabled={busy || !newModel.trim()}
                title="Adds it to the gear library and recommends it here"
                className="shrink-0 text-xs px-2 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
              >
                Add to library
              </button>
            </div>
          </div>
        )
      })()}
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
//
// It opens inside the section it fills, so there is nothing to choose about
// where an item lands and the panel stays open across adds — filling a section
// means adding six things to it, not confirming the destination six times.
function AddGear({
  listId, section, groupType, catalog, childrenOf, addEntry, onClose, busy, run, input,
}: {
  listId: string
  section: string | null
  groupType: GroupType
  catalog: GearItem[]
  childrenOf: Map<string, GearItem[]>
  addEntry: (input: { gearItemId?: string | null; name?: string; section: string | null; groupType: GroupType }) => void
  onClose: () => void
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState<string>(GEAR_CATEGORIES[0])
  const [newParent, setNewParent] = useState('')

  // Escape closes the panel — the search box has focus the moment it opens, so
  // that is where the hand already is.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
    addEntry({ gearItemId: itemId, name, groupType, section })
    setQuery('')
  }

  return (
    <div className="p-3 bg-zinc-900 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={section
            ? `Search the catalog — adding to ${section}`
            : `Search the catalog — adding to ${groupType === 'personal' ? 'personal' : 'group'} kit`}
          className={`flex-1 min-w-0 ${input}`}
        />
        {/* Searching the catalog is where you find out it's wrong — a type
            named badly, a model filed under nothing, two rows for one thing.
            Fixing that is a different page, so it opens in its own tab: the
            half-built list here survives the trip. */}
        <a
          href="/admin/gear"
          target="_blank"
          rel="noreferrer"
          title="Rename, merge or retire items — opens in a new tab"
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/60 transition-colors"
        >
          Catalog
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7" />
          </svg>
        </a>
        {/* The panel stays open across adds, so closing it is a deliberate act
            and needs to look like one — a bare word beside a full-width search
            box read as a label, not a control. Escape closes it too. */}
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded border border-zinc-700 text-xs text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/60 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Done
        </button>
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
                  await addGearEntry(listId, { gearItemId: id, groupType, section })
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
