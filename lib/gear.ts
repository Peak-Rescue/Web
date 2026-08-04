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
export const GEAR_CATEGORIES = [
  'Personal protective',
  'Rope hardware',
  'Slings and webbing',
  'Ropes and cord',
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
}

// Matches a typed query against a name, its synonyms, and — for a type — the
// models under it. Typing "grigri" has to find "Descent device", or the person
// typing it concludes we don't have one and adds a duplicate.
export function matchesGear(item: CatalogItem, query: string, children: CatalogItem[] = []): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    item.name,
    ...(item.aliases ?? []),
    item.category ?? '',
    item.recommended ?? '',
    ...children.flatMap((c) => [c.name, ...(c.aliases ?? [])]),
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
