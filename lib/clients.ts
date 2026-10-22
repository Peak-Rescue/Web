// The client list: sectors and subsectors (groupings), and the clients and
// teams filed in them (see migrations 252 and 253).
//
// It is a filing system, not an org chart. What matters is that the client a
// course belongs to is easy to find, so the same team is not created twice
// under two names. Hence the search here reads aliases as well as names: the
// person booking types what they call the client, which is rarely its name.

export type ClientRow = {
  id: string
  parent_id: string | null
  name: string
  aliases: string[]
  note: string | null
  position: number
  /** A sector or subsector — a grouping, never something a course attaches to. */
  is_group: boolean
  created_at?: string
}

/** The columns a ClientRow needs, for every query that loads the tree. */
export const CLIENT_COLUMNS = 'id, parent_id, name, aliases, note, position, is_group, created_at' as const

/** How a client reads on a course: "24 STS – Red Team". The client and the
    clients above it, stopping at the first sector or subsector. Mirrors the
    database's client_label(), which is what actually writes course names. */
export function clientLabel(rows: ClientRow[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parts: string[] = []
  for (let r = byId.get(id); r && !r.is_group; r = r.parent_id ? byId.get(r.parent_id) : undefined) parts.unshift(r.name)
  return parts.join(' – ')
}

/** A client and everything it is filed under. Material belonging to any of
    these belongs to a course for that client: the 24 STS's SOP is Red Team's
    too, and a sector's material is every client's in it. */
export function withAncestors(rows: Pick<ClientRow, 'id' | 'parent_id'>[], id: string | null | undefined): Set<string> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out = new Set<string>()
  for (let r = id ? byId.get(id) : undefined; r && !out.has(r.id); r = r.parent_id ? byId.get(r.parent_id) : undefined) out.add(r.id)
  return out
}

/** The tree as a dropdown, the way the library's Type field reads: one group
    per sector, headed in capitals, its contents indented beneath it. A
    sector's heading cannot be picked in a native select, so each group opens
    with "All of …", which can. A team reads "24 STS – Red Team", so the box
    still says which Red Team once it is closed. */
export type ClientSelectGroup = { sector: string; options: { id: string; label: string; depth: number }[] }
export function clientSelectGroups(rows: ClientRow[]): ClientSelectGroup[] {
  const tree = buildClientTree(rows)
  const out: ClientSelectGroup[] = []
  const walk = (n: ClientNode, into: ClientSelectGroup['options']) => {
    into.push({
      id: n.id,
      label: n.is_group ? `All of ${n.name}` : clientLabel(rows, n.id),
      depth: n.depth - 1,
    })
    n.children.forEach((c) => walk(c, into))
  }
  for (const sector of tree.filter((n) => n.is_group)) {
    const options: ClientSelectGroup['options'] = [{ id: sector.id, label: `All of ${sector.name}`, depth: 0 }]
    sector.children.forEach((c) => walk(c, options))
    out.push({ sector: sector.name, options })
  }
  return out
}

/** Every place a new client could be filed: any sector, subsector or client. */
export function placeOptions(rows: ClientRow[]): { id: string; path: string }[] {
  return rows
    .map((r) => ({ id: r.id, path: clientPath(rows, r.id) }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}

export type ClientNode = ClientRow & { children: ClientNode[]; depth: number }

/** Sectors in their hand-set order; under any group, its subsectors before
    its clients, each by name. Top-level rows that are not groups are the
    clients nobody has filed yet. */
export function buildClientTree(rows: ClientRow[]): ClientNode[] {
  const byParent = new Map<string | null, ClientRow[]>()
  for (const r of rows) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r])
  // Numeric, so the 23 STS comes before the 131 RQS.
  const byName = (a: ClientRow, b: ClientRow) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const grow = (parent: string | null, depth: number): ClientNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) =>
        parent === null
          ? a.position - b.position || byName(a, b)
          : Number(b.is_group) - Number(a.is_group) || byName(a, b)
      )
      .map((r) => ({ ...r, depth, children: grow(r.id, depth + 1) }))
  return grow(null, 0)
}

const norm = (s: string) => s.trim().toLowerCase()

/** Every word of the query appears in the client's name or one of its
    aliases. "cag pj" finds the 24 STS because CAG and PJ are both on it. */
export function clientMatches(row: Pick<ClientRow, 'name' | 'aliases'>, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [row.name, ...row.aliases].map(norm).join(' | ')
  return words.every((w) => hay.includes(w))
}

/** The ids of a node and everything beneath it — what a move must not land in. */
export function subtreeIds(rows: ClientRow[], rootId: string): Set<string> {
  const out = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const r of rows) {
      if (r.parent_id && out.has(r.parent_id) && !out.has(r.id)) {
        out.add(r.id)
        grew = true
      }
    }
  }
  return out
}

/** Why `id` cannot be filed under `parentId` (null = top level), or null if
    it can. Read by the drag to light only the places a drop would land, and
    again by the server, which is the one that counts. */
export function placementProblem(rows: ClientRow[], id: string, parentId: string | null): string | null {
  if (parentId && subtreeIds(rows, id).has(parentId)) return 'It cannot go inside itself'
  const node = rows.find((r) => r.id === id)
  const parent = parentId ? rows.find((r) => r.id === parentId) : null
  if (parentId && !parent) return 'That place no longer exists — reload the page'
  if (node?.is_group && parent && !parent.is_group) return 'A sector cannot go inside a client'
  return null
}

/** "Military › PJs › 24 STS › Red Team" */
export function clientPath(rows: ClientRow[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parts: string[] = []
  for (let r = byId.get(id); r; r = r.parent_id ? byId.get(r.parent_id) : undefined) parts.unshift(r.name)
  return parts.join(' › ')
}

/** Clients anywhere in the tree already called `name`, by name or alias.
    Asked before a new client is made, because the usual duplicate is the
    same unit filed under a different sector by someone who guessed differently. */
export function sameNamedClients(rows: ClientRow[], name: string, exceptId?: string): ClientRow[] {
  const n = norm(name)
  if (!n) return []
  return rows.filter((r) => r.id !== exceptId && (norm(r.name) === n || r.aliases.some((a) => norm(a) === n)))
}

/** Aliases as typed into one comma-separated box: trimmed, de-duplicated
    ignoring case, and never repeating the client's own name. */
export function parseAliases(text: string, name: string): string[] {
  const seen = new Set([norm(name)])
  const out: string[] = []
  for (const a of text.split(',')) {
    const t = a.trim()
    if (t && !seen.has(norm(t))) {
      seen.add(norm(t))
      out.push(t.slice(0, 120))
    }
  }
  return out
}
