// The client list: a tree of bins, clients and teams (see migration 252).
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
}

export type ClientNode = ClientRow & { children: ClientNode[]; depth: number }

/** Bins in their hand-set order, everything under them by name. */
export function buildClientTree(rows: ClientRow[]): ClientNode[] {
  const byParent = new Map<string | null, ClientRow[]>()
  for (const r of rows) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r])
  // Numeric, so the 23 STS comes before the 131 RQS.
  const byName = (a: ClientRow, b: ClientRow) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const grow = (parent: string | null, depth: number): ClientNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => (parent === null ? a.position - b.position || byName(a, b) : byName(a, b)))
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

/** "PJs › 24 STS › Red Team" */
export function clientPath(rows: ClientRow[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parts: string[] = []
  for (let r = byId.get(id); r; r = r.parent_id ? byId.get(r.parent_id) : undefined) parts.unshift(r.name)
  return parts.join(' › ')
}

/** Clients anywhere in the tree already called `name`, by name or alias.
    Asked before a new client is made, because the usual duplicate is the
    same unit filed under a different bin by someone who guessed differently. */
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
