'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { clientPath, parseAliases, placementProblem, sameNamedClients, type ClientRow } from '@/lib/clients'

type Result =
  | { ok: true }
  | { ok: false; error: string }
  /** The name is already in use somewhere else in the tree. Sent back rather
      than refused, because a second "Ski Patrol" under a different resort is
      legitimate — the person adding it decides, having seen where the other
      one is. */
  | { ok: false; similar: string[] }

const done = (): Result => {
  revalidatePath('/admin/clients')
  return { ok: true }
}

async function allClients(admin: Awaited<ReturnType<typeof requireAdminUser>>['admin']) {
  const { data } = await admin.from('clients').select('id, parent_id, name, aliases, note, position, is_group')
  return (data ?? []) as ClientRow[]
}

// The unique index catches a repeat under one parent; this turns its error
// into something a person can act on.
const nameTaken = (code: string | undefined) =>
  code === '23505' ? 'There is already one with that name here' : 'Something went wrong — please try again'

/** A new sector (top level) or a new client. A client starts unfiled — no
    parent — and is dragged to where it belongs; deciding where a client goes
    is easier looking at the tree than at a form. */
export async function addClient(
  input: { name: string; aliases: string; note: string; isGroup: boolean },
  confirmed = false
): Promise<Result> {
  const { user, admin } = await requireAdminUser()
  const name = input.name.trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Give it a name' }

  const rows = await allClients(admin)
  if (!confirmed && !input.isGroup) {
    const similar = sameNamedClients(rows.filter((r) => !r.is_group), name)
    if (similar.length > 0) return { ok: false, similar: similar.map((r) => clientPath(rows, r.id)) }
  }

  const sectors = rows.filter((r) => !r.parent_id && r.is_group)
  const { error } = await admin.from('clients').insert({
    parent_id: null,
    is_group: input.isGroup,
    name,
    aliases: input.isGroup ? [] : parseAliases(input.aliases, name),
    note: input.note.trim().slice(0, 500) || null,
    position: input.isGroup ? Math.max(0, ...sectors.map((r) => r.position)) + 1 : 0,
    created_by: user.id,
  })
  if (error) return { ok: false, error: nameTaken(error.code) }
  return done()
}

export async function updateClient(
  id: string,
  input: { name: string; aliases: string; note: string }
): Promise<Result> {
  const { admin } = await requireAdminUser()
  const name = input.name.trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Give it a name' }
  const { error } = await admin
    .from('clients')
    .update({ name, aliases: parseAliases(input.aliases, name), note: input.note.trim().slice(0, 500) || null })
    .eq('id', id)
  if (error) return { ok: false, error: nameTaken(error.code) }
  return done()
}

/** File something somewhere else, taking everything under it along. The drag
    and the Move fallback both end here, and the rules are checked here again
    whatever the screen allowed. */
export async function moveClient(id: string, parentId: string | null): Promise<Result> {
  const { admin } = await requireAdminUser()
  const rows = await allClients(admin)
  const problem = placementProblem(rows, id, parentId)
  if (problem) return { ok: false, error: problem }
  const node = rows.find((r) => r.id === id)
  if (!node) return { ok: false, error: 'It no longer exists — reload the page' }
  if (node.parent_id === parentId) return done()
  // A group moved to the top level becomes the last sector rather than
  // sharing a position with one.
  const position =
    node.is_group && parentId === null
      ? Math.max(0, ...rows.filter((r) => !r.parent_id && r.is_group).map((r) => r.position)) + 1
      : node.position
  const { error } = await admin.from('clients').update({ parent_id: parentId, position }).eq('id', id)
  if (error) return { ok: false, error: nameTaken(error.code) }
  return done()
}

/** Remove a sector, subsector or client. Whatever is filed under it is never
    deleted with it: it moves, all at once, to `rehomeTo` — so retiring a
    sector is one step rather than re-filing each client by hand. `undefined`
    means the caller expects it to be empty. */
export async function deleteClient(id: string, rehomeTo?: string | null): Promise<Result> {
  const { admin } = await requireAdminUser()
  const rows = await allClients(admin)
  const children = rows.filter((r) => r.parent_id === id)
  if (children.length > 0) {
    if (rehomeTo === undefined) return { ok: false, error: 'Say where what is under it should go' }
    for (const c of children) {
      const problem = placementProblem(rows, c.id, rehomeTo)
      if (problem) return { ok: false, error: `${c.name}: ${problem}` }
    }
    const { error: moveError } = await admin.from('clients').update({ parent_id: rehomeTo }).eq('parent_id', id)
    if (moveError) return { ok: false, error: nameTaken(moveError.code) }
  }
  const { error } = await admin.from('clients').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not delete it — please try again' }
  return done()
}

/** Swap a sector with its neighbour above or below. */
export async function shiftSector(id: string, direction: -1 | 1): Promise<Result> {
  const { admin } = await requireAdminUser()
  const sectors = (await allClients(admin))
    .filter((r) => !r.parent_id && r.is_group)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const i = sectors.findIndex((b) => b.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= sectors.length) return done()
  // Renumbered in full rather than swapping two values, so sectors that once
  // shared a position settle into a clean order the first time anyone moves one.
  const order = [...sectors]
  ;[order[i], order[j]] = [order[j], order[i]]
  for (const [k, b] of order.entries()) {
    if (b.position !== k + 1) await admin.from('clients').update({ position: k + 1 }).eq('id', b.id)
  }
  return done()
}

/** My own tick on a client, on or off. Nobody else's is touched. */
export async function setSignoff(id: string, on: boolean): Promise<Result> {
  const { user, admin } = await requireAdminUser()
  const { error } = on
    ? await admin.from('client_signoffs').upsert({ client_id: id, profile_id: user.id })
    : await admin.from('client_signoffs').delete().eq('client_id', id).eq('profile_id', user.id)
  if (error) return { ok: false, error: 'Could not save that — please try again' }
  return done()
}
