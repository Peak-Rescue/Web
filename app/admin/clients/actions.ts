'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { clientPath, parseAliases, sameNamedClients, subtreeIds, type ClientRow } from '@/lib/clients'

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
  const { data } = await admin.from('clients').select('id, parent_id, name, aliases, note, position')
  return (data ?? []) as ClientRow[]
}

// The unique index catches a repeat under one parent; this turns its error
// into something a person can act on.
const nameTaken = (code: string | undefined) =>
  code === '23505' ? 'There is already a client with that name here' : 'Something went wrong — please try again'

export async function addClient(
  parentId: string | null,
  input: { name: string; aliases: string; note: string },
  confirmed = false
): Promise<Result> {
  const { user, admin } = await requireAdminUser()
  const name = input.name.trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Give it a name' }

  const rows = await allClients(admin)
  if (!confirmed) {
    const similar = sameNamedClients(rows, name)
    if (similar.length > 0) return { ok: false, similar: similar.map((r) => clientPath(rows, r.id)) }
  }

  const position = parentId === null ? Math.max(0, ...rows.filter((r) => !r.parent_id).map((r) => r.position)) + 1 : 0
  const { error } = await admin.from('clients').insert({
    parent_id: parentId,
    name,
    aliases: parseAliases(input.aliases, name),
    note: input.note.trim().slice(0, 500) || null,
    position,
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

/** Re-file a client, taking everything under it along. Into itself or its
    own teams is the one move that cannot be allowed — it would cut the
    branch off the tree. */
export async function moveClient(id: string, parentId: string | null): Promise<Result> {
  const { admin } = await requireAdminUser()
  if (parentId) {
    const rows = await allClients(admin)
    if (subtreeIds(rows, id).has(parentId)) return { ok: false, error: 'It cannot go inside itself' }
  }
  const { error } = await admin.from('clients').update({ parent_id: parentId }).eq('id', id)
  if (error) return { ok: false, error: nameTaken(error.code) }
  return done()
}

/** Remove a client, bin or unit. Whatever is filed under it is never deleted
    with it: it moves, all at once, to `rehomeTo` — so taking away a bin is
    one step rather than re-filing each client by hand. `undefined` means the
    caller expects it to be empty. */
export async function deleteClient(id: string, rehomeTo?: string | null): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { count } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('parent_id', id)
  if (count) {
    if (rehomeTo === undefined) return { ok: false, error: 'Say where what is under it should go' }
    if (rehomeTo) {
      const rows = await allClients(admin)
      if (subtreeIds(rows, id).has(rehomeTo)) return { ok: false, error: 'Its clients cannot move inside it' }
    }
    const { error: moveError } = await admin.from('clients').update({ parent_id: rehomeTo }).eq('parent_id', id)
    if (moveError) return { ok: false, error: nameTaken(moveError.code) }
  }
  const { error } = await admin.from('clients').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not delete it — please try again' }
  return done()
}

/** Swap a bin with its neighbour above or below. */
export async function shiftBin(id: string, direction: -1 | 1): Promise<Result> {
  const { admin } = await requireAdminUser()
  const bins = (await allClients(admin))
    .filter((r) => !r.parent_id)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const i = bins.findIndex((b) => b.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= bins.length) return done()
  // Renumbered in full rather than swapping two values, so bins that once
  // shared a position settle into a clean order the first time anyone moves one.
  const order = [...bins]
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
