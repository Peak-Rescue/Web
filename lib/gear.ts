// Shared shape for the gear catalog.
//
// Gear is two levels on purpose. A *type* is the thing the list actually needs
// — "Descent device" — and a *model* is one product that satisfies it. Lists
// name whichever level they mean: the type when any will do, a model when it
// has to be that one, or several models when more than one works.

// Free-text categories drifted immediately: a flat "Personal kit" appeared
// beside "Rope hardware" and "Personal protective", and "Team gear" smuggled
// personal-vs-group — which is already its own axis — into the category. Fixed
// list, chosen once.
// The sling/rope split is by what you buy, not by what it's made of. A sewn
// sling, a sewn cordelette and a VT prusik arrive finished and are used as
// they come; rope, cord and tubular webbing arrive on a spool and get cut to
// length. "Slings and webbing" cut across that — it held sewn slings next to
// the 20 ft of tubular webbing you cut yourself.
// A category says what a thing *is*, never what it is for. "Tactical" and
// "Rescue and access" were the second kind, and both became grab bags because
// of it — a drone and a knife have nothing in common as objects. What gear is
// *for* is a discipline tag now, so a tactical helmet can be head protection
// by kind and tactical by purpose instead of having to pick one.
//
// Named by the job each does, because "Rope hardware" covered eleven types
// doing five unrelated jobs and told you none of them.
export const GEAR_CATEGORIES = [
  'Rope and cord',
  'Slings and prusiks',
  'Connectors',
  'Descent and belay',
  'Ascenders and rope grabs',
  'Pulleys',
  // What you build the anchor out of — pickets, bolts and hangers, anchor
  // plates, straps. Not the slings and connectors used to rig it: those are
  // what they are wherever they end up, and a category says what a thing is.
  'Anchors',
  'Harness and personal rigging',
  'Helmets and protection',
  'Clothing and exposure',
  'Packs and carry',
  'Lighting and optics',
  'Patient handling and access',
  'Mission kit',
] as const

export type GearCategory = (typeof GEAR_CATEGORIES)[number]

// What a piece of gear IS. Notes about it — spec, quantity, condition — are
// not here on purpose: those are answers to "on this course", and the catalog
// is the one place that doesn't know which course is asking. They live on the
// list entry.
export type CatalogItem = {
  id: string
  name: string
  // The one piece of prose the catalog owns: what this gear is and how we
  // specify it, true on every course. Per-course wording is the list entry's
  // note, which is a different field with a different owner.
  info?: string | null
  url: string | null
  category: string | null
  parent_id: string | null
  aliases: string[]
  // Only a product has one — a type is what a list needs, and nobody makes a
  // "brake-assist descender". Stored apart from the name so it can be asked
  // about; joined back together everywhere the gear is read.
  brand?: string | null
  // What the gear is FOR, from the capability vocabulary. Category says what
  // it IS — the two are different axes and were tangled together until now.
  disciplines?: string[]
}

// Server actions hand back a message rather than throwing it, because Next
// replaces a thrown error's text in production. Turning it back into a throw
// here — on the client — puts it where the catch that shows it already is.
export function unwrap<T extends object>(result: T | { error: string }): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error)
  }
  return result as T
}

// How a product is written wherever it is read as one thing: "Petzl Grigri".
// The catalog splits the two into columns; everything else puts them back.
export function productName(item: { brand?: string | null; name: string }): string {
  const brand = item.brand?.trim()
  return brand ? `${brand} ${item.name}` : item.name
}

// Matches a typed query against a name, its synonyms, and — for a type — the
// models under it. Typing "grigri" has to find "Descent device", or the person
// typing it concludes we don't have one and adds a duplicate.
export function matchesGear(item: CatalogItem, query: string, children: CatalogItem[] = []): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    item.name,
    item.brand ?? '',
    ...(item.aliases ?? []),
    item.category ?? '',
    // Brand lives in its own column now, so "Petzl" is no longer inside any
    // name — without it here, searching a maker would find nothing.
    ...children.flatMap((c) => [c.name, c.brand ?? '', productName(c), ...(c.aliases ?? [])]),
  ]
  return haystack.some((h) => h.toLowerCase().includes(q))
}

// ─── Sets: "bring both" and "bring one of" ──────────────────────────────────
//
// A row says how it is joined to the row immediately above it, and nothing
// else. A set is then a run of adjacent rows connected by those joiners.
//
// The relationship is the unit, not a container the rows point at. An operator
// with no row above it refers to nothing and is ignored, so there is no key to
// dangle, no alternative to be alone on, and nothing that can exist before it
// has contents — which is the entire family of bugs the old container model
// kept producing.
//
// AND binds tighter than OR, the way it reads out loud: a run splits into
// alternatives at each OR, and each alternative is the rows AND-ed together
// inside it. That is exactly the shape the old two columns could hold — an
// alternative is a flat line of slots, and nothing nests deeper.
//
//   Wetsuit                    ┐ one alternative
//      and     Rain jacket     ┘
//      or      Drysuit         ← the other
//
// Parsed here rather than in each renderer because the editor, the portal and
// the printed sheet have to agree down to the ordering: the two drifting apart
// shows up as a student list that doesn't match the one that was built.

export type Joiner = 'and' | 'or' | 'or_if_needed'

export type JoinerFields = {
  // How this row is joined to the one above it. Null is an ordinary required
  // row, which is nearly all of them.
  joined_above?: Joiner | null
  sort_order: number
}

// One alternative: the rows that go together, and whether it is offered as an
// equal or as a fallback. Preference is already implicit in the order — the
// alternative written first is the one we recommend — and `ifNeeded` is that
// said out loud, for when the second choice is acceptable rather than equal.
export type Alternative<T> = { rows: T[]; ifNeeded: boolean }

export type Placed<T> =
  | { kind: 'item'; row: T }
  | { kind: 'set'; rows: T[]; alternatives: Alternative<T>[] }

// Two or more alternatives is a choice; one is a line of things that go
// together. Same structure, different claim, so every renderer asks this rather
// than each deciding what counts.
export function isChoice<T>(set: { alternatives: Alternative<T>[] }): boolean {
  return set.alternatives.length > 1
}

// A section's rows as they read: ordinary gear on its own, and each run of
// joined rows as one set sitting exactly where it sits. Pass the rows of one
// side of one section — the joiner on the first row of those refers to nothing
// above it and is ignored, which is what makes a stranded operator impossible
// rather than merely unlikely.
export function placeSets<T extends JoinerFields>(rows: T[]): Placed<T>[] {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order)
  const out: Placed<T>[] = []

  for (let i = 0; i < ordered.length; ) {
    // The run is this row plus everything that says it belongs with what came
    // before it.
    let end = i + 1
    while (end < ordered.length && ordered[end].joined_above) end += 1

    const run = ordered.slice(i, end)
    if (run.length === 1) {
      out.push({ kind: 'item', row: run[0] })
      i = end
      continue
    }

    // Split at each OR. Everything else in a run is an AND, so it joins the
    // alternative being built rather than starting a new one.
    const alternatives: Alternative<T>[] = [{ rows: [run[0]], ifNeeded: false }]
    for (const row of run.slice(1)) {
      const joiner = row.joined_above
      if (joiner === 'or' || joiner === 'or_if_needed') {
        alternatives.push({ rows: [row], ifNeeded: joiner === 'or_if_needed' })
      } else {
        alternatives[alternatives.length - 1].rows.push(row)
      }
    }
    out.push({ kind: 'set', rows: run, alternatives })
    i = end
  }

  return out
}

// How a line reads once the item and the products narrowing it are resolved:
// "Descent device — Petzl Rig or Grigri". Products on one slot are always a
// disjunction: they are answers to "what satisfies this", and two things you
// both need are two slots, so each can carry its own quantity.
export function gearLabel(
  base: string,
  options: { name: string }[]
): { title: string; detail: string | null } {
  if (options.length === 0) return { title: base, detail: null }
  const names = options.map((o) => o.name)
  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  return { title: base, detail: joined }
}

// ─── Reading a list ─────────────────────────────────────────────────────────
//
// The columns a gear row is made of, written once. Four places load these rows
// — the course page, the gear shelf, the student's portal, and the copy that
// puts one list onto another — and none of them can check the string it sends
// against the shape it casts the answer to, because the Supabase client has no
// generated types to check against.
//
// So a column added here and forgotten in one of those selects arrives as
// undefined and is silently treated as absent. That is exactly how choices
// stopped working in both editors: `option_group` was written to the database
// and never asked for on the way back, so every alternative read as ordinary
// required gear the moment the page refreshed.
export const GEAR_ENTRY_COLUMNS =
  'gear_item_id, name, note, url, section, group_type, quantity, sort_order, joined_above'

// What the editor loads: the columns plus the row's own id, which it needs to
// address a row it is about to change.
export const GEAR_ENTRIES_SELECT =
  `gear_list_entries(id, ${GEAR_ENTRY_COLUMNS}, gear_entry_options(gear_item_id, sort_order))`

// What a copy carries: the same columns without the ids, because the rows it
// creates get their own.
export const GEAR_ENTRIES_COPY_SELECT =
  `gear_list_entries(${GEAR_ENTRY_COLUMNS}, gear_entry_options(gear_item_id, sort_order))`
