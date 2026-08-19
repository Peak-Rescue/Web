'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import CategorySelect, { NEW_TYPE } from './CategorySelect'
import PdfLink from '@/components/PdfLink'
import {
  GEAR_CATEGORIES, gearQuantity, isChoice, matchesGear, placeSets, productName, unwrap,
  type CatalogItem, type Joiner,
} from '@/lib/gear'
import {
  addGearEntry, updateGearEntry, removeGearEntry, updateGearList, copyGearList,
  saveGearListIntoTemplate, setGearEntryOptions, upsertGearItem, renameGearSection,
  removeGearSection, ungroupGearSection, moveGearEntry, setGearJoiner,
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
  // How many, as typed. On a row that counts by students this is a number
  // written over the rule for this course, and clearing it hands the row back.
  quantity: string | null
  // How many per unit of students, and how many students one unit covers. One
  // each is 1 and 1; one between four is 1 and 4; no rule at all is null, and
  // the row is however many `quantity` says.
  qty_each: number | null
  qty_per_students: number | null
  sort_order: number
  // How this row is joined to the row above it: "and" for things that go
  // together, "or" for alternatives, "or_if_needed" for one that is acceptable
  // rather than equal. Null is an ordinary required row, which is nearly all of
  // them — and a joiner on the first row of a section refers to nothing above
  // it, so it simply doesn't apply.
  joined_above: Joiner | null
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

// Everywhere a row can land: a side of the list and a heading under it. There
// is nowhere else — a set is not a place, it is a relationship between rows
// that are already next to each other.
type Target = { gt: GroupType; section: string | null }

const sameTarget = (a: Target, b: Target) => a.gt === b.gt && a.section === b.section

// One identity per gap on the list.
const zoneKey = (t: Target, beforeId: string | 'end') =>
  `${t.gt}|${t.section ?? ''}|${beforeId}`

const GROUP_LABEL: Record<GroupType, string> = {
  personal: 'Personal — each person',
  group: 'Group — shared kit',
}

// A row picked up and not yet dropped.
type Drag = { id: string }

// Which row has its model picker open. One question — which models count as
// this item — so no mode: the row-making buttons that used to sit beside it
// said "and" and "or" while meaning something other than the operators between
// rows, one line away from them.
type ProductPanel = { id: string }

const PAIR_BTN =
  'text-[11px] px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-600 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-40'

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
  students,
}: {
  list: GearList
  catalog: GearItem[]
  courseType?: string | null
  // The course's maximum number of students, from the Details tab. Quantities
  // that count by students are worked out from it here rather than stored, so
  // changing it there carries every one of them with it. A template has no
  // course and so no number: its rows show the rule instead of a total.
  students?: number | null
  // The gear shelf's templates, so a list refined on a course can be saved
  // back over the one it started from instead of only spawning another.
  templates?: GearTemplateOption[]
}) {
  // Rows are drawn here first and the server is caught up afterwards, so the
  // catching up waits until the clicking stops and holds the page still while
  // it lands. Refreshing on every click walked the page away mid-edit.
  const refresh = useSteadyRefresh()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which row's product panel is open, and which question it is answering —
  // another product that would do instead, or another line pinned to a
  // different product.
  const [editingOptions, setEditingOptions] = useState<ProductPanel | null>(null)
  // Which section's add panel is open, as "personal:Ropes". One at a time —
  // two open panels and it stops being obvious where the next item lands.
  const [adding, setAdding] = useState<string | null>(null)
  // Which row's "how many" panel is open. One at a time, like every other panel
  // on a row.
  const [ratioFor, setRatioFor] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // A row let go on top of another row, waiting to be told what the two have to
  // do with each other. The drop is not a write on its own: "and" and "or" are
  // different lists to pack from, and a gesture must not guess between them.
  const [joining, setJoining] = useState<{ targetId: string; draggedId: string } | null>(null)
  // Which gap the dragged row would land in, as one key for the whole list.
  // Held here rather than per card because an alternative sits inside a
  // section: two containers each tracking their own hover both drew a landing
  // line, and only one of them was where the row was going.
  const [over, setOver] = useState<string | null>(null)
  // Sections named but not yet filled. A heading with no rows has nowhere to
  // live in the database, so it lives here until the first item lands in it.
  const [drafts, setDrafts] = useState<{ key: GroupType; name: string }[]>([])
  // The list as the editor has it, ahead of the server. Every write to a row
  // is drawn here first: a click has to land instantly, and the server can't
  // oblige — an add is three round trips to Supabase and then a rebuild of the
  // whole course page, which is most of a second even when nothing is wrong.
  const [pending, setPending] = useState<GearEntry[] | null>(null)
  const inflight = useRef(0)
  // A row drawn ahead of the server carries an id the server has never issued.
  // Anything done to it in the second that follows — a note, a quantity, "+ or"
  // — would name a row the database has no idea about: clicking "+ or" on an
  // item you had just added sent `pending-33-…` to Postgres, which rejected it
  // as a malformed uuid, so the row never joined the choice and the alternative
  // you then filled in became a set with one thing in it and nothing to choose
  // between. So the add's own promise is kept under the temporary id, and every
  // call that names a row waits on it first. Rows the server has already
  // answered for — nearly all of them — resolve without waiting for anything.
  const realIds = useRef(new Map<string, Promise<string>>())

  const entries = pending ?? list.gear_list_entries
  // Fresh props mean the server has caught up — unless writes are still in the
  // air, in which case the props are behind what's on screen and dropping the
  // local copy would flash rows out of existence and back.
  useEffect(() => {
    if (inflight.current > 0) return
    setPending(null)
    // Every id on screen is the server's own now, so the temporary ones have
    // nothing left to stand for.
    realIds.current.clear()
  }, [list.gear_list_entries])

  const settled = (id: string) => realIds.current.get(id) ?? Promise.resolve(id)
  // Naming a row to the server: whatever id it was drawn under, the call is
  // made with the one the row actually has.
  const onRow = <T,>(id: string, fn: (real: string) => Promise<T>): Promise<T> =>
    settled(id).then(fn)

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
    const from: Target = { gt: dragged.group_type, section: dragged.r.section }
    if (sameTarget(from, t) && beforeId === drag.id) return

    const rest = ordered.filter((e) => e.id !== drag.id)
    const inTarget = (e: (typeof rest)[number]) =>
      e.group_type === t.gt && e.r.section === t.section

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

    // The operator already in this gap becomes the dropped row's own: dropping
    // between two alternatives makes it another alternative, dropping into a
    // line makes it another part of that line, and dropping where nothing was
    // joined leaves it an ordinary requirement. The row below keeps its own
    // joiner, which now names the newcomer — which is what "join the set" means
    // and why the landing line says the word before you let go.
    const below = beforeId ? rest.find((e) => e.id === beforeId) : undefined
    const first = at === 0 || !inTarget(rest[at - 1])
    const joinedAbove = first ? null : below?.joined_above ?? null

    const moved = { ...dragged, group_type: t.gt, section: t.section, joined_above: joinedAbove }
    const next = [...rest.slice(0, at), moved, ...rest.slice(at)]
      .map(({ r: _r, ...e }, i) => ({ ...e, sort_order: i })) // eslint-disable-line @typescript-eslint/no-unused-vars
      // The row it used to sit above is joined to a neighbour that has moved
      // away, so that seam goes rather than re-pointing at whoever slides up.
      .map((e) => (e.id === orphanedSeam(dragged.id) ? { ...e, joined_above: null } : e))
    apply(() => next, async () => {
      const [moving, orderedIds] = await Promise.all([
        settled(drag.id),
        Promise.all(next.map((e) => settled(e.id))),
      ])
      return moveGearEntry(list.id, moving, {
        section: t.section, groupType: t.gt, orderedIds,
        joinedAbove, instanceId: list.instance_id,
      })
    })
  }

  // Landing a row on another row: it goes directly under the one it was dropped
  // on, joined to it by the operator just chosen. Everything else is the
  // ordinary move, seam rules included.
  function joinOnto(targetId: string, draggedId: string, joiner: Joiner) {
    setJoining(null)
    const target = ordered.find((e) => e.id === targetId)
    const dragged = ordered.find((e) => e.id === draggedId)
    if (!target || !dragged || target.id === dragged.id) return

    const rest = ordered.filter((e) => e.id !== draggedId)
    const at = rest.findIndex((e) => e.id === targetId) + 1
    const moved = {
      ...dragged,
      group_type: target.group_type,
      section: target.r.section,
      joined_above: joiner,
    }
    const orphan = orphanedSeam(draggedId)
    const next = [...rest.slice(0, at), moved, ...rest.slice(at)]
      .map(({ r: _r, ...e }, i) => ({ ...e, sort_order: i })) // eslint-disable-line @typescript-eslint/no-unused-vars
      .map((e) => (e.id === orphan ? { ...e, joined_above: null } : e))

    apply(() => next, async () => {
      const [moving, orderedIds] = await Promise.all([
        settled(draggedId),
        Promise.all(next.map((e) => settled(e.id))),
      ])
      return moveGearEntry(list.id, moving, {
        section: target.r.section, groupType: target.group_type, orderedIds,
        joinedAbove: joiner, instanceId: list.instance_id,
      })
    })
  }

  // The row that sits immediately below `id` on its own side of its own
  // section — the one whose "joined to the row above" is about to be a lie.
  function orphanedSeam(id: string): string | undefined {
    const row = ordered.find((e) => e.id === id)
    if (!row) return undefined
    const after = ordered.filter((e) =>
      e.group_type === row.group_type && e.r.section === row.r.section && e.sort_order > row.sort_order
    )
    return after[0]?.joined_above ? after[0].id : undefined
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
      // The same default the server gives it, so the number doesn't jump when
      // the page catches up: personal kit is one each, group kit counts by
      // nothing until someone says a ratio.
      qty_each: target.gt === 'personal' ? 1 : null,
      qty_per_students: target.gt === 'personal' ? 1 : null,
      // Gear arrives on its own. What it has to do with the row above it is
      // said afterwards, in the gap between them, by someone who can see both.
      joined_above: null,
      sort_order: sortOrder, gear_entry_options: [],
    }
    const settle = addGearEntry(list.id, {
      gearItemId: input.gearItemId, name: input.name,
      section: target.section, groupType: target.gt,
      sortOrder, instanceId: list.instance_id,
    }).then(({ id }) => {
      // The row on screen becomes the row in the database, so the click after
      // this one has nothing to wait for.
      setPending((es) => es && es.map((x) => (x.id === temp.id ? { ...x, id } : x)))
      return id
    })
    realIds.current.set(temp.id, settle)
    apply((es) => [...es, temp], () => settle)
  }

  // Say how a row relates to the one above it, or stop saying it. The whole of
  // what building a set now is: no container to open, nothing held on screen
  // that isn't on the list, and clearing it is the same click.
  function join(rowId: string, joiner: Joiner | null) {
    apply(
      (es) => es.map((x) => (x.id === rowId ? { ...x, joined_above: joiner } : x)),
      () => onRow(rowId, async (id) => unwrap(((await setGearJoiner(id, joiner, list.instance_id)) ?? {}) as object))
    )
  }

  // Say how many a row counts by, or stop counting by students. Both halves go
  // together: an "each" with nothing to count against is not a rule.
  function setRatio(rowId: string, rule: { each: number; perStudents: number } | null) {
    apply(
      (es) => es.map((x) => (x.id === rowId
        ? { ...x, qty_each: rule?.each ?? null, qty_per_students: rule?.perStudents ?? null }
        : x)),
      () => onRow(rowId, async (id) => unwrap(((await updateGearEntry(id, {
        each: rule?.each ?? null, perStudents: rule?.perStudents ?? null,
      }, list.instance_id)) ?? {}) as object))
    )
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      {/* The sheet this list becomes when it's handed out. Up here rather than
          beside the template controls at the foot: printing is what you do
          with a list you've finished, not part of saving it. */}
      <div className="flex justify-end">
        {/* Printed from here it is the POC's sheet: every quantity is what the
            whole course needs. The same list printed from the portal is what
            one person packs. */}
        <PdfLink
          href={`/api/gear-lists/${list.id}/pdf?for=course`}
          label="Printable PDF"
        />
      </div>

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
          drag, setDrag, over, setOver, onDrop: drop, apply, onRow, addEntry,
          joining, setJoining, joinOnto,
          instanceId: list.instance_id, busy, run, input, join,
          students: students ?? null, ratioFor, setRatioFor, setRatio,
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
              {loose.length > 0 || adding === zoneKey({ gt, section: null }, 'end') ? (
                <SectionCard key={`${gt}:loose`} {...shared} groupType={gt} name={null} rows={loose} />
              ) : (
                <button
                  onClick={() => setAdding(zoneKey({ gt, section: null }, 'end'))}
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
                  const zone = zoneKey({ gt, section: named }, 'end')
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
  editingOptions: ProductPanel | null
  setEditingOptions: (v: ProductPanel | null) => void
  drag: Drag | null
  setDrag: (d: Drag | null) => void
  over: string | null
  setOver: (key: string | null) => void
  onDrop: (target: Target, beforeId: string | null) => void
  apply: (optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) => void
  // Every server call that names a row goes through this, so a row added a
  // moment ago is addressed by the id the server gave it rather than the one
  // it was drawn under.
  onRow: <T,>(id: string, fn: (real: string) => Promise<T>) => Promise<T>
  addEntry: (input: { gearItemId?: string | null; name?: string; target: Target }) => void
  instanceId: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  // Relate a row to the one above it, or stop relating them.
  join: (rowId: string, joiner: Joiner | null) => void
  // A row let go on top of another row, and the question that follows.
  joining: { targetId: string; draggedId: string } | null
  setJoining: (v: { targetId: string; draggedId: string } | null) => void
  joinOnto: (targetId: string, draggedId: string, joiner: Joiner) => void
  // The course's maximum number of students, or null on a template.
  students: number | null
  ratioFor: string | null
  setRatioFor: (id: string | null) => void
  setRatio: (rowId: string, rule: { each: number; perStudents: number } | null) => void
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
  const here: Target = { gt: groupType, section: name }

  // A drag abandoned outside any card would otherwise leave its landing line
  // drawn across a container nothing is being dropped into.
  useEffect(() => { if (!dragging) s.setOver(null) }, [dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const placed = placeSets(rows)

  const gap = (beforeId: string | 'end') =>
    gapProps({ target: here, beforeId, dragging, over: s.over, setOver: s.setOver, onDrop: s.onDrop })

  const addKey = zoneKey(here, 'end')

  // The first row of whatever is drawn next, which is the row an operator
  // placed in the gap above it belongs to.
  const leadRow = (p: (typeof placed)[number]) => (p.kind === 'item' ? p.row : p.rows[0])

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

      <div>
        {placed.map((p) => (
          <Fragment key={leadRow(p).id}>
            {/* The gap is where the relationship is made. Nothing to open
                first, nothing held on screen that isn't on the list: you write
                both rows, then say what they have to do with each other in the
                space between them, which is where you are already looking. */}
            <Gap
              dragging={dragging}
              isOver={s.over === zoneKey(here, leadRow(p).id)}
              gap={gap(leadRow(p).id)}
            />
            {p.kind === 'item' ? (
              <div className="border-t border-zinc-800/70 first:border-t-0">
                <Row
                  e={p.row}
                  editingOptions={s.editingOptions} setEditingOptions={s.setEditingOptions}
                  joining={s.joining} setJoining={s.setJoining} joinOnto={s.joinOnto}
                  dragging={dragging} isOver={false}
                  onDragStart={() => s.setDrag({ id: p.row.id })}
                  onDragEnd={() => { s.setDrag(null); s.setOver(null) }}
                  gap={{ onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {} }}
                  apply={s.apply} onRow={s.onRow} instanceId={s.instanceId}
                  busy={s.busy} run={s.run} input={s.input}
                  students={s.students} ratioFor={s.ratioFor}
                  setRatioFor={s.setRatioFor} setRatio={s.setRatio}
                />
              </div>
            ) : (
              <SetBlock {...s} set={p} dragging={dragging} />
            )}
          </Fragment>
        ))}
      </div>

      <div className={rows.length > 0 ? 'border-t border-zinc-800/70' : ''}>
        {s.adding === addKey ? (
          <AddGear
            listId={s.listId} target={here}
            catalog={s.catalog} childrenOf={s.childrenOf} addEntry={s.addEntry}
            onClose={() => s.setAdding(null)}
            busy={s.busy} run={s.run} input={s.input}
          />
        ) : (
          <button
            onClick={() => s.setAdding(addKey)}
            className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800/40 transition-colors"
          >
            + Add gear{name ? ` to ${name}` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

const JOINER_WORD: Record<Joiner, string> = { and: 'and', or: 'or', or_if_needed: 'or, if needed' }

const JOINER_TITLE: Record<Joiner, string> = {
  and: 'Both are needed — they go together',
  or: 'Either will do — students bring one or the other',
  or_if_needed: 'Acceptable instead of the one above, if they haven’t got it',
}

// The operator, wherever it is shown: the gap between two things on the list,
// the word between two alternatives, the "and" inside one. Every place it
// appears it is the same control, so changing a relationship and undoing one
// are the same click in the place the relationship is drawn — there is nowhere
// a set can be made that it cannot be unmade.
function JoinControls({
  rowId, current, join, busy, dragging,
}: {
  rowId: string
  current: Joiner | null
  join: (rowId: string, joiner: Joiner | null) => void
  busy: boolean
  dragging: boolean
}) {
  return (
    <span className={`flex items-center gap-1 transition-opacity ${
      dragging ? 'opacity-0' : 'opacity-0 group-hover/gap:opacity-100 focus-within:opacity-100'
    }`}>
      {(['and', 'or', 'or_if_needed'] as const).filter((j) => j !== current).map((j) => (
        <button
          key={j}
          onClick={() => join(rowId, j)}
          disabled={busy}
          title={JOINER_TITLE[j]}
          className={PAIR_BTN}
        >
          {JOINER_WORD[j]}
        </button>
      ))}
      {current && (
        <button
          onClick={() => join(rowId, null)}
          disabled={busy}
          title="Unrelated — both are simply required"
          className={PAIR_BTN}
        >
          ×
        </button>
      )}
    </span>
  )
}

// The space between two things on the list: somewhere to move a row to, and
// nothing else. Relating two rows is done by dropping one onto the other, so
// there is one gesture for "put it here" and one for "these two go together",
// and no button that has to explain which of the two it is.
function Gap({
  dragging, isOver, gap,
}: {
  dragging: boolean
  isOver: boolean
  gap: { onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void }
}) {
  return (
    <div
      {...gap}
      className={`transition-colors ${dragging ? 'h-3' : 'h-1'} ${
        isOver ? 'border-t-2 border-pr-red' : ''
      }`}
    />
  )
}

// A set: rows that are joined, drawn as one thing.
//
// Boxed, and saying what it claims, because a run of bullets reads as a run of
// requirements — a student skimming past an unmarked alternative packs a
// drysuit they did not need. The alternatives stack and the parts of one
// alternative sit side by side, which is the only arrangement that shows
// "(wetsuit and rain jacket) or drysuit" without parentheses.
function SetBlock({
  set, dragging, ...s
}: Shared & {
  set: Extract<ReturnType<typeof placeSets<ResolvedRow>>[number], { kind: 'set' }>
  dragging: boolean
}) {
  const choice = isChoice(set)
  // A set sits on one side of one section by construction — its rows are
  // neighbours — so the drop targets inside it are the section's own.
  const here: Target = { gt: set.rows[0].group_type, section: set.rows[0].r.section }
  const gap = (beforeId: string) =>
    gapProps({ target: here, beforeId, dragging, over: s.over, setOver: s.setOver, onDrop: s.onDrop })

  return (
    <div className="px-3 py-2.5 border-t border-zinc-800/70 first:border-t-0">
      <div className="border border-pr-red/40 bg-pr-red/[0.03] rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-pr-red/[0.06] border-b border-pr-red/20">
          <span className="shrink-0 text-[10px] uppercase tracking-widest text-pr-red font-medium">
            {choice ? 'Bring one of' : 'Bring both'}
          </span>
        </div>

        {set.alternatives.map((alt, i) => (
          <div key={alt.rows[0].id} className={i > 0 ? 'border-t border-pr-red/15' : ''}>
            {choice && (
              /* The word between two alternatives is the operator itself, and
                 clicking it is how it changes or goes — a set can always be
                 taken apart where it is drawn. Position, not a stored label:
                 delete the first alternative and the second becomes the one
                 read first. */
              <div
                {...(i > 0 ? gap(alt.rows[0].id) : {})}
                className={`flex items-center gap-2 px-2.5 pt-1.5 group/gap ${
                  i > 0 && s.over === zoneKey(here, alt.rows[0].id) ? 'border-t-2 border-pr-red' : ''
                }`}
              >
                <span className={`text-[10px] uppercase tracking-widest font-medium ${
                  i === 0 ? 'text-zinc-500' : alt.ifNeeded ? 'text-zinc-600' : 'text-pr-red'
                }`}>
                  {i === 0 ? 'Either' : alt.ifNeeded ? 'Or, if needed' : 'Or'}
                </span>
                <span className="flex-1 h-px bg-zinc-800/70" />
                {i > 0 && (
                  <JoinControls
                    rowId={alt.rows[0].id} current={alt.rows[0].joined_above}
                    join={s.join} busy={s.busy} dragging={dragging}
                  />
                )}
              </div>
            )}
            <div className={`flex flex-wrap items-stretch gap-2 px-2.5 py-2 ${alt.ifNeeded ? 'opacity-75' : ''}`}>
              {alt.rows.map((e, ri) => (
                <Fragment key={e.id}>
                  {ri > 0 && (
                    /* The "and" holding two parts of one alternative together,
                       and the same control on it: the parts of a line are as
                       undoable as the alternatives are. */
                    <span className="self-center shrink-0 flex items-center gap-1 group/gap">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium">and</span>
                      <JoinControls
                        rowId={e.id} current={e.joined_above}
                        join={s.join} busy={s.busy} dragging={dragging}
                      />
                    </span>
                  )}
                  <Row
                    e={e} card
                    editingOptions={s.editingOptions} setEditingOptions={s.setEditingOptions}
                    joining={s.joining} setJoining={s.setJoining} joinOnto={s.joinOnto}
                    dragging={dragging} isOver={s.over === zoneKey(here, e.id)}
                    onDragStart={() => s.setDrag({ id: e.id })}
                    onDragEnd={() => { s.setDrag(null); s.setOver(null) }}
                    gap={gap(e.id)}
                    apply={s.apply} onRow={s.onRow} instanceId={s.instanceId}
                    busy={s.busy} run={s.run} input={s.input}
                    students={s.students} ratioFor={s.ratioFor}
                    setRatioFor={s.setRatioFor} setRatio={s.setRatio}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({
  e, editingOptions, setEditingOptions, dragging, isOver, joining, setJoining, joinOnto,
  onDragStart, onDragEnd, gap, apply, onRow, instanceId, busy, run, input, card,
  students, ratioFor, setRatioFor, setRatio,
}: {
  e: GearEntry & { r: { name: string; note: string | null; url: string | null; section: string | null; catalogItem?: GearItem; options: GearItem[]; models: GearItem[] } }
  editingOptions: ProductPanel | null
  setEditingOptions: (v: ProductPanel | null) => void
  dragging: boolean
  isOver: boolean
  joining: { targetId: string; draggedId: string } | null
  setJoining: (v: { targetId: string; draggedId: string } | null) => void
  joinOnto: (targetId: string, draggedId: string, joiner: Joiner) => void
  onDragStart: () => void
  onDragEnd: () => void
  gap: { onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void }
  apply: (optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) => void
  onRow: <T,>(id: string, fn: (real: string) => Promise<T>) => Promise<T>
  instanceId: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  students: number | null
  ratioFor: string | null
  setRatioFor: (id: string | null) => void
  setRatio: (rowId: string, rule: { each: number; perStudents: number } | null) => void
  // A slot of a multi-slot line draws as a card, so the slots read as peers
  // sitting beside each other rather than as a run of separate requirements.
  // The operator is drawn between the cards by whatever holds them.
  card?: boolean
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

  // Same pair at both levels, because they are the same two questions asked of
  // different things: "what else do I also need" and "what would do instead".
  //
  //   generic item  + and → another item, alongside this one
  //                 + or  → this becomes one alternative, you pick the other
  //   product       + and → another line of this item, pinned to that product
  //                 + or  → another product that satisfies this same line
  //
  // AND at the product level has to be a second line. The products on one row
  // are a disjunction — "any of these will do" — so two you both need cannot
  // share a row without it meaning the opposite of what it says.

  // Its own zone, because what's added joins this line rather than landing at
  // the foot of the section — the panel opens on the row it will sit beside.

  // Recommendations are stored as the whole set, so every change to them is
  // "here is the new list of models" — drawn on the row before it is sent.
  const setOptions = (ids: string[]) => apply(
    (es) => es.map((x) => x.id === e.id
      ? { ...x, gear_entry_options: ids.map((gear_item_id, i) => ({ gear_item_id, sort_order: i })) }
      : x),
    () => onRow(e.id, (id) => setGearEntryOptions(id, ids, instanceId))
  )

  // What this row says it needs, and what it would say without the override —
  // which is what the box shows you while it is empty.
  const qty = gearQuantity(e, { students, view: 'course' })
  const auto = gearQuantity({ ...e, quantity: null }, { students, view: 'course' })

  const [onMe, setOnMe] = useState(false)
  const asking = joining?.targetId === e.id

  return (
    <div
      ref={row}
      {...gap}
      onDragOver={(ev) => {
        // A row landing on a row is a different question from a row landing
        // between two, so it takes the event before the gap under it can.
        if (!dragging) return
        ev.preventDefault(); ev.stopPropagation()
        setOnMe(true)
      }}
      onDragLeave={() => setOnMe(false)}
      onDrop={(ev) => {
        ev.preventDefault(); ev.stopPropagation()
        setOnMe(false)
        const dropped = ev.dataTransfer.getData('text/plain')
        if (dropped && dropped !== e.id) setJoining({ targetId: e.id, draggedId: dropped })
      }}
      className={
        card
          ? `flex-1 min-w-[15rem] rounded-lg border bg-zinc-900/40 px-2.5 py-2 group transition-colors ${
              onMe ? 'border-pr-red bg-pr-red/10' : isOver ? 'border-pr-red' : 'border-zinc-800'
            }`
          : `px-3 py-2 group transition-colors ${
              onMe ? 'bg-pr-red/10 ring-1 ring-inset ring-pr-red/60 rounded' : isOver ? 'border-t-2 border-pr-red' : ''
            }`
      }
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
            {/* How many, next to what — not in a column at the far right of
                the card. The number belongs to the item, and a row reads as one
                unit only if everything it says about that item is in it.

                What the course needs, which is what this editor is for: the
                POC reads it to buy or pull the gear. The student's copy of the
                same row shows one person's share. */}
            <span className="inline-flex items-center text-zinc-600">
              <span className="text-xs pr-0.5">×</span>
              {/* The box holds the override and nothing else. What the rule
                  works out sits in it as the placeholder — greyed, because it
                  is what the row says while the box is empty — so typing is how
                  you overrule it and clearing is how you take that back. There
                  is no third state to get into and no button to find. */}
              <input
                defaultValue={e.quantity ?? ''}
                onBlur={(ev) => {
                  const v = ev.target.value
                  if (v === (e.quantity ?? '')) return
                  apply(
                    (es) => es.map((x) => (x.id === e.id ? { ...x, quantity: v.trim() || null } : x)),
                    () => onRow(e.id, (id) => updateGearEntry(id, { quantity: v }, instanceId))
                  )
                }}
                placeholder={auto.text ?? '1'}
                aria-label="Quantity"
                title={
                  qty.overridden
                    ? `Typed over the rule — ${auto.rule?.toLowerCase()}${auto.text ? `, so ${auto.text}` : ''}. Clear the box to go back to it.`
                    : auto.rule
                      ? `${auto.rule}${students ? ` — ${students} students` : ', once this course has a number of students'}`
                      : 'This many, however many students come'
                }
                size={1}
                className={`w-14 bg-transparent border rounded px-1 py-0.5 text-xs focus:bg-zinc-900 focus:outline-none transition-colors ${
                  qty.overridden
                    ? 'border-zinc-700 text-amber-300/90 hover:border-zinc-600 focus:border-zinc-500'
                    : 'border-transparent text-zinc-300 placeholder:text-zinc-500 hover:border-zinc-800 focus:border-zinc-600'
                }`}
              />
              {/* What the number is made of, said in two words. It is on the row
                  rather than behind a hover because "each" and "per 4" are the
                  difference between twelve helmets and three. */}
              <button
                onClick={() => setRatioFor(ratioFor === e.id ? null : e.id)}
                disabled={busy}
                title={
                  auto.rule
                    ? `${auto.rule} — click to change how this counts`
                    : 'The same however many students come — click to count it by students'
                }
                className={`text-[10px] ml-0.5 px-1 py-0.5 rounded border transition-colors ${
                  ratioFor === e.id
                    ? 'border-zinc-500 text-white bg-zinc-800'
                    : e.qty_per_students
                      ? 'border-transparent text-zinc-500 hover:text-white hover:border-zinc-700'
                      : 'border-transparent text-zinc-700 hover:text-white hover:border-zinc-700'
                }`}
              >
                {/* The rule, not the unit it is counted in. Beside a total,
                    a bare "each" reads as a quantity of its own — "× 16 each"
                    is sixteen apiece, which is the opposite of what it says:
                    sixteen because everyone brings one. */}
                ({auto.rule ? auto.rule.toLowerCase() : 'fixed'})
              </button>
            </span>
            {!e.r.catalogItem && <span className="text-[10px] text-zinc-700">one-off</span>}
          </div>
          {/* The products we point people at sit directly under the name,
              ahead of the description, because the model someone has to go and
              buy is the answer to the question the row is asking. Everything
              that used to explain them — "these will do", "change which models
              work" — was wording stacked in front of the thing itself. */}
          {type && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {e.r.options.map((o, i) => (
                <Fragment key={o.id}>
                  {/* The operator is the point of the line. Two names side by
                      side read equally well as "either" or "both", and which
                      one it is decides what the student goes and buys. */}
                  {i > 0 && (
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium px-0.5">
                      or
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1.5 py-1 rounded border border-pr-red/60 bg-pr-red/10 text-white">
                    {productName(o)}
                    <button
                      onClick={() => setOptions(e.r.options.filter((x) => x.id !== o.id).map((x) => x.id))}
                      title={`Take the ${productName(o)} off this line`}
                      className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      ×
                    </button>
                  </span>
                </Fragment>
              ))}
              {/* Recommending nothing is a real answer — any model of the type
                  works — but it has to say so, or the line looks unfinished. */}
              {e.r.options.length === 0 && (
                <span className="text-[11px] text-zinc-600">Any {e.r.name.toLowerCase()} works</span>
              )}
              {/* One button, one meaning: another model that satisfies this
                  line. It used to be a pair reading "+ and" and "+ or", which
                  are the words the operators between rows use for a different
                  thing entirely — "or" here is "either model will do", not
                  "bring one or the other". */}
              <button
                onClick={() => setEditingOptions(editingOptions?.id === e.id ? null : { id: e.id })}
                disabled={busy}
                title={e.r.options.length === 0
                  ? 'Name a model that satisfies this line'
                  : 'Another model that would also satisfy this line'}
                className={editingOptions?.id === e.id
                  ? `${PAIR_BTN} border-zinc-500 text-white bg-zinc-800`
                  : PAIR_BTN}
              >
                + model
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
                () => onRow(e.id, (id) => updateGearEntry(id, { note: v }, instanceId))
              )
            }}
            placeholder="Add a note for this course"
            className="mt-1 w-full bg-transparent border border-transparent rounded px-1 py-0.5 text-[11px] text-zinc-500 placeholder:text-zinc-800 hover:border-zinc-800 focus:border-zinc-600 focus:bg-zinc-900 focus:text-zinc-300 focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => apply(
            (es) => es.filter((x) => x.id !== e.id),
            () => onRow(e.id, (id) => removeGearEntry(id, instanceId))
          )}
          className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          ×
        </button>
      </div>

      {/* How many this row counts by. A ratio to the students on the course,
          written as the sentence it is — "take 1 for every 4 students" — because
          two bare number boxes beside each other don't say which is which, and
          getting them the wrong way round is the difference between three
          helmets and forty-eight. */}
      {ratioFor === e.id && (() => {
        const per = e.qty_per_students
        const each = Number(e.qty_each ?? 1)
        const preset = (label: string, rule: { each: number; perStudents: number } | null, hint: string) => (
          <button
            key={label}
            onClick={() => setRatio(e.id, rule)}
            disabled={busy}
            title={hint}
            className={`text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-40 ${
              (rule?.perStudents ?? null) === per && (!rule || rule.each === each)
                ? 'border-zinc-500 text-white bg-zinc-800'
                : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
            }`}
          >
            {label}
          </button>
        )
        return (
          <div className="mt-2 p-2 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <p className="text-[11px] text-zinc-500">
              {students
                ? `Worked out from ${students} students — this course's maximum, on the Details tab. Change it there and every quantity here follows it.`
                : 'This course has no maximum number of students yet. Set it on the Details tab and the quantities work themselves out; until then the rule is all this row can say.'}
            </p>
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-400">
              <span>Take</span>
              <input
                key={`each:${each}:${per}`}
                type="number" min="1" step="1" defaultValue={each}
                onBlur={(ev) => {
                  const v = Number(ev.target.value)
                  if (!(v > 0) || v === each) return
                  setRatio(e.id, { each: v, perStudents: per ?? 1 })
                }}
                className={`w-16 ${input} py-1`}
              />
              <span>for every</span>
              <input
                key={`per:${each}:${per}`}
                type="number" min="1" step="1" defaultValue={per ?? 1}
                onBlur={(ev) => {
                  const v = Number(ev.target.value)
                  if (!(v > 0) || v === per) return
                  setRatio(e.id, { each, perStudents: v })
                }}
                className={`w-16 ${input} py-1`}
              />
              <span>{(per ?? 1) === 1 ? 'student' : 'students'}</span>
              {/* The whole point, said back: what the course ends up needing. */}
              {per && students && (
                <span className="text-zinc-500">
                  → {Math.ceil(students / per) * each} for this course
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preset('One each', { each: 1, perStudents: 1 }, 'Everyone brings one — the usual for personal kit')}
              {preset('One between two', { each: 1, perStudents: 2 }, 'One for every two students')}
              {preset('One between four', { each: 1, perStudents: 4 }, 'One for every four students')}
              {preset('Same however many', null, 'A fixed number that doesn’t move with the roster — one radio, 40 ft of webbing')}
            </div>
            {qty.overridden && (
              <p className="text-[11px] text-amber-300/80">
                This row is set to {qty.text} for this course, over its rule. Clear the quantity box to hand it back.
              </p>
            )}
          </div>
        )
      })()}

      {/* The panel only ever adds. Taking a recommendation back is the × on
          the chip itself, where the thing being removed is.

          The catalog not having the product yet is the ordinary case the first
          time anyone recommends something, so naming it here adds it to the
          catalog and recommends it in one go — otherwise the + is a dead end
          on exactly the row where you had a product in mind. */}
      {/* Asked where it was let go, because "and" and "or" are two different
          lists to pack from and a drop cannot be allowed to guess. Nothing is
          written until one of them is picked; leaving it alone leaves the list
          as it was. */}
      {asking && joining && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-pr-red/50 bg-pr-red/[0.06] px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-widest text-pr-red font-medium">
            Joined to “{e.r.name}” how?
          </span>
          <button
            onClick={() => joinOnto(e.id, joining.draggedId, 'and')}
            className={PAIR_BTN}
            title="Both are needed — they go together"
          >
            and
          </button>
          <button
            onClick={() => joinOnto(e.id, joining.draggedId, 'or')}
            className={PAIR_BTN}
            title="Either will do — students bring one or the other"
          >
            or
          </button>
          <button
            onClick={() => joinOnto(e.id, joining.draggedId, 'or_if_needed')}
            className={PAIR_BTN}
            title="Acceptable instead of this one, if they haven’t got it"
          >
            or, if needed
          </button>
          <span className="flex-1" />
          <button
            onClick={() => setJoining(null)}
            className={PAIR_BTN}
            title="Leave the list as it was"
          >
            cancel
          </button>
        </div>
      )}

      {editingOptions?.id === e.id && type && (() => {
        // Models already on the line are the ones there is no point offering
        // again.
        const rest = e.r.models.filter((m) => !e.r.options.some((o) => o.id === m.id))
        // Widening what satisfies this line. Not an operator: every model here
        // is an answer to "what counts as this item", and the student brings
        // one of them — which is why two things you both need are two rows,
        // joined by dragging one onto the other, each with its own quantity.
        const pick = (id: string) => setOptions([...e.r.options.map((o) => o.id), id])
        // This one waits: the chip can't be drawn from a catalog that doesn't
        // have the product in it yet.
        const addNew = () => run(async () => {
          const { id } = unwrap(await upsertGearItem({
            name: newModel, brand: newBrand.trim() || null, category: type.category, parentId: type.id,
          }))
          await onRow(e.id, (rowId) => setGearEntryOptions(rowId, [...e.r.options.map((o) => o.id), id], instanceId))
          setNewModel(''); setNewBrand('')
        })
        return (
          <div className="mt-2 p-2 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <p className="text-[11px] text-zinc-500">
              {e.r.models.length === 0
                ? `The catalog has no models of ${type.name.toLowerCase()} yet. Name the one you recommend.`
                : rest.length > 0
                  ? 'Recommend a model. Recommend none and any one of them is fine.'
                  : 'Every model in the catalog is already recommended. Add another below.'}
            </p>
            {rest.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rest.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => pick(m.id)}
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
                title="Adds it to the gear catalog and puts it on this line"
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

// Two ways onto the gear shelf: a new template, or over one that's already
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
  // A generic item named here rather than picked, same as the catalog page.
  const [newType, setNewType] = useState<string | null>(null)
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
            target.section
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
                <CategorySelect
                  value={newCategory}
                  options={allCategories}
                  allowEmpty={false}
                  // The type picked is one of this category's, so changing
                  // category un-picks it rather than leaving a product filed
                  // against a type that is no longer on offer.
                  onChange={(next) => { setNewCategory(next); setNewParent(''); setNewType(null) }}
                  className={`${input} w-44`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Generic item</label>
                {/* Naming one here rather than picking it. Without this, the
                    first product of something new meant leaving for the catalog
                    page, adding the type, and coming back to a search box you
                    had already emptied. */}
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
                    value={newParent}
                    onChange={(e) => {
                      if (e.target.value === NEW_TYPE) { setNewType(''); setNewParent('') }
                      else setNewParent(e.target.value)
                    }}
                    className={`${input} w-44`}
                  >
                    <option value="">{typesHere.length === 0 ? '— nothing here yet —' : '— none, this is a generic item —'}</option>
                    {typesHere.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    <option value={NEW_TYPE}>+ New generic item…</option>
                  </select>
                )}
              </div>
              {(newParent || newType) && (
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
                  // A named generic item is created first, in this category,
                  // and the product filed under it — two writes for what reads
                  // as one.
                  let parent = newParent
                  if (newType?.trim()) {
                    const { id } = unwrap(await upsertGearItem({
                      name: newType.trim(), category: newCategory,
                    }))
                    parent = id
                  }
                  const { id } = unwrap(await upsertGearItem({
                    name: query,
                    brand: parent ? newItemBrand.trim() || null : null,
                    category: newCategory,
                    parentId: parent || null,
                  }))
                  await addGearEntry(listId, {
                    gearItemId: id, groupType: target.gt, section: target.section,
                  })
                  setQuery(''); setNewParent(''); setNewItemBrand(''); setNewType(null)
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
