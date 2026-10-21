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

/** Only an empty client can go. Something filed under it has to be moved or
    deleted first, deliberately, rather than vanish with it. */
export async function deleteClient(id: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { count } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('parent_id', id)
  if (count) return { ok: false, error: 'Move or delete what is under it first' }
  const { error } = await admin.from('clients').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not delete it — please try again' }
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
