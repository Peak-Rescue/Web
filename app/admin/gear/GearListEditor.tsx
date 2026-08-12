'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import { GEAR_CATEGORIES, matchesGear, placeChoices, productName, unwrap, type CatalogItem } from '@/lib/gear'
import {
  addGearEntry, updateGearEntry, removeGearEntry, updateGearList, copyGearList,
  saveGearListIntoTemplate, setGearEntryOptions, upsertGearItem, renameGearSection,
  removeGearSection, ungroupGearSection, moveGearEntry,
  renameGearChoice, ungroupGearChoice, removeGearChoiceBranch,
} from './actions'

export type GearTemplateOption = { id: string; name: string; audience: string; entries: number }

export type GearItem = CatalogItem

export type GearEntry = {
  id: string
  gear_item_id: string | null
  name: string | null
  // What this course wants to say about the item — spec, quantity, condition.
  // It lives here rather than in the catalog because it is an answer to "on
  // this course", and the catalog doesn't know which course is asking.
  note: string | null
  url: string | null
  // The heading this row prints under on the student's list. Free text, named
  // per list — not the catalog's category, which is how instructors find gear.
  section: string | null
  group_type: 'personal' | 'group'
  quantity: string | null
  sort_order: number
  // "Bring one of these". The name groups the alternatives; the branch says
  // which alternative this row is part of, so two rows sharing both are one
  // alternative made of two things. Null on both for ordinary required gear,
  // which is nearly all of it.
  option_group: string | null
  option_branch: number | null
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

// Everywhere a row can land: a side of the list, a heading under it, and — for
// gear inside a choice — which alternative. Both choice fields null is the
// plain run of gear outside every choice, which is where most rows live.
type Target = { gt: GroupType; section: string | null; choice: string | null; branch: number | null }

const sameTarget = (a: Target, b: Target) =>
  a.gt === b.gt && a.section === b.section && a.choice === b.choice && a.branch === b.branch

// One identity for a drop zone, so a gap in one alternative can't be confused
// with the gap at the same index in the one below it.
const zoneKey = (t: Target, beforeId: string | 'end') =>
  `${t.gt}|${t.section ?? ''}|${t.choice ?? ''}|${t.branch ?? ''}|${beforeId}`

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
  // Rows are drawn here first and the server is caught up afterwards, so the
  // catching up waits until the clicking stops and holds the page still while
  // it lands. Refreshing on every click walked the page away mid-edit.
  const refresh = useSteadyRefresh()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingOptions, setEditingOptions] = useState<string | null>(null)
  // Which section's add panel is open, as "personal:Ropes". One at a time —
  // two open panels and it stops being obvious where the next item lands.
  const [adding, setAdding] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // Which gap the dragged row would land in, as one key for the whole list.
  // Held here rather than per card because an alternative sits inside a
  // section: two containers each tracking their own hover both drew a landing
  // line, and only one of them was where the row was going.
  const [over, setOver] = useState<string | null>(null)
  // Sections named but not yet filled. A heading with no rows has nowhere to
  // live in the database, so it lives here until the first item lands in it.
  const [drafts, setDrafts] = useState<{ key: GroupType; name: string }[]>([])
  // The same problem one level in: a choice, and each alternative inside it,
  // exist only as the agreement between their rows. A choice you have just
  // named and an alternative you have just opened both hold nothing yet, so
  // they live here until something lands in them.
  const [choiceDrafts, setChoiceDrafts] = useState<
    { gt: GroupType; section: string | null; name: string; branches: number[] }[]
  >([])
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
      .then(() => refresh())
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
      name: e.name ?? (c ? productName(c) : null) ?? 'Item',
      note: e.note,
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
    // An action that hands back a message is reporting something fixable,
    // not succeeding quietly — the catch below is where it belongs.
    try { unwrap((await fn() ?? {}) as object); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save'); setPending(null) }
    finally { setBusy(false) }
  }

  // Dropping is always expressed as "this row goes immediately before that
  // one", with the end of a section standing in for "after everything in it".
  // An empty section has nothing to sit before, so the row goes to the end.
  function drop(t: Target, beforeId: string | null) {
    if (!drag) return
    const dragged = ordered.find((e) => e.id === drag.id)
    setDrag(null)
    if (!dragged) return
    const from: Target = {
      gt: dragged.group_type, section: dragged.r.section,
      choice: dragged.option_group, branch: dragged.option_branch,
    }
    if (sameTarget(from, t) && beforeId === drag.id) return

    const rest = ordered.filter((e) => e.id !== drag.id)
    const inTarget = (e: (typeof rest)[number]) =>
      e.group_type === t.gt && e.r.section === t.section &&
      e.option_group === t.choice && e.option_branch === t.branch

    let at: number
    if (beforeId) {
      at = rest.findIndex((e) => e.id === beforeId)
      if (at < 0) at = rest.length
    } else {
      // Last row of the zone it was dropped into, so it lands under the gear
      // already there rather than at the bottom of the whole list.
      let last = -1
      rest.forEach((e, i) => { if (inTarget(e)) last = i })
      at = last < 0 ? rest.length : last + 1
    }

    const moved = {
      ...dragged, group_type: t.gt, section: t.section,
      option_group: t.choice, option_branch: t.branch,
    }
    const next = [...rest.slice(0, at), moved, ...rest.slice(at)]
      .map(({ r: _r, ...e }, i) => ({ ...e, sort_order: i })) // eslint-disable-line @typescript-eslint/no-unused-vars
    apply(() => next, () => moveGearEntry(list.id, drag.id, {
      section: t.section, groupType: t.gt, orderedIds: next.map((e) => e.id),
      optionGroup: t.choice, optionBranch: t.branch,
      instanceId: list.instance_id,
    }))
  }

  // The added row is drawn from what the catalog already says about the item,
  // under an id the server hasn't issued yet. It is replaced wholesale by the
  // real one when the page catches up.
  function addEntry(input: { gearItemId?: string | null; name?: string; target: Target }) {
    const { target } = input
    const sortOrder = entries.reduce((m, e) => Math.max(m, e.sort_order), -1) + 1
    const temp: GearEntry = {
      id: `pending-${sortOrder}-${input.gearItemId ?? input.name ?? ''}`,
      gear_item_id: input.gearItemId ?? null,
      name: input.gearItemId ? null : input.name?.trim() || null,
      note: null, url: null,
      section: target.section, group_type: target.gt, quantity: null,
      option_group: target.choice, option_branch: target.branch,
      sort_order: sortOrder, gear_entry_options: [],
    }
    apply((es) => [...es, temp], () => addGearEntry(list.id, {
      gearItemId: input.gearItemId, name: input.name,
      section: target.section, groupType: target.gt,
      optionGroup: target.choice, optionBranch: target.branch,
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
        const shared = {
          listId: list.id, catalog, childrenOf,
          adding, setAdding, editingOptions, setEditingOptions,
          drag, setDrag, over, setOver, onDrop: drop, apply, addEntry,
          instanceId: list.instance_id, busy, run, input,
          choiceDrafts, setChoiceDrafts,
        }
        return (
          <div key={gt}>
            <h4 className="text-[11px] font-medium text-zinc-600 uppercase tracking-widest mb-2">
              {GROUP_LABEL[gt]}
            </h4>

            <div className="space-y-3">
              {/* Gear that needs no heading is still the common case, so adding
                  it can't be behind naming a section first. But an empty card
                  is a container for nothing — once a list has real sections it
                  reads as a section someone forgot to name. So the card appears
                  when it holds something, or while something is being put in
                  it, and is a plain line the rest of the time. */}
              {loose.length > 0 || adding === zoneKey({ gt, section: null, choice: null, branch: null }, 'end') ? (
                <SectionCard key={`${gt}:loose`} {...shared} groupType={gt} name={null} rows={loose} />
              ) : (
                <button
                  onClick={() => setAdding(zoneKey({ gt, section: null, choice: null, branch: null }, 'end'))}
                  className="text-xs text-zinc-600 hover:text-white transition-colors py-1"
                >
                  + Add gear
                </button>
              )}

              {real.map((s) => (
                <SectionCard key={`${gt}:${s.name}`} {...shared} groupType={gt} name={s.name} rows={s.rows} />
              ))}

              {draft.map((d) => (
                <SectionCard
                  key={`draft:${gt}:${d.name}`} {...shared}
                  groupType={gt} name={d.name} rows={[]} isDraft
                  onDiscard={() => setDrafts((xs) => xs.filter((x) => !(x.key === gt && x.name === d.name)))}
                  onRename={(next) => setDrafts((xs) => xs.map((x) =>
                    x.key === gt && x.name === d.name ? { ...x, name: next } : x
                  ))}
                />
              ))}

              <button
                onClick={() => {
                  const named = prompt('Name the new section — this is the heading students read:')?.trim()
                  if (!named) return
                  const zone = zoneKey({ gt, section: named, choice: null, branch: null }, 'end')
                  if (real.some((s) => s.name === named) || draft.some((d) => d.name === named)) {
                    return setAdding(zone)
                  }
                  setDrafts((xs) => [...xs, { key: gt, name: named }])
                  setAdding(zone)
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

type ResolvedRow = GearEntry & {
  r: {
    name: string; note: string | null; url: string | null; section: string | null
    catalogItem?: GearItem; options: GearItem[]; models: GearItem[]
  }
}

type ChoiceDraft = { gt: GroupType; section: string | null; name: string; branches: number[] }

// What every container on the list needs to do its job. Passed down whole
// rather than named field by field at four call sites, which is how the two
// that already existed drifted apart.
type Shared = {
  listId: string
  catalog: GearItem[]
  childrenOf: Map<string, GearItem[]>
  // One add panel open at a time, identified by the zone it would add to.
  adding: string | null
  setAdding: (key: string | null) => void
  editingOptions: string | null
  setEditingOptions: (id: string | null) => void
  drag: Drag | null
  setDrag: (d: Drag | null) => void
  over: string | null
  setOver: (key: string | null) => void
  onDrop: (target: Target, beforeId: string | null) => void
  apply: (optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) => void
  addEntry: (input: { gearItemId?: string | null; name?: string; target: Target }) => void
  instanceId: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  choiceDrafts: ChoiceDraft[]
  setChoiceDrafts: (fn: (xs: ChoiceDraft[]) => ChoiceDraft[]) => void
}

// The handlers that make one gap a drop zone. A row's own gap has to win over
// the container's catch-all, so the line is drawn where the row would land
// rather than always at the end of whatever holds it.
function gapProps(s: {
  target: Target; beforeId: string | 'end'; dragging: boolean
  over: string | null; setOver: (k: string | null) => void
  onDrop: (t: Target, beforeId: string | null) => void
}) {
  const key = zoneKey(s.target, s.beforeId)
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!s.dragging) return
      e.preventDefault(); e.stopPropagation()
      s.setOver(key)
    },
    onDragLeave: () => { if (s.over === key) s.setOver(null) },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      s.setOver(null)
      s.onDrop(s.target, s.beforeId === 'end' ? null : s.beforeId)
    },
  }
}

// One heading and what sits under it. The header bar is the point: the section
// name is the thing you scan for and the thing you rename, so it outranks
// everything else in the card and reads as a field rather than a caption.
//
// A null name is the gear filed under no heading, which is most of it. That
// card has no header — there is nothing to name, rename or delete — but it
// takes drops and adds like any other.
//
// Under the heading sit two kinds of thing: gear that is simply required, and
// choices. A choice is its own block because "bring one of these" is a claim
// about several rows at once, and there is nowhere to write that on a row.
function SectionCard({
  groupType, name, rows, isDraft, onDiscard, onRename, ...s
}: Shared & {
  groupType: GroupType
  name: string | null
  rows: ResolvedRow[]
  isDraft?: boolean
  onDiscard?: () => void
  onRename?: (next: string) => void
}) {
  const dragging = s.drag !== null
  const loose: Target = { gt: groupType, section: name, choice: null, branch: null }

  // A drag abandoned outside any card would otherwise leave its landing line
  // drawn across a container nothing is being dropped into.
  useEffect(() => { if (!dragging) s.setOver(null) }, [dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const placed = useMemo(() => placeChoices(rows), [rows])
  const realChoices = new Set(
    placed.filter((p) => p.kind === 'choice').map((p) => (p as { name: string }).name)
  )
  // A choice the first item has already landed in is a real choice now.
  const drafts = s.choiceDrafts.filter(
    (d) => d.gt === groupType && d.section === name && !realChoices.has(d.name)
  )

  const gap = (beforeId: string | 'end') =>
    gapProps({ target: loose, beforeId, dragging, over: s.over, setOver: s.setOver, onDrop: s.onDrop })

  const addKey = zoneKey(loose, 'end')

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        dragging && s.over?.startsWith(`${groupType}|${name ?? ''}|`) ? 'border-pr-red/70' : 'border-zinc-800'
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
              s.run(() => renameGearSection(s.listId, groupType, name, next))
            }}
            aria-label="Section heading"
            className="min-w-0 flex-1 text-sm font-semibold text-white bg-transparent rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
          />
          <span className="shrink-0 text-[11px] text-zinc-500">
            {isDraft ? 'empty' : `${rows.length} item${rows.length === 1 ? '' : 's'}`}
          </span>
          {!isDraft && rows.length > 0 && (
            <button
              onClick={() => s.run(() => ungroupGearSection(s.listId, groupType, name))}
              disabled={s.busy}
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
              s.run(() => removeGearSection(s.listId, groupType, name))
            }}
            disabled={s.busy}
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
        {placed.map((p) =>
          p.kind === 'item' ? (
            <Row
              key={p.row.id} e={p.row}
              editingOptions={s.editingOptions} setEditingOptions={s.setEditingOptions}
              dragging={dragging} isOver={s.over === zoneKey(loose, p.row.id)}
              onDragStart={() => s.setDrag({ id: p.row.id })}
              onDragEnd={() => { s.setDrag(null); s.setOver(null) }}
              gap={gap(p.row.id)}
              apply={s.apply} instanceId={s.instanceId}
              busy={s.busy} run={s.run} input={s.input}
            />
          ) : (
            <ChoiceCard
              key={`choice:${p.name}`} {...s}
              groupType={groupType} section={name} choiceName={p.name}
              options={p.options}
              draftBranches={
                (s.choiceDrafts.find((d) => d.gt === groupType && d.section === name && d.name === p.name)?.branches ?? [])
                  .filter((b) => !p.options.some((o) => o.branch === b))
              }
            />
          )
        )}

        {drafts.map((d) => (
          <ChoiceCard
            key={`draft-choice:${d.name}`} {...s}
            groupType={groupType} section={name} choiceName={d.name}
            options={[]} draftBranches={d.branches} isDraft
          />
        ))}
      </div>

      <div className={rows.length > 0 || drafts.length > 0 ? 'border-t border-zinc-800/70' : ''}>
        {s.adding === addKey ? (
          <AddGear
            listId={s.listId} target={loose}
            catalog={s.catalog} childrenOf={s.childrenOf} addEntry={s.addEntry}
            onClose={() => s.setAdding(null)}
            busy={s.busy} run={s.run} input={s.input}
          />
        ) : (
          <div className="flex items-center">
            <button
              onClick={() => s.setAdding(addKey)}
              className="flex-1 text-left px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800/40 transition-colors"
            >
              + Add gear{name ? ` to ${name}` : ''}
            </button>
            {/* Kept quiet next to "add gear": a choice is the rarer thing to
                want, and a list is mostly rows that are simply required. */}
            <button
              onClick={() => {
                const named = prompt(
                  'Name the choice — students read this as the heading over the alternatives:',
                  'Exposure protection'
                )?.trim()
                if (!named) return
                const existing = s.choiceDrafts.some(
                  (d) => d.gt === groupType && d.section === name && d.name === named
                )
                if (!existing && !realChoices.has(named)) {
                  // Two empty alternatives, because one alternative is not a
                  // choice and you would only have to add the second anyway.
                  s.setChoiceDrafts((xs) => [...xs, { gt: groupType, section: name, name: named, branches: [0, 1] }])
                }
                s.setAdding(zoneKey({ gt: groupType, section: name, choice: named, branch: 0 }, 'end'))
              }}
              title="A set of alternatives — bring one of them"
              className="shrink-0 px-3 py-2 text-xs text-zinc-600 hover:text-white transition-colors"
            >
              + Choice
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// "Bring one of these", where each alternative can be more than one item.
//
// The alternatives are the structure, so they are drawn as the structure:
// separate blocks with a word between them, rather than rows carrying a note
// that explains their relationship to rows above and below. That prose version
// is what this replaces — three notes each describing the other two, and a
// student skimming past all of it seeing three rows that look required.
function ChoiceCard({
  groupType, section, choiceName, options, draftBranches, isDraft, ...s
}: Shared & {
  groupType: GroupType
  section: string | null
  choiceName: string
  options: { branch: number; rows: ResolvedRow[] }[]
  // Alternatives opened but not yet filled. Same problem as a named section
  // with no rows: nowhere in the database to be until something lands.
  draftBranches: number[]
  isDraft?: boolean
}) {
  const dragging = s.drag !== null
  const scope = { listId: s.listId, groupType, section, name: choiceName }

  // Real and empty alternatives shown as one run, in branch order, so an
  // alternative you just opened appears where it will stay.
  const shown = [
    ...options.map((o) => ({ branch: o.branch, rows: o.rows })),
    ...draftBranches.map((branch) => ({ branch, rows: [] as ResolvedRow[] })),
  ].sort((a, b) => a.branch - b.branch)

  const discardDraftBranch = (branch: number) =>
    s.setChoiceDrafts((xs) =>
      xs
        .map((d) =>
          d.gt === groupType && d.section === section && d.name === choiceName
            ? { ...d, branches: d.branches.filter((b) => b !== branch) }
            : d
        )
        .filter((d) => d.branches.length > 0 || options.length > 0)
    )

  return (
    <div className="px-3 py-2.5">
      <div className="border border-zinc-700/70 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/40 border-b border-zinc-800">
          <span className="shrink-0 text-[10px] uppercase tracking-widest text-pr-red font-medium">Bring one of</span>
          <input
            defaultValue={choiceName}
            key={choiceName}
            onBlur={(ev) => {
              const next = ev.target.value.trim()
              if (!next || next === choiceName) { ev.target.value = choiceName; return }
              if (isDraft) {
                return s.setChoiceDrafts((xs) => xs.map((d) =>
                  d.gt === groupType && d.section === section && d.name === choiceName
                    ? { ...d, name: next } : d
                ))
              }
              s.run(() => renameGearChoice(scope, next))
            }}
            aria-label="Choice heading"
            className="min-w-0 flex-1 text-xs font-semibold text-white bg-transparent rounded px-1.5 py-0.5 border border-transparent hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
          />
          {options.length > 0 && (
            <button
              onClick={() => {
                if (!confirm(
                  `Stop offering these as alternatives? The gear stays on the list, but every item becomes required.`
                )) return
                s.run(() => ungroupGearChoice(scope))
              }}
              disabled={s.busy}
              title="Keep the gear, drop the choice — every item becomes required"
              className="shrink-0 text-[11px] text-zinc-600 hover:text-white transition-colors disabled:opacity-40"
            >
              ungroup
            </button>
          )}
          {isDraft && (
            <button
              onClick={() => s.setChoiceDrafts((xs) => xs.filter(
                (d) => !(d.gt === groupType && d.section === section && d.name === choiceName)
              ))}
              title="Discard this choice"
              className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {shown.map((o, i) => {
          const target: Target = { gt: groupType, section, choice: choiceName, branch: o.branch }
          const gap = (beforeId: string | 'end') =>
            gapProps({ target, beforeId, dragging, over: s.over, setOver: s.setOver, onDrop: s.onDrop })
          const addKey = zoneKey(target, 'end')
          const empty = o.rows.length === 0
          return (
            <div
              key={o.branch}
              {...gap('end')}
              // Keeping the trailing separator matters: without it, branch 1
              // would claim every gap in branch 11.
              className={`${i > 0 ? 'border-t border-zinc-800' : ''} ${
                dragging && s.over?.startsWith(zoneKey(target, '')) ? 'bg-pr-red/5' : ''
              }`}
            >
              <div className="flex items-center gap-2 px-2.5 pt-1.5">
                {/* Position, not a stored label: delete the first alternative
                    and the second has to become the one you read first. */}
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                  {i === 0 ? 'Either' : 'Or'}
                </span>
                <span className="flex-1 h-px bg-zinc-800/70" />
                {shown.length > 2 || empty ? (
                  <button
                    onClick={() => {
                      if (empty) return discardDraftBranch(o.branch)
                      if (!confirm(`Drop this alternative and the ${o.rows.length} item${o.rows.length === 1 ? '' : 's'} in it?`)) return
                      s.run(() => removeGearChoiceBranch(scope, o.branch))
                    }}
                    disabled={s.busy}
                    title={empty ? 'Discard this alternative' : 'Delete this alternative and its gear'}
                    className="shrink-0 text-[11px] text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              {empty ? (
                <p className="px-2.5 py-1 text-[11px] text-zinc-600">
                  Nothing in here yet — add the gear this alternative needs.
                </p>
              ) : (
                <div className="divide-y divide-zinc-800/70">
                  {o.rows.map((e) => (
                    <Row
                      key={e.id} e={e}
                      editingOptions={s.editingOptions} setEditingOptions={s.setEditingOptions}
                      dragging={dragging} isOver={s.over === zoneKey(target, e.id)}
                      onDragStart={() => s.setDrag({ id: e.id })}
                      onDragEnd={() => { s.setDrag(null); s.setOver(null) }}
                      gap={gap(e.id)}
                      apply={s.apply} instanceId={s.instanceId}
                      busy={s.busy} run={s.run} input={s.input}
                    />
                  ))}
                </div>
              )}

              {s.adding === addKey ? (
                <AddGear
                  listId={s.listId} target={target}
                  catalog={s.catalog} childrenOf={s.childrenOf} addEntry={s.addEntry}
                  onClose={() => s.setAdding(null)}
                  busy={s.busy} run={s.run} input={s.input}
                />
              ) : (
                <button
                  onClick={() => s.setAdding(addKey)}
                  className="w-full text-left px-2.5 py-1.5 text-[11px] text-zinc-600 hover:text-white hover:bg-zinc-800/40 transition-colors"
                >
                  + Add gear to this alternative
                </button>
              )}
            </div>
          )
        })}

        <button
          onClick={() => {
            const next = Math.max(-1, ...shown.map((o) => o.branch)) + 1
            s.setChoiceDrafts((xs) => {
              const found = xs.find((d) => d.gt === groupType && d.section === section && d.name === choiceName)
              if (found) {
                return xs.map((d) => (d === found ? { ...d, branches: [...d.branches, next] } : d))
              }
              return [...xs, { gt: groupType, section, name: choiceName, branches: [next] }]
            })
            s.setAdding(zoneKey({ gt: groupType, section, choice: choiceName, branch: next }, 'end'))
          }}
          className="w-full border-t border-zinc-800 py-1.5 text-[11px] text-zinc-600 hover:text-white hover:bg-zinc-800/40 transition-colors"
        >
          + Another alternative
        </button>
      </div>
    </div>
  )
}

function Row({
  e, editingOptions, setEditingOptions, dragging, isOver,
  onDragStart, onDragEnd, gap, apply, instanceId, busy, run, input,
}: {
  e: GearEntry & { r: { name: string; note: string | null; url: string | null; section: string | null; catalogItem?: GearItem; options: GearItem[]; models: GearItem[] } }
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
  // Brand is its own column in the catalog now, so it has to be its own
  // field here — typed into the name it would rebuild the very drift the
  // split undid ("BD" and "Black Diamond" as two makers).
  const [newBrand, setNewBrand] = useState('')

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
            {/* No "× 1" beside the name: the quantity field on the right of
                this row already holds it, and the same number in two places is
                two things to keep in step for no gain. */}
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
                  {productName(o)}
                  <button
                    onClick={() => setOptions(e.r.options.filter((x) => x.id !== o.id).map((x) => x.id))}
                    title={`Stop recommending the ${productName(o)}`}
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
          {/* The note is written here, on the course, and nowhere else. It
              reads as the line it prints on the student's list until you put
              the cursor in it — a box under every row would turn the list into
              a form, and most rows need nothing said about them. */}
          <input
            defaultValue={e.r.note ?? ''}
            onBlur={(ev) => {
              const v = ev.target.value
              if (v === (e.r.note ?? '')) return
              apply(
                (es) => es.map((x) => (x.id === e.id ? { ...x, note: v.trim() || null } : x)),
                () => updateGearEntry(e.id, { note: v }, instanceId)
              )
            }}
            placeholder="Add a note for this course"
            className="mt-1 w-full bg-transparent border border-transparent rounded px-1 py-0.5 text-[11px] text-zinc-500 placeholder:text-zinc-800 hover:border-zinc-800 focus:border-zinc-600 focus:bg-zinc-900 focus:text-zinc-300 focus:outline-none transition-colors"
          />
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

          The catalog not having the product yet is the ordinary case the first
          time anyone recommends something, so naming it here adds it to the
          catalog and recommends it in one go — otherwise the + is a dead end
          on exactly the row where you had a product in mind. */}
      {editingOptions === e.id && type && (() => {
        const rest = e.r.models.filter((m) => !e.r.options.some((o) => o.id === m.id))
        // This one waits: the chip can't be drawn from a catalog that doesn't
        // have the product in it yet.
        const addNew = () => run(async () => {
          const { id } = unwrap(await upsertGearItem({
            name: newModel, brand: newBrand.trim() || null, category: type.category, parentId: type.id,
          }))
          await setGearEntryOptions(e.id, [...e.r.options.map((o) => o.id), id], instanceId)
          setNewModel(''); setNewBrand('')
        })
        return (
          <div className="mt-2 p-2 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <p className="text-[11px] text-zinc-500">
              {e.r.models.length === 0
                ? `The catalog has no products of ${type.name.toLowerCase()} yet. Name the one you recommend.`
                : rest.length > 0
                  ? 'Recommend a product. Recommend none and any one of them is fine.'
                  : 'Every product in the catalog is already recommended. Add another below.'}
            </p>
            {rest.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rest.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setOptions([...e.r.options.map((o) => o.id), m.id])}
                    className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
                  >
                    + {productName(m)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                value={newModel}
                onChange={(ev) => setNewModel(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && newModel.trim()) addNew() }}
                placeholder={`New ${type.name.toLowerCase()} — e.g. RollClip`}
                className={`flex-1 min-w-0 ${input}`}
              />
              <input
                value={newBrand}
                onChange={(ev) => setNewBrand(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && newModel.trim()) addNew() }}
                placeholder="Brand — e.g. Petzl"
                className={`w-36 shrink-0 ${input}`}
              />
              <button
                onClick={addNew}
                disabled={busy || !newModel.trim()}
                title="Adds it to the gear catalog and recommends it here"
                className="shrink-0 text-xs px-2 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40"
              >
                Add to gear catalog
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
  listId, target, catalog, childrenOf, addEntry, onClose, busy, run, input,
}: {
  listId: string
  // Where what's added lands. The panel opens inside that zone, so this is
  // never a question put to the person using it.
  target: Target
  catalog: GearItem[]
  childrenOf: Map<string, GearItem[]>
  addEntry: (input: { gearItemId?: string | null; name?: string; target: Target }) => void
  onClose: () => void
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState<string>(GEAR_CATEGORIES[0])
  const [newParent, setNewParent] = useState('')
  // Only a product has a maker, so this is asked for only once one is
  // being made — a brand on a type is a question with no answer.
  const [newItemBrand, setNewItemBrand] = useState('')

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
  //
  // Read off the catalog, not off GEAR_CATEGORIES, because the seed list is a
  // starting vocabulary and the catalog page lets you rename a category or
  // invent one. Filtering the seed list instead meant a renamed category held
  // nothing as far as this panel knew, and everything under it — the wetsuit,
  // the drysuit, the litter — could only be reached by typing its name. Seed
  // order first so the familiar ones stay put, then whatever has been added.
  const categories = useMemo(() => {
    const used = new Set(types.map((t) => t.category?.trim()).filter(Boolean) as string[])
    return [
      ...GEAR_CATEGORIES.filter((c) => used.has(c)),
      ...[...used].filter((c) => !GEAR_CATEGORIES.includes(c as never)).sort(),
    ]
  }, [types])

  // Filing a new item is the other direction: every category is on offer, empty
  // or not, plus any the catalog has invented since. Offering only the seed list
  // here made a renamed category unfileable from this panel — the one place
  // you'd be standing when you noticed something belonged in it.
  const allCategories = useMemo(
    () => [...GEAR_CATEGORIES, ...categories.filter((c) => !GEAR_CATEGORIES.includes(c as never))],
    [categories]
  )

  // The types the category being filed under actually holds — what a new model
  // can be a model of. See the panel below.
  const typesHere = useMemo(() => types.filter((t) => t.category === newCategory), [types, newCategory])

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
    addEntry({ gearItemId: itemId, name, target })
    setQuery('')
  }

  return (
    <div className="p-3 bg-zinc-900 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            target.choice
              ? `Search the catalog — adding to one alternative of ${target.choice}`
              : target.section
                ? `Search the catalog — adding to ${target.section}`
                : `Search the catalog — adding to ${target.gt === 'personal' ? 'personal' : 'group'} kit`
          }
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
                {models.length > 0 && (
                  <span className="block text-[11px] text-zinc-600 mt-0.5">
                    any of: {models.map((m) => productName(m)).join(' · ')}
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
                      title={`Add just the ${productName(m)}`}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
                    >
                      {productName(m)}
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
              {/* Category first, because it decides which types are on offer:
                  every type in the catalog under every category was a list
                  that never changed and so never said which of them fitted. */}
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => { setNewCategory(e.target.value); setNewParent('') }}
                  className={`${input} w-44`}
                >
                  {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Generic item</label>
                <select
                  value={newParent}
                  onChange={(e) => setNewParent(e.target.value)}
                  disabled={typesHere.length === 0}
                  className={`${input} w-44 disabled:opacity-40`}
                >
                  <option value="">{typesHere.length === 0 ? '— nothing here yet —' : '— none, this is a generic item —'}</option>
                  {typesHere.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {newParent && (
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Brand</label>
                  <input
                    value={newItemBrand}
                    onChange={(e) => setNewItemBrand(e.target.value)}
                    placeholder="e.g. Petzl"
                    className={`${input} w-36`}
                  />
                </div>
              )}
              <button
                onClick={() => run(async () => {
                  const { id } = unwrap(await upsertGearItem({
                    name: query,
                    brand: newParent ? newItemBrand.trim() || null : null,
                    category: newCategory,
                    parentId: newParent || null,
                  }))
                  await addGearEntry(listId, {
                    gearItemId: id, groupType: target.gt, section: target.section,
                    optionGroup: target.choice, optionBranch: target.branch,
                  })
                  setQuery(''); setNewParent(''); setNewItemBrand('')
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
