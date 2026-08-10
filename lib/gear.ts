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
export const GEAR_CATEGORIES = [
  'Personal protective',
  'Rope hardware',
  'Sewn slings and cord',
  'Rope, cord and webbing',
  'Environmental layers',
  'Packs and carry',
  'Rescue and access',
  'Tactical',
] as const

export type GearCategory = (typeof GEAR_CATEGORIES)[number]

export type CatalogItem = {
  id: string
  name: string
  info: string | null
  recommended: string | null
  url: string | null
  category: string | null
  parent_id: string | null
  aliases: string[]
  // Only a product has one — a type is what a list needs, and nobody makes a
  // "brake-assist descender". Stored apart from the name so it can be asked
  // about; joined back together everywhere the gear is read.
  brand?: string | null
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
    item.recommended ?? '',
    // Brand lives in its own column now, so "Petzl" is no longer inside any
    // name — without it here, searching a maker would find nothing.
    ...children.flatMap((c) => [c.name, c.brand ?? '', productName(c), ...(c.aliases ?? [])]),
  ]
  return haystack.some((h) => h.toLowerCase().includes(q))
}

// How a line reads once the type, the chosen models and any per-list override
// are resolved: "Descent device — Petzl Rig or Grigri".
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
