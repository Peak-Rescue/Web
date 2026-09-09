'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import CategorySelect from './CategorySelect'
import { templateHref, templateShelfHref } from '@/lib/library'
import PdfLink from '@/components/PdfLink'
import { ForPill } from '@/components/AudiencePills'
import GearReview, { GearReviewStatus } from '@/components/GearReview'
import NewTabIcon from '@/components/NewTabIcon'
import CloseButton from '@/components/CloseButton'
import InfoHint from '@/components/InfoHint'
import TrashIcon from '@/components/TrashIcon'
import { GEAR_CATEGORIES, gearQuantity, isChoice, KIT_LABEL, matchesGear, placeSets, productName, unwrap, type CatalogItem, type Joiner } from '@/lib/gear'
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
  /** The headcount this list is packed for, or null to follow the course. */
  students?: number | null
  updated_at?: string | null
  review_requested_at?: string | null
  review_requested_by?: string | null
  reviewed_at?: string | null
  review_note?: string | null
  instance_id: string | null
  is_template: boolean
  gear_list_entries: GearEntry[]
}

type GroupType = 'personal' | 'group'

// Everywhere a row can land: a side of the list and a heading under it. There
// is nowhere else — a set is not a place, it is a relationship between rows
// that are already next to each other.
type Target = {
  gt: GroupType; section: string | null
  // The row this lands above, when gear is being added in a particular gap
  // rather than at the foot of the section.
  before?: string
}

const sameTarget = (a: Target, b: Target) => a.gt === b.gt && a.section === b.section

// One identity per gap on the list.
const zoneKey = (t: Target, beforeId: string | 'end') =>
  `${t.gt}|${t.section ?? ''}|${beforeId}`

// A row picked up and not yet dropped.
type Drag = { id: string }

// Which row has its model picker open. One question — which models count as
// this item — so no mode: the row-making buttons that used to sit beside it
// said "and" and "or" while meaning something other than the operators between
// rows, one line away from them.
type ProductPanel = { id: string }

const PAIR_BTN =
  'text-[11px] leading-none px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-600 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-40'

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
  onDelete,
  reviewerName,
  viewerId,
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
  /** Set on a course, where the list is one of several and can be got rid of.
      Its presence is also what says this editor owns the header: on the library
      shelf the template row draws its own. */
  onDelete?: () => void
  /** Who last signed this list off, by name. */
  reviewerName?: string | null
  /** Who is looking. Signing off is not the asker's to do — the whole point
      is a reader who did not write it — so the control appears for everyone
      else and not for them. */
  viewerId?: string | null
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
  // Which row's "how many" panel is open. One at a time, like every other panel
  // on a row.
  const [ratioFor, setRatioFor] = useState<string | null>(null)
  // The one add panel, and where it puts things. Both halves and every heading
  // are reachable from it, so the panel no longer has to be opened in the right
  // place to add to the right place.
  const [addOpen, setAddOpen] = useState(false)
  const [addTarget, setAddTarget] = useState<Target>({ gt: 'personal', section: null })
  // Non-null while a heading is being typed; '' is an empty field, not absence.
  const [newHeading, setNewHeading] = useState<string | null>(null)
  // The template panel, opened from the header rather than standing open at
  // the foot of the list.
  const [shelfOpen, setShelfOpen] = useState(false)
  // The last thing placed, because adding happens in one click now and the row
  // it makes can be below the fold.
  const [justAdded, setJustAdded] = useState<string | null>(null)

  // Which halves to draw. Named rather than inlined as a guard on the map:
  // `cond && rows.map(cb)` reads to the React compiler as a callback that may
  // run during render, and the handlers this list hands down close over refs.
  const HALVES = ['personal', 'group'] as const
  const [drag, setDrag] = useState<Drag | null>(null)
  // Where the pointer went down on a row, and whether it has travelled far
  // enough to mean a drag rather than a click. Held in a ref because every
  // pointer move would otherwise re-render the whole list.
  const press = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null)
  // The row the pointer is over, when it is over a row rather than a gap.
  const [overRow, setOverRow] = useState<string | null>(null)

  // What is under the pointer: a gap to drop into, a row to be joined to, or
  // nothing. Read from the document rather than from React, because the thing
  // being dragged is following the cursor across other people's elements.
  function targetAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    // Rows first. A section card is itself the drop zone for its own end, and
    // it wraps every row in it — asked the other way round, a row would always
    // answer "the bottom of this section" and nothing could ever be dropped
    // onto anything.
    const row = el?.closest('[data-row]') as HTMLElement | null
    if (row) return { kind: 'row' as const, id: row.dataset.row as string }
    const gap = el?.closest('[data-gap]') as HTMLElement | null
    if (gap) {
      return {
        kind: 'gap' as const,
        key: gap.dataset.gap as string,
        target: { gt: gap.dataset.gt as GroupType, section: gap.dataset.section || null },
        before: gap.dataset.before as string,
      }
    }
    return null
  }

  function onRowPointerDown(id: string, ev: React.PointerEvent) {
    // Left button only, and never from something you were trying to type in or
    // click on.
    if (ev.button !== 0) return
    if ((ev.target as HTMLElement).closest('input, textarea, button, a, select')) return
    press.current = { id, x: ev.clientX, y: ev.clientY, active: false }
  }

  function onPointerMove(ev: React.PointerEvent) {
    const p = press.current
    if (!p) return
    if (!p.active) {
      // A few pixels of travel is what separates a drag from a click on a row.
      if (Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) < 6) return
      p.active = true
      setDrag({ id: p.id })
    }
    ev.preventDefault()
    const t = targetAt(ev.clientX, ev.clientY)
    setOver(t?.kind === 'gap' ? t.key : null)
    setOverRow(t?.kind === 'row' && t.id !== p.id ? t.id : null)
  }

  function endPointerDrag(ev: React.PointerEvent) {
    const p = press.current
    press.current = null
    if (!p?.active) return
    const t = targetAt(ev.clientX, ev.clientY)
    setOver(null); setOverRow(null)
    if (t?.kind === 'row' && t.id !== p.id) {
      // Landing on a row asks what the two have to do with each other; landing
      // in a gap is a move and needs no question.
      setDrag(null)
      setJoining({ targetId: t.id, draggedId: p.id })
      return
    }
    if (t?.kind === 'gap') return drop(t.target, t.before === 'end' ? null : t.before)
    setDrag(null)
  }
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

  // Every heading this list has named, either half, in the order they appear —
  // what the add panel offers as destinations. A heading is a fact about the
  // list rather than about one half of it: filing the group's rope under
  // "Rescue Equipment" should reach the same heading the personal kit uses.
  // The headcount this list is packed against.
  //
  // It starts as the course's maximum and usually stays there, but the two are
  // not always the same thing: a course capped at twelve with eight signed up
  // is packed for eight, and one taking two at the door is packed for fourteen.
  // Typing over every row would say the same thing and lose the rules that made
  // the list worth having, so the list carries a headcount of its own instead.
  // Null means follow the course, which is where every list starts.
  const packFor = list.students ?? students ?? null
  const drifted = list.students != null && students != null && list.students !== students

  const halves = entries.length === 0 ? [] : HALVES

  const headings = useMemo(() => {
    const seen: string[] = []
    for (const gt of ['personal', 'group'] as const) {
      for (const s of grouped[gt].sections) if (!seen.includes(s.name)) seen.push(s.name)
    }
    // Plus the one being typed in the add panel, so it can be filed under
    // before it exists — the heading becomes real when the first row lands.
    const typed = addTarget.section
    if (typed && !seen.includes(typed)) seen.push(typed)
    return seen
  }, [grouped, addTarget.section])

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
    // Where it goes: above the row whose gap this was added in, or at the end
    // of the list when it was added from the foot of a section.
    const below = target.before ? entries.find((x) => x.id === target.before) : undefined
    const sortOrder = below
      ? below.sort_order
      : entries.reduce((m, e) => Math.max(m, e.sort_order), -1) + 1
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
      sortOrder, beforeId: target.before ?? null, instanceId: list.instance_id,
    }).then(({ id }) => {
      // The row on screen becomes the row in the database, so the click after
      // this one has nothing to wait for.
      setPending((es) => es && es.map((x) => (x.id === temp.id ? { ...x, id } : x)))
      return id
    })
    realIds.current.set(temp.id, settle)
    apply(
      (es) => below
        ? [...es.map((x) => (x.sort_order >= sortOrder ? { ...x, sort_order: x.sort_order + 1 } : x)), temp]
        : [...es, temp],
      () => settle
    )
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

  // Say what a row counts, and what it counts by: so many per student, or per
  // course. Both halves go together — a number with no unit, or a unit with no
  // number, is not a rule and would sit on the row saying nothing.
  function setRatio(rowId: string, rule: { each: number; perStudents: number | null } | null) {
    // A bare number already in the quantity box was the same statement, typed
    // where nothing could compute with it. Leaving it there would make it an
    // override of the rule that replaced it — the row would sit at 8 while the
    // rule said 16 and nobody wrote either. Prose stays: "20 ft" and "sample of
    // ladder types" are not numbers a ratio can restate.
    const es0 = pending ?? list.gear_list_entries
    const was = es0.find((x) => x.id === rowId)?.quantity ?? null
    const drop = Boolean(rule) && was !== null && /^\s*\d+(\.\d+)?\s*$/.test(was)

    apply(
      (es) => es.map((x) => (x.id === rowId
        ? {
            ...x,
            qty_each: rule?.each ?? null,
            qty_per_students: rule?.perStudents ?? null,
            quantity: drop ? null : x.quantity,
          }
        : x)),
      () => onRow(rowId, async (id) => unwrap(((await updateGearEntry(id, {
        each: rule?.each ?? null, perStudents: rule?.perStudents ?? null,
        ...(drop ? { quantity: null } : {}),
      }, list.instance_id)) ?? {}) as object))
    )
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div
      className={`space-y-5 ${drag ? 'select-none' : ''}`}
      onPointerMove={onPointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={() => { press.current = null; setDrag(null); setOver(null); setOverRow(null) }}
    >
      {error && <p className="text-sm text-pr-red">{error}</p>}

      {/* Everything you do to the list as a whole, on one row.
          Print was a row of its own, the template controls a block at the foot,
          the name and Delete somewhere above both — four verbs at three
          different heights, the last of them thirty rows down the page. They
          belong to the list, so the list's editor draws them. */}
      {onDelete && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* The name is a field, because a list is very often a copy.
              Starting from a saved template is the ordinary way to build one —
              load it, change what this course needs, save it back to the shelf
              — and the copy arrived carrying the template's name with no way
              to change it, so the only route to a differently-named list was
              a blank one and typing it all again. */}
          <input
            defaultValue={list.name}
            onBlur={(ev) => {
              const next = ev.target.value.trim()
              if (!next || next === list.name) { ev.target.value = list.name; return }
              run(() => updateGearList(list.id, { name: next }))
            }}
            aria-label="List name"
            className="min-w-0 flex-1 sm:flex-none sm:w-72 text-base font-semibold bg-transparent border border-transparent rounded px-1.5 py-0.5 -ml-1.5 hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none transition-colors"
          />
          <ForPill audience={list.audience} />
          {/* Said once, up here, rather than on the column head where the
              number is being read: this list is packed for something other
              than the course, and here is the way back. Same shape as the
              estimate's drift line — a number kept on purpose is fine, and
              only worth mentioning because Details has since moved. */}
          {drifted ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400/90">
              packed for {list.students}, Details says {students}
              <button
                onClick={() => run(() => updateGearList(list.id, { students: null }))}
                disabled={busy}
                className="underline decoration-amber-700 hover:text-amber-200 transition-colors disabled:opacity-40"
              >
                use {students}
              </button>
            </span>
          ) : students != null ? (
            <span className="text-[11px] text-zinc-600">roster {students}</span>
          ) : null}
          {/* Whether anyone but you has read it — a fact about the list, so it
              sits with the other facts rather than in among the verbs. */}
          <GearReviewStatus
            state={{
              requestedAt: list.review_requested_at ?? null,
              reviewedAt: list.reviewed_at ?? null,
              reviewerName: reviewerName ?? null,
              note: list.review_note ?? null,
              updatedAt: list.updated_at ?? null,
            }}
          />
          {/* Asking for a check sits with the other things you do to a
              finished list, not at the end of a sentence about its state.

              Signing one off sits here too, which it did not use to: this is
              an admin's editor, and the reasoning was that an admin assembled
              the list so an admin cannot be the second pair of eyes on it.
              True of the person who asked, and of nobody else — the people
              being asked are mostly admins themselves, and every one of them
              read the list, went to say so, and found the button was on a
              page they do not get shown. A list can sit on "waiting on a
              check" forever that way, which is worse than the wrong person
              being able to tick it. So: anyone but the asker. */}
          <span className="ml-auto flex items-center gap-1">
            {list.instance_id && (
              <GearReview
                instanceId={list.instance_id}
                listId={list.id}
                canAsk
                canSignOff={Boolean(viewerId) && list.review_requested_by !== viewerId}
                state={{
                  requestedAt: list.review_requested_at ?? null,
                  reviewedAt: list.reviewed_at ?? null,
                  reviewerName: reviewerName ?? null,
                  note: list.review_note ?? null,
                  updatedAt: list.updated_at ?? null,
                }}
              />
            )}
          </span>
          <PdfLink href={`/api/gear-lists/${list.id}/pdf`} label="Print" />
          <button
            onClick={() => setShelfOpen((v) => !v)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              shelfOpen ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
            }`}
          >
            Save as template
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="text-xs px-2 py-1 rounded text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}

      {shelfOpen && !list.is_template && (
        <SaveToShelf
          list={list} templates={templates ?? []} courseType={courseType}
          busy={busy} run={run} input={input}
        />
      )}

      <textarea
        defaultValue={list.intro ?? ''}
        onBlur={(e) => e.target.value !== (list.intro ?? '') && run(() => updateGearList(list.id, { intro: e.target.value }))}
        rows={2}
        placeholder="Optional intro — why this kit, what the conditions are"
        className={`w-full resize-y ${input}`}
      />

      {/* One way in, for the whole list.
          There were four — "+ Add gear" and "+ New section" under each half —
          plus one at the foot of every section, so a list with three headings
          offered nine ways to add a row and each of them decided, silently, by
          where it happened to sit. The destination is a question now, asked
          once, in the panel: which half, and under which heading. Naming a new
          heading happens there too, which is when anyone ever wants one — an
          empty section is not a thing people set out to make. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setAddOpen((v) => !v)}
          className={addOpen
            ? 'text-sm font-medium px-3 py-1.5 rounded border border-zinc-500 bg-zinc-800 text-white transition-colors'
            : 'text-sm font-medium px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors'}
        >
          + Add gear
        </button>
      </div>

      {addOpen && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 space-y-3">
          {/* Where a pick lands is answered here, once, before anything is
              picked — and it stays answered across adds, because a run of
              anchors all goes to the same place. Asked after every pick it was
              a second screen for a question with the same answer ten times
              running, and by then the item looked added already. */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 w-20 shrink-0">Adding to</span>
            {(['personal', 'group'] as const).map((gt) => (
              <button
                key={gt}
                onClick={() => setAddTarget((t) => ({ ...t, gt }))}
                aria-pressed={addTarget.gt === gt}
                className={addTarget.gt === gt
                  ? 'text-xs px-2.5 py-1 rounded-full border border-zinc-500 bg-zinc-800 text-white'
                  : 'text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200'}
              >
                {KIT_LABEL[gt]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 w-20 shrink-0">Heading</span>
            {[null, ...headings].map((h) => (
              <button
                key={h ?? '—'}
                onClick={() => setAddTarget((t) => ({ ...t, section: h }))}
                aria-pressed={addTarget.section === h}
                className={addTarget.section === h
                  ? 'text-xs px-2.5 py-1 rounded-full border border-zinc-500 bg-zinc-800 text-white'
                  : 'text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200'}
              >
                {h ?? 'None'}
              </button>
            ))}
            {newHeading === null ? (
              <button
                onClick={() => setNewHeading('')}
                className="text-xs px-2.5 py-1 rounded-full border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500"
              >
                + New…
              </button>
            ) : (
              // Typed here rather than in a browser prompt(), which is unstyled,
              // awkward on a phone and can be switched off entirely.
              <input
                autoFocus
                value={newHeading}
                placeholder="Heading students read"
                onChange={(ev) => setNewHeading(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Escape') return setNewHeading(null)
                  if (ev.key !== 'Enter') return
                  const named = newHeading.trim()
                  if (!named) return setNewHeading(null)
                  setAddTarget((t) => ({ ...t, section: named }))
                  setNewHeading(null)
                }}
                onBlur={() => {
                  const named = newHeading.trim()
                  if (named) setAddTarget((t) => ({ ...t, section: named }))
                  setNewHeading(null)
                }}
                className={`w-48 ${input} py-1 text-xs`}
              />
            )}
          </div>

          {/* Adding happens below the fold of a long list, so the panel says
              what it just did and where it went. */}
          {justAdded && (
            <p className="text-[11px] text-teal-300">{justAdded}</p>
          )}

          <AddGear
            listId={list.id}
            catalog={catalog}
            childrenOf={childrenOf}
            onPick={(picked) => {
              // A catalog pick knows its own name; a brand-new item carries one
              // down, because the catalog prop on this page is a round behind
              // the write that made it — which is how "Adding that" happened.
              const label = picked.label ?? picked.name ?? byId.get(picked.gearItemId ?? '')?.name ?? 'it'
              addEntry({ gearItemId: picked.gearItemId, name: picked.name, target: addTarget })
              setJustAdded(
                `Added ${label} to ${KIT_LABEL[addTarget.gt].toLowerCase()}` +
                (addTarget.section ? ` under ${addTarget.section}` : '')
              )
            }}
            onClose={() => { setAddOpen(false); setJustAdded(null) }}
            busy={busy} run={run} input={input}
          />
        </div>
      )}

      {/* A list with nothing on it says so once. Drawing both halves and an
          empty line under each is two reports of the same nothing, stacked
          under the button that fixes it. The halves appear when there is
          something to put in them. */}
      {entries.length === 0 && (
        <p className="text-xs text-zinc-600">Nothing on this list yet.</p>
      )}

      {halves.map((gt) => {
        const { loose, sections: real } = grouped[gt]
        const halfCount = loose.length + real.reduce((n, sec) => n + sec.rows.length, 0)
        const shared = {
          listId: list.id, catalog, childrenOf,
          editingOptions, setEditingOptions,
          drag, setDrag, over, setOver, onDrop: drop, apply, onRow, addEntry,
          joining, setJoining, joinOnto, overRow, onRowPointerDown,
          instanceId: list.instance_id, busy, run, input, join,
          students: packFor, ratioFor, setRatioFor, setRatio,
        }
        return (
          <div key={gt}>
            {/* The half, named at the weight of a heading, with what it holds
                beside it and what the two columns mean on the right. */}
            <div className="flex items-baseline gap-2 mb-2 flex-wrap">
              <h4 className="text-sm font-semibold text-zinc-200">{KIT_LABEL[gt]}</h4>
              <span className="text-[11px] text-zinc-600">
                {halfCount} item{halfCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              {/* The columns named inside the table they head, on their own
                  band. Sitting them out on the heading line left two labels
                  floating over a border with nothing joining them to the rows
                  underneath. */}
              <div className="flex items-baseline gap-2 pl-3 pr-9 py-1.5 bg-zinc-900/70 border-b border-zinc-800">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">Item</span>
                <span className="ml-auto shrink-0 w-24 text-right text-[10px] uppercase tracking-widest text-zinc-600">
                  Rule
                </span>
                {/* The one number anybody came for, so it is the one thing lit
                    — and the one thing here worth being able to change. On a
                    template there is no course to follow and no total to work
                    out; the rule is the whole answer. */}
                {packFor == null ? (
                  <span className="shrink-0 w-16 text-right text-[10px] uppercase tracking-widest text-teal-300/90">
                    rule only
                  </span>
                ) : (
                  <span className="shrink-0 w-16 flex items-baseline justify-end gap-0.5 text-[10px] uppercase tracking-widest text-teal-300/90">
                    for
                    <input
                      key={`pack:${packFor}`}
                      defaultValue={packFor}
                      inputMode="numeric"
                      aria-label="How many people this list is packed for"
                      title={drifted
                        ? `Packed for ${list.students}. Details says ${students}.`
                        : 'How many people this list is packed for. Starts at the course maximum; type over it to pack for a different number.'}
                      onBlur={(ev) => {
                        const v = ev.target.value.trim()
                        const n = v === '' ? null : Math.floor(Number(v))
                        const next = n !== null && Number.isFinite(n) && n > 0 ? n : null
                        // Back to the course's own number is the same as never
                        // having said one, so it is stored as nothing.
                        const settled = next === students ? null : next
                        if (settled === (list.students ?? null)) return
                        run(() => updateGearList(list.id, { students: settled }))
                      }}
                      className="w-8 bg-transparent border border-transparent rounded px-0.5 text-right text-[11px] font-semibold tabular-nums text-teal-300 hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none transition-colors"
                    />
                  </span>
                )}

              </div>
              <div className="divide-y divide-zinc-800/60">
              {/* An empty card is a container for nothing, so the unheaded card
                  appears only once it holds something. Nothing to click here
                  any more — adding is one control, above. */}
              {loose.length > 0 && (
                <SectionCard key={`${gt}:loose`} {...shared} groupType={gt} name={null} rows={loose} />
              )}

              {real.map((s) => (
                <SectionCard key={`${gt}:${s.name}`} {...shared} groupType={gt} name={s.name} rows={s.rows} />
              ))}

              {loose.length === 0 && real.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-600">
                  Nothing in {KIT_LABEL[gt].toLowerCase()} yet.
                </p>
              )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Saving to the shelf used to stand open under every list forever —
          four controls and a select, wider than the add control and louder than
          the list. It is a thing you do once, if ever, so it waits behind its
          own word in the header. */}
      {!onDelete && !list.is_template && (
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
  // The row the pointer is over mid-drag, which is the one it would be joined
  // to if let go here.
  overRow: string | null
  onRowPointerDown: (id: string, ev: React.PointerEvent) => void
  // A row let go on top of another row, and the question that follows.
  joining: { targetId: string; draggedId: string } | null
  setJoining: (v: { targetId: string; draggedId: string } | null) => void
  joinOnto: (targetId: string, draggedId: string, joiner: Joiner) => void
  // The course's maximum number of students, or null on a template.
  students: number | null
  ratioFor: string | null
  setRatioFor: (id: string | null) => void
  setRatio: (rowId: string, rule: { each: number; perStudents: number | null } | null) => void
}

// The handlers that make one gap a drop zone. A row's own gap has to win over
// the container's catch-all, so the line is drawn where the row would land
// rather than always at the end of whatever holds it.
function gapProps(s: {
  target: Target; beforeId: string | 'end'; dragging: boolean
  over: string | null; setOver: (k: string | null) => void
  onDrop: (t: Target, beforeId: string | null) => void
}) {
  // Data rather than handlers: the drag is tracked by where the pointer is, so
  // a gap only has to say what it is and let the editor find it. HTML5's own
  // drag events decided for themselves whether a gesture counted, and declined
  // on some rows and not others with nothing in the page to explain it.
  return {
    'data-gap': zoneKey(s.target, s.beforeId),
    'data-gt': s.target.gt,
    'data-section': s.target.section ?? '',
    'data-before': s.beforeId,
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
  groupType, name, rows, ...s
}: Shared & {
  groupType: GroupType
  name: string | null
  rows: ResolvedRow[]
}) {
  const dragging = s.drag !== null
  const here: Target = { gt: groupType, section: name }

  // A drag abandoned outside any card would otherwise leave its landing line
  // drawn across a container nothing is being dropped into.
  useEffect(() => { if (!dragging) s.setOver(null) }, [dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const placed = placeSets(rows)

  const gap = (beforeId: string | 'end') =>
    gapProps({ target: here, beforeId, dragging, over: s.over, setOver: s.setOver, onDrop: s.onDrop })

  // The first row of whatever is drawn next, which is the row an operator
  // placed in the gap above it belongs to.
  const leadRow = (p: (typeof placed)[number]) => (p.kind === 'item' ? p.row : p.rows[0])

  return (
    <div
      // A caption and its rows, not a box. Every section drew its own bordered
      // card, which chopped one list into three or four blocks and broke the
      // number columns into three or four alignments — and a heading is an
      // editorial aside about part of a list, not a container the list is made
      // of. The only border left is the one the drag hover needs.
      className={`rounded transition-colors ${
        dragging && s.over?.startsWith(`${groupType}|${name ?? ''}|`)
          ? 'ring-1 ring-inset ring-pr-red/70'
          : ''
      }`}
      {...gap('end')}
    >
      {name !== null && (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <input
            defaultValue={name}
            key={name}
            onBlur={(ev) => {
              const next = ev.target.value.trim()
              if (!next || next === name) { ev.target.value = name; return }
              s.run(() => renameGearSection(s.listId, groupType, name, next))
            }}
            aria-label="Section heading"
            className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500 bg-transparent rounded px-1.5 py-0.5 -ml-1.5 border border-transparent hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
          />
          <span className="shrink-0 text-[11px] text-zinc-500">
            {`${rows.length} item${rows.length === 1 ? '' : 's'}`}
          </span>
          {rows.length > 0 && (
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
              if (!confirm(`Delete “${name}” and the ${rows.length} item${rows.length === 1 ? '' : 's'} under it?`)) return
              s.run(() => removeGearSection(s.listId, groupType, name))
            }}
            disabled={s.busy}
            title="Delete this section and its gear"
            className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            <TrashIcon />
          </button>
        </div>
      )}

      <div>
        {placed.map((p, i) => (
          <Fragment key={leadRow(p).id}>
            {/* The gap is where the relationship is made. Nothing to open
                first, nothing held on screen that isn't on the list: you write
                both rows, then say what they have to do with each other in the
                space between them, which is where you are already looking. */}
            {/* Nothing sits above the first thing in a section for it to be
                joined to, so that gap only takes drops. */}
            {i === 0 ? (
              <div
                {...gap(leadRow(p).id)}
                className={`transition-colors ${dragging ? 'h-3' : 'h-1'} ${
                  s.over === zoneKey(here, leadRow(p).id) ? 'border-t-2 border-pr-red' : ''
                }`}
              />
            ) : (
              <Gap
                rowBelow={leadRow(p)}
                dragging={dragging}
                isOver={s.over === zoneKey(here, leadRow(p).id)}
                gap={gap(leadRow(p).id)}
                join={s.join}
                busy={s.busy}
              />
            )}
            {p.kind === 'item' ? (
              <div className="border-t border-zinc-800/70 first:border-t-0">
                <Row
                  e={p.row}
                  editingOptions={s.editingOptions} setEditingOptions={s.setEditingOptions}
                  joining={s.joining} setJoining={s.setJoining} joinOnto={s.joinOnto}
                  dragging={dragging}
                  onPointerDown={s.onRowPointerDown}
                  isJoinTarget={s.overRow === p.row.id}
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

      {/* No "+ add gear to this section" any more. It read as helpful and
          multiplied by the number of headings — a list with three of them
          offered it three times, on top of the four controls above. Adding is
          one control now, and the heading is one of the two things it asks. */}
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
          <TrashIcon />
        </button>
      )}
    </span>
  )
}

// The space between two things on the list: somewhere to drop a row, and a
// place to say what the two rows either side of it have to do with each other.
//
// Both, not one. Dragging one row onto another is the better gesture when it
// works, but it is the browser that decides whether a gesture is a drag, and it
// declines for reasons nothing in the page can see. Making it the only way to
// build a set meant that when it declined there was no way at all — so the
// click is here, and the drag is the shortcut rather than the mechanism.
function Gap({
  rowBelow, dragging, isOver, gap, join, busy,
}: {
  rowBelow: ResolvedRow
  dragging: boolean
  isOver: boolean
  gap: Record<string, string>
  join: (rowId: string, joiner: Joiner | null) => void
  busy: boolean
  // Adding here rather than at the foot of the section, so gear that belongs
  // with the row above it arrives next to it instead of at the bottom with a
  // drag still to do.
}) {
  return (
    <div
      {...gap}
      className={`flex items-center gap-1 px-3 group/gap transition-colors ${
        dragging ? 'h-4' : 'min-h-[1.1rem] py-0.5'
      } ${isOver ? 'border-t-2 border-pr-red' : ''}`}
    >
      <span className={`flex items-center gap-1 transition-opacity ${
        dragging ? 'opacity-0' : 'opacity-0 group-hover/gap:opacity-100 focus-within:opacity-100'
      }`}>
        <button
          onClick={() => join(rowBelow.id, 'and')}
          disabled={busy}
          title="Both are needed — they go together"
          className={PAIR_BTN}
        >
          + and
        </button>
        <button
          onClick={() => join(rowBelow.id, 'or')}
          disabled={busy}
          title="Either will do — students bring one or the other"
          className={PAIR_BTN}
        >
          + or
        </button>
        {/* The gap says how two rows relate, and only that.
            It used to offer a third thing — "+ gear here" — from when adding
            was done wherever you happened to be standing. There is one way in
            now, at the top of the list, which asks where the item goes; a
            second door in the gap is a second answer to a question already
            asked. Anything that needs to sit here is dragged here, which is
            what the gap is for. */}
      </span>
    </div>
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
                    dragging={dragging}
                    onPointerDown={s.onRowPointerDown}
                    isJoinTarget={s.overRow === e.id}
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
  e, editingOptions, setEditingOptions, dragging, isJoinTarget, joining, setJoining, joinOnto,
  onPointerDown, apply, onRow, instanceId, busy, run, input, card,
  students, ratioFor, setRatioFor, setRatio,
}: {
  e: GearEntry & { r: { name: string; note: string | null; url: string | null; section: string | null; catalogItem?: GearItem; options: GearItem[]; models: GearItem[] } }
  editingOptions: ProductPanel | null
  setEditingOptions: (v: ProductPanel | null) => void
  dragging: boolean
  // The pointer is over this row mid-drag, so letting go here would relate the
  // two rows rather than move one.
  isJoinTarget: boolean
  joining: { targetId: string; draggedId: string } | null
  setJoining: (v: { targetId: string; draggedId: string } | null) => void
  joinOnto: (targetId: string, draggedId: string, joiner: Joiner) => void
  onPointerDown: (id: string, ev: React.PointerEvent) => void
  apply: (optimistic: (es: GearEntry[]) => GearEntry[], fn: () => Promise<unknown>) => void
  onRow: <T,>(id: string, fn: (real: string) => Promise<T>) => Promise<T>
  instanceId: string | null
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
  students: number | null
  ratioFor: string | null
  setRatioFor: (id: string | null) => void
  setRatio: (rowId: string, rule: { each: number; perStudents: number | null } | null) => void
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

  const asking = joining?.targetId === e.id

  return (
    <div
      ref={row}
      data-row={e.id}
      onPointerDown={(ev) => onPointerDown(e.id, ev)}
      className={
        card
          ? `flex-1 min-w-[15rem] rounded-lg border bg-zinc-900/40 px-2.5 py-2 group transition-colors ${
              isJoinTarget ? 'border-pr-red bg-pr-red/10' : 'border-zinc-800'
            }`
          : `relative pl-3 pr-9 py-1.5 group transition-colors hover:bg-zinc-900 ${
              isJoinTarget ? 'bg-pr-red/10 ring-1 ring-inset ring-pr-red/60' : ''
            } ${dragging ? 'cursor-grabbing' : ''}`
      }
    >
      <div className="flex items-start gap-2">
        {/* The whole row is the handle — dragging is the only way to relate two
            rows now, and a mark that appears on hover and fades to near the
            background is not something anyone finds. This says the row moves;
            it is not the only place you can take hold of it. */}
        <span
          title="Drag onto another row to relate them, or between rows to move it"
          className={`shrink-0 mt-0.5 cursor-grab active:cursor-grabbing select-none transition-colors ${
            dragging ? 'text-zinc-400' : 'text-zinc-700 group-hover:text-zinc-400'
          }`}
        >
          ⠿
        </span>
        {/* One line, wrapping only when it must.
            The name, the models it accepts and the note were three stacked
            blocks, so a plain row was three lines high and a list of twenty was
            a page — which is why nothing about it read as a list. They are one
            row of items now: the note flexes into whatever is left and shows as
            much as fits, and the whole of it is still there when you put the
            cursor in it. */}
        <div className="min-w-0 flex-1 flex items-center gap-x-2 gap-y-1 flex-wrap">
          {e.r.url ? (
              <a href={e.r.url} target="_blank" rel="noreferrer" className="text-sm hover:text-pr-red-light transition-colors">
                {e.r.name}
              </a>
            ) : (
              <span className="text-sm">{e.r.name}</span>
            )}
          {!e.r.catalogItem && <span className="text-[10px] text-zinc-700">one-off</span>}
          {/* The products we point people at sit directly under the name,
              ahead of the description, because the model someone has to go and
              buy is the answer to the question the row is asking. Everything
              that used to explain them — "these will do", "change which models
              work" — was wording stacked in front of the thing itself. */}
          {type && (
            <>
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
                  {/* The model, at the weight a model deserves.
                      These were boxed red pills, which put the thing narrowing
                      the row above the row itself: "Team Wendy SAR Tactical"
                      shouted while "Helmet" — what you are actually bringing —
                      sat quietly beside it. The hierarchy is the type, then the
                      model, then whatever is said about it, and it reads now
                      the way the printed sheet has always read it. */}
                  <span className="group/opt inline-flex items-center gap-1 text-xs text-zinc-400">
                    {productName(o)}
                    <button
                      onClick={() => setOptions(e.r.options.filter((x) => x.id !== o.id).map((x) => x.id))}
                      title={`Take the ${productName(o)} off this line`}
                      className="text-zinc-700 hover:text-red-400 opacity-0 group-hover/opt:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </span>
                </Fragment>
              ))}
              {/* Naming no model at all is the ordinary case and needs no
                  sentence: the row already says what to bring, and "any tube-style
                  belay device works" was a line of prose restating the row above
                  it on every row that hadn't been narrowed. */}
              {/* One button, one meaning: another model that satisfies this
                  line. It used to be a pair reading "+ and" and "+ or", which
                  are the words the operators between rows use for a different
                  thing entirely — "or" here is "either model will do", not
                  "bring one or the other". */}
              <button
                onClick={() => setEditingOptions(editingOptions?.id === e.id ? null : { id: e.id })}
                disabled={busy}
                title={e.r.options.length === 0
                  ? `Name the models that count as this — otherwise any ${e.r.name.toLowerCase()} does`
                  : 'Another model that would also satisfy this line'}
                className={editingOptions?.id === e.id
                  ? `${PAIR_BTN} border-zinc-500 text-white bg-zinc-800`
                  : PAIR_BTN}
              >
                {/* Which kind of adding this is.
                    A bare plus was ambiguous the moment it sat a few rows from
                    "+ gear here": one narrows this item to a model that
                    satisfies it, the other puts another item on the list. The
                    noun is what tells them apart, and it is one word. */}
                + model
              </button>
            </>
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
            placeholder="Note"
            // Faded rather than removed: the box keeps its width whether or
            // not it is showing, so a pointer travelling down the list does not
            // reflow every row under it. The catalogue's note is a line of its
            // own and cannot do that, so there it opens on a press instead.
            className={`flex-1 min-w-[6rem] bg-transparent border border-transparent rounded px-1 py-0.5 text-[11px] text-zinc-500 text-ellipsis placeholder:text-zinc-700 hover:border-zinc-800 focus:border-zinc-600 focus:bg-zinc-900 focus:text-zinc-300 focus:outline-none transition-colors ${
              e.r.note ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
          />
        </div>

        {/* How many, in a column of its own.
            It sat inline after the name, on the argument that a row reads as
            one unit only if everything about the item is inside it. True of a
            row read on its own, and wrong down a list of thirty: the number is
            what the POC came for, and inline it lands at a different place on
            every line, so the one thing worth scanning is the one thing you
            cannot. Aligned, the column reads as the packing sheet it is.

            The course's number, which is what this editor is for — the POC
            reads it to buy or pull the gear. The student's copy of the same
            row shows one person's share instead. */}
        {/* Two cells, not one. They were fused — "× 20 (2 each)" — which is a
            sentence where a column was wanted: the rule and the total answer
            different questions, and neither lines up down the list while they
            share a box. The rule is what the next course inherits; the number
            is what goes in the van today. */}
        <div className="shrink-0 w-24 text-right">
          <button
            onClick={() => setRatioFor(ratioFor === e.id ? null : e.id)}
            disabled={busy}
            title={
              auto.rule
                ? `${auto.rule} — click to change how this counts`
                : 'However many the box says, for the course — click to count it by students'
            }
            className={`text-[11px] px-1 py-0.5 rounded border transition-colors ${
              ratioFor === e.id
                ? 'border-zinc-500 text-white bg-zinc-800'
                : 'border-transparent text-zinc-500 hover:text-white hover:border-zinc-700'
            }`}
          >
            {/* The rule, not the unit it is counted in. Beside a total, a bare
                "each" reads as a quantity of its own — "× 16 each" is sixteen
                apiece, which is the opposite of what it says: sixteen because
                everyone brings one.

                Always drawn now that it is a column. It used to wait for the
                pointer on rows with no ratio, which is right for a chip tucked
                beside a number and wrong for a cell under a heading — a column
                that is blank until you hover is not a column. */}
            {auto.rule ? auto.rule.toLowerCase() : 'per course'}
          </button>
        </div>
        {/* The number and the bin share this cell, one at a time: the figure
            until the row is pointed at, the way out of the row while it is.
            They were drawn on top of each other before — a bin with a strip of
            backdrop, half over a "20" that was still there underneath. */}
        <div className="shrink-0 w-16 flex items-baseline justify-end tabular-nums">
          <span className="text-xs pr-0.5 text-zinc-700">×</span>
          {/* The box holds the override and nothing else. What the rule works
              out sits in it as the placeholder — greyed, because it is what the
              row says while the box is empty — so typing is how you overrule it
              and clearing is how you take that back. There is no third state to
              get into and no button to find. */}
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
            className={`w-11 bg-transparent border rounded px-1 py-0.5 text-xs text-right font-semibold focus:bg-zinc-900 focus:outline-none transition-colors ${
              qty.overridden
                ? 'border-zinc-700 text-amber-300/90 hover:border-zinc-600 focus:border-zinc-500'
                : 'border-transparent text-teal-300 placeholder:text-teal-300/80 hover:border-zinc-800 focus:border-zinc-600'
            }`}
          />
        </div>
        <button
          onClick={() => {
            // The same mark closes an editor everywhere else on the site, so
            // this one asks first — and it takes the row's quantity rule and
            // any models named on it along with the name.
            if (!confirm(`Take “${e.r.name}” off this list?`)) return
            apply(
              (es) => es.filter((x) => x.id !== e.id),
              () => onRow(e.id, (id) => removeGearEntry(id, instanceId))
            )
          }}
          title={`Take “${e.r.name}” off this list`}
          // In a gutter of its own, past the numbers.
          //
          // It has been three things: a permanent cell, which pushed both
          // number columns in by its width; then an overlay on the number,
          // which meant hovering a row to reach the bin hid the figure you
          // were reading — and drew the bin on top of it besides. The row
          // reserves the space instead. The columns keep their alignment, the
          // number is never covered, and the bin still waits for the pointer,
          // because a bin lit on every row is twenty invitations to delete
          // something down a list you are only reading.
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-600 hover:text-red-400 transition-opacity ${
            dragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <TrashIcon />
        </button>
      </div>

      {/* How many this row counts by, said as the sentence it is: a number, and
          what that number is counted against. Two boxes and a unit cover every
          row on every list — one each, one between six, forty feet for the
          course — where a row of named answers only ever covers the ones
          whoever wrote them happened to think of.

          Per course is a unit, not the absence of one. "Fixed number" was a
          label for a row that had no rule, which is why it read as jargon
          sitting next to a number: what the row means is one Sked for the
          course, and that is a thing you can say. */}
      {ratioFor === e.id && (() => {
        const per = e.qty_per_students
        // A row with no rule but a plain number in its box already says how
        // many for the course, so the panel opens on what the row says rather
        // than on a 1 that contradicts it.
        const typed = e.quantity?.trim() ?? ''
        const each = Number(e.qty_each ?? (/^\d+(\.\d+)?$/.test(typed) ? Number(typed) : 1))
        const byCourse = per === null
        const total = byCourse ? each : students ? Math.ceil(students / per) * each : null
        return (
          <div className="relative mt-2 p-2 pr-8 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-400">
              <span>Take</span>
              <input
                key={`each:${each}:${per}`}
                type="number" min="1" step="1" defaultValue={each}
                aria-label="How many"
                onBlur={(ev) => {
                  const v = Number(ev.target.value)
                  if (!(v > 0) || v === each) return
                  setRatio(e.id, { each: v, perStudents: per })
                }}
                className={`w-16 ${input} py-1`}
              />
              <span>per</span>
              {/* The denominator has nowhere to go when the unit is the course
                  — there is only ever one of those — so it leaves rather than
                  sitting there holding a number that counts nothing. */}
              {!byCourse && (
                <input
                  key={`per:${each}:${per}`}
                  type="number" min="1" step="1" defaultValue={per}
                  aria-label="Per how many students"
                  onBlur={(ev) => {
                    const v = Number(ev.target.value)
                    if (!(v > 0) || v === per) return
                    setRatio(e.id, { each, perStudents: v })
                  }}
                  className={`w-16 ${input} py-1`}
                />
              )}
              <select
                value={byCourse ? 'course' : 'students'}
                onChange={(ev) => setRatio(e.id, {
                  each,
                  // Coming back to students, one each is where every personal
                  // row starts and the answer nine times in ten.
                  perStudents: ev.target.value === 'course' ? null : per ?? 1,
                })}
                aria-label="Counted per"
                className={`${input} py-1`}
              >
                <option value="students">{(per ?? 1) === 1 ? 'student' : 'students'}</option>
                <option value="course">course</option>
              </select>
            </div>

            {/* What the sentence above comes to, and nothing else.
                It used to spell out the whole arithmetic and then explain where
                the roster is set — a paragraph under two boxes, read once and
                then read past forever, in a panel whose entire job is to show
                one number. The why is behind the icon. */}
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              {!students && !byCourse ? (
                <>No roster yet</>
              ) : (
                <>
                  <span className="font-semibold text-teal-300">{total}</span>
                  {byCourse ? 'for the course' : 'for this course'}
                </>
              )}
              <InfoHint
                below
                text={byCourse
                  ? 'A number the roster does not touch — the same on the student\u2019s sheet and the course\u2019s.'
                  : 'Worked out from the maximum on the Details tab. Change it and every quantity on every list follows.'}
              />
            </p>
            {qty.overridden && (
              <p className="text-[11px] text-amber-300/80">
                Set to {qty.text} for this course, over its rule. Clear the box to hand it back.
              </p>
            )}
            {/* The way out, top right, where every window anyone has ever
                closed puts it — see components/CloseButton. */}
            <CloseButton
              onClick={() => setRatioFor(null)}
              label="Done"
              className="absolute top-1 right-1"
            />
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
          <div className="relative mt-2 p-2 pr-8 bg-zinc-900 rounded border border-zinc-800 space-y-2">
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
  // Where the thing you just saved went. Saving one used to end in silence:
  // the template existed, on a shelf this page never named, and the first
  // thing you usually want is to rename or retag it.
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null)

  // Overwriting a template built for the other audience is nearly always a
  // mis-click, so those aren't offered.
  const same = templates.filter((t) => t.audience === list.audience)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        onClick={() => {
          const name = prompt('Save this list to the library as a new template. Name it:', list.name)
          if (name) run(async () => {
            const made = await copyGearList(list.id, { isTemplate: true, name, courseType })
            setSaved({ id: made.id, name })
          })
        }}
        disabled={busy}
        className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        + Save as a new template
      </button>

      {saved && (
        <span className="text-zinc-500">
          Saved as &ldquo;{saved.name}&rdquo; —{' '}
          <Link
            href={templateHref('gear', saved.id)}
            target="_blank"
            className="text-zinc-300 hover:text-white underline underline-offset-2 inline-flex items-center gap-1"
          >
            open it on the shelf<NewTabIcon />
          </Link>
        </span>
      )}

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

      <Link
        href={templateShelfHref('gear')}
        target="_blank"
        className="text-zinc-600 hover:text-zinc-300 transition-colors ml-auto inline-flex items-center gap-1"
      >
        Manage templates<NewTabIcon />
      </Link>
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
  listId, catalog, childrenOf, onPick, onClose, busy, run, input,
}: {
  listId: string
  catalog: GearItem[]
  childrenOf: Map<string, GearItem[]>
  /** What was chosen. Placing it is the caller's job — see `add` below. */
  onPick: (picked: { gearItemId?: string | null; name?: string; label?: string }) => void
  onClose: () => void
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState<string | null>(null)
  // No category is preselected. A select that opens on Anchors is an answer
  // nobody gave, and the button beside it files the thing under it — new gear
  // ended up in Anchors because the form was already holding one.
  const [newCategory, setNewCategory] = useState<string>('')
  // Three fields, two of them optional, instead of a select asking whether the
  // thing is a model of something. Empty item = whatever was typed in the
  // search box; empty brand and model = it goes in generic. Naming the same
  // generic as one this category already holds files it under that one rather
  // than making a second.
  const [newGeneric, setNewGeneric] = useState('')
  const [newItemBrand, setNewItemBrand] = useState('')
  const [newModel, setNewModel] = useState('')

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

  function add(itemId: string | null, name?: string, label?: string) {
    // Picked, not placed. Where it goes is the next question, asked once the
    // thing being placed is known — choosing a destination for an item you have
    // not chosen yet is answering in the wrong order, and it was silent besides:
    // the row landed somewhere off screen and the panel looked untouched.
    onPick({ gearItemId: itemId, name, label })
    setQuery('')
  }

  return (
    <div className="p-3 bg-zinc-900 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalog"
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
        <CloseButton onClick={onClose} label="Done (Esc)" className="shrink-0" />
      </div>

      {/* Fourteen categories laid out as chips took two full lines above the
          results, for a control that is the second way in — typing is the
          first. One select, the width of its longest name. */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-widest text-zinc-600" htmlFor={`cat-${listId}`}>
          Browse
        </label>
        <select
          id={`cat-${listId}`}
          value={browsing ?? ''}
          disabled={searching}
          onChange={(ev) => setBrowsing(ev.target.value || null)}
          className={`${input} py-1 text-xs ${searching ? 'opacity-40' : ''}`}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
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
                onClick={() => add(t.id, undefined, t.name)}
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
                      onClick={() => add(m.id, undefined, productName(m))}
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
                ? 'Not here? Add it to the catalog.'
                : 'Nothing matches. Add it to the catalog:'}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              {/* Category first, because it decides which generics the item
                  field offers: every type in the catalog under every category
                  was a list that never changed and so never said which of them
                  fitted. */}
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Category</label>
                <CategorySelect
                  value={newCategory}
                  options={allCategories}
                  emptyLabel="— pick one —"
                  onChange={(next) => setNewCategory(next)}
                  className={`${input} w-40`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Item</label>
                {/* A list, not a select: the generics this category holds are
                    offered, and anything else can be typed. Left empty it is
                    whatever was searched for. */}
                <input
                  list={`generics-${listId}`}
                  value={newGeneric}
                  onChange={(e) => setNewGeneric(e.target.value)}
                  placeholder={query.trim()}
                  className={`${input} w-40`}
                />
                <datalist id={`generics-${listId}`}>
                  {typesHere.map((t) => <option key={t.id} value={t.name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Brand <span className="text-zinc-600">— optional</span></label>
                <input
                  value={newItemBrand}
                  onChange={(e) => setNewItemBrand(e.target.value)}
                  placeholder="e.g. Petzl"
                  className={`${input} w-32`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Model <span className="text-zinc-600">— optional</span></label>
                <input
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="e.g. Grigri"
                  className={`${input} w-32`}
                />
              </div>
              <button
                onClick={() => run(async () => {
                  const generic = newGeneric.trim() || query.trim()
                  const brand = newItemBrand.trim()
                  const model = newModel.trim()
                  // Typing the name of a generic this category already has is
                  // filing under it, not making a rival with the same name.
                  const held = typesHere.find((t) => t.name.toLowerCase() === generic.toLowerCase())
                  let picked = held?.id ?? null
                  let label = held?.name ?? generic
                  if (!brand && !model) {
                    if (!picked) {
                      picked = unwrap(await upsertGearItem({ name: generic, category: newCategory })).id
                    }
                  } else {
                    // A brand or a model means a product, and a product hangs
                    // under a generic — made here if it does not exist yet, so
                    // what reads as one add is two writes.
                    if (!picked) {
                      picked = unwrap(await upsertGearItem({ name: generic, category: newCategory })).id
                    }
                    const named = model || generic
                    picked = unwrap(await upsertGearItem({
                      name: named,
                      brand: brand || null,
                      category: newCategory,
                      parentId: picked,
                    })).id
                    label = productName({ brand: brand || null, name: named })
                  }
                  // Straight onto the list, the same as a catalog pick — the
                  // destination was answered at the top of the panel.
                  onPick({ gearItemId: picked, label })
                  setQuery('')
                  setNewCategory(''); setNewGeneric(''); setNewItemBrand(''); setNewModel('')
                })}
                disabled={busy || !newCategory || !(newGeneric.trim() || query.trim())}
                title={newCategory ? undefined : 'Pick a category first'}
                className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                Add to the catalog
              </button>
              <button
                onClick={() => add(null, query, query.trim())}
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
