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

// ─── Choices ────────────────────────────────────────────────────────────────
//
// A choice is "bring one of these", and each alternative can be more than one
// item: (wetsuit AND rain jacket) OR drysuit. Like a section, it is not a row
// of its own — it's the agreement between the entries carrying its name.
//
// Grouped here rather than in each renderer because the editor and the course
// page have to agree on what a choice is down to the ordering, and the two
// drifting apart would show up as a student list that doesn't match the one
// that was built.

export type ChoiceFields = {
  // An opaque key. Nobody reads it — the heading students see is the label,
  // which is optional, because "bring one of" over a wetsuit and a drysuit
  // already says everything a title would.
  option_group: string | null
  option_branch: number | null
  option_label?: string | null
  sort_order: number
}

export type ChoiceBlock<T> = { branch: number; rows: T[] }

export type Placed<T> =
  | { kind: 'item'; row: T }
  | { kind: 'choice'; key: string; label: string | null; options: ChoiceBlock<T>[] }

// One branch is a line made of several slots — "rope and rope bag". Two or
// more is a choice between such lines. The same structure either way; only the
// chrome differs, so both renderers ask this rather than each deciding.
export function isChoice<T>(block: { options: ChoiceBlock<T>[] }): boolean {
  return block.options.length > 1
}

// A section's rows as they print: plain gear in its own order, and each choice
// as one block sitting where its first row sat. Anchoring the block to its
// first row is what keeps a choice from jumping to the end of the section the
// moment someone reorders inside it.
export function placeChoices<T extends ChoiceFields>(rows: T[]): Placed<T>[] {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order)
  const out: Placed<T>[] = []
  const blocks = new Map<string, Extract<Placed<T>, { kind: 'choice' }>>()

  for (const row of ordered) {
    const key = row.option_group
    if (!key || row.option_branch === null) {
      out.push({ kind: 'item', row })
      continue
    }
    let block = blocks.get(key)
    if (!block) {
      block = { kind: 'choice', key, label: row.option_label ?? null, options: [] }
      blocks.set(key, block)
      out.push(block)
    }
    // The label lives on every row of the choice, so the first one that has it
    // wins — a row added before the heading was typed carries null.
    if (!block.label && row.option_label) block.label = row.option_label
    const branch = row.option_branch
    const option = block.options.find((o) => o.branch === branch)
    if (option) option.rows.push(row)
    else block.options.push({ branch, rows: [row] })
  }

  // Branches print in their own order, not in the order the first row of each
  // happened to be added — otherwise dragging a row about silently reshuffles
  // which alternative reads as the first one.
  for (const block of blocks.values()) block.options.sort((a, b) => a.branch - b.branch)
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
  'gear_item_id, name, note, url, section, group_type, quantity, sort_order, ' +
  'option_group, option_branch, option_label'

// What the editor loads: the columns plus the row's own id, which it needs to
// address a row it is about to change.
export const GEAR_ENTRIES_SELECT =
  `gear_list_entries(id, ${GEAR_ENTRY_COLUMNS}, gear_entry_options(gear_item_id, sort_order))`

// What a copy carries: the same columns without the ids, because the rows it
// creates get their own.
export const GEAR_ENTRIES_COPY_SELECT =
  `gear_list_entries(${GEAR_ENTRY_COLUMNS}, gear_entry_options(gear_item_id, sort_order))`
