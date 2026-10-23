'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireAdminUser } from '@/lib/course-access'
import { syncCourseCalendar } from '@/lib/google-calendar'
import {
  CLIENT_COLUMNS,
  clientPath,
  parseAliases,
  placementProblem,
  sameNamedClients,
  subtreeIds,
  type ClientRow,
} from '@/lib/clients'

type Result =
  | { ok: true; id?: string }
  | { ok: false; error: string }
  /** The name is already in use somewhere else in the tree. Sent back rather
      than refused, because a second "Ski Patrol" under a different resort is
      legitimate — the person adding it decides, having seen where the other
      one is. */
  | { ok: false; similar: { id: string; path: string }[] }

type Admin = Awaited<ReturnType<typeof requireAdminUser>>['admin']

// A client's name is shown on every course filed under it, so a change here
// is a change on course pages and the course list as well as this one.
const done = (id?: string): Result => {
  revalidatePath('/admin/clients')
  revalidatePath('/admin/courses')
  revalidatePath('/portal/[id]', 'page')
  return { ok: true, id }
}

async function allClients(admin: Admin) {
  const { data } = await admin.from('clients').select(CLIENT_COLUMNS)
  return (data ?? []) as ClientRow[]
}

/** Courses under `id` have just been renamed by the database (their
    client_name follows the tree); the calendar events that print that name
    are rewritten after the response. */
async function resyncCalendars(admin: Admin, id: string) {
  const ids = [...subtreeIds(await allClients(admin), id)]
  const { data } = await admin.from('course_instances').select('id').in('client_id', ids)
  const courses = (data ?? []).map((c) => c.id as string)
  if (courses.length) after(async () => { for (const c of courses) await syncCourseCalendar(admin, c) })
}

// The unique index catches a repeat under one parent; this turns its error
// into something a person can act on.
const nameTaken = (code: string | undefined) =>
  code === '23505' ? 'There is already one with that name here' : 'Something went wrong — please try again'

/** A new sector, or a new client filed where it belongs. A client is always
    created somewhere: asking where at the moment it is made is what stops a
    pile of unfiled clients nobody gets round to. */
export async function addClient(
  input: { name: string; aliases: string; note: string; isGroup: boolean; parentId: string | null },
  confirmed = false
): Promise<Result> {
  const { user, admin } = await requireAdminUser()
  const name = input.name.trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Give it a name' }

  const rows = await allClients(admin)
  const parent = input.parentId ? rows.find((r) => r.id === input.parentId) : null
  if (input.parentId && !parent) return { ok: false, error: 'That place no longer exists — reload the page' }
  if (!input.isGroup && !parent) return { ok: false, error: 'Choose where it goes' }
  if (input.isGroup && parent && !parent.is_group) return { ok: false, error: 'A sector cannot go inside a client' }

  if (!confirmed && !input.isGroup) {
    const similar = sameNamedClients(rows.filter((r) => !r.is_group), name)
    if (similar.length > 0) return { ok: false, similar: similar.map((r) => ({ id: r.id, path: clientPath(rows, r.id) })) }
  }

  const sectors = rows.filter((r) => !r.parent_id && r.is_group)
  const { data, error } = await admin
    .from('clients')
    .insert({
      parent_id: input.parentId,
      is_group: input.isGroup,
      name,
      aliases: input.isGroup ? [] : parseAliases(input.aliases, name),
      note: input.note.trim().slice(0, 500) || null,
      position: input.isGroup && !input.parentId ? Math.max(0, ...sectors.map((r) => r.position)) + 1 : 0,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: nameTaken(error?.code) }
  return done(data.id as string)
}

export async function updateClient(
  id: string,
  input: { name: string; aliases: string; note: string }
): Promise<Result> {
  const { admin } = await requireAdminUser()
  const name = input.name.trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Give it a name' }
  const { data: before } = await admin.from('clients').select('name').eq('id', id).maybeSingle()
  const { error } = await admin
    .from('clients')
    .update({ name, aliases: parseAliases(input.aliases, name), note: input.note.trim().slice(0, 500) || null })
    .eq('id', id)
  if (error) return { ok: false, error: nameTaken(error.code) }
  if (before && before.name !== name) await resyncCalendars(admin, id)
  return done()
}

/** What someone typed before finding a client another way, kept on it so the
    next search for those words lands straight on it. Each miss happens once. */
export async function learnAlias(id: string, words: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const typed = words.trim().slice(0, 120)
  if (!typed) return { ok: true }
  const { data: row } = await admin.from('clients').select('name, aliases, is_group').eq('id', id).maybeSingle()
  if (!row || row.is_group) return { ok: true }
  const aliases = parseAliases([...(row.aliases as string[]), typed].join(','), row.name as string)
  if (aliases.length === (row.aliases as string[]).length) return { ok: true }
  await admin.from('clients').update({ aliases }).eq('id', id)
  revalidatePath('/admin/clients')
  return { ok: true }
}

/** File something somewhere else, taking everything under it along. Checked
    here again whatever the screen allowed. */
export async function moveClient(id: string, parentId: string | null): Promise<Result> {
  const { admin } = await requireAdminUser()
  const rows = await allClients(admin)
  const problem = placementProblem(rows, id, parentId)
  if (problem) return { ok: false, error: problem }
  const node = rows.find((r) => r.id === id)
  if (!node) return { ok: false, error: 'It no longer exists — reload the page' }
  if (node.parent_id === parentId) return done()
  // A client always lives somewhere; only a group can be top level.
  if (!node.is_group && parentId === null) return { ok: false, error: 'A client has to sit inside a sector' }
  const position =
    node.is_group && parentId === null
      ? Math.max(0, ...rows.filter((r) => !r.parent_id && r.is_group).map((r) => r.position)) + 1
      : node.position
  const { error } = await admin.from('clients').update({ parent_id: parentId, position }).eq('id', id)
  if (error) return { ok: false, error: nameTaken(error.code) }
  // Moving a team under a different client changes how it reads on a course.
  await resyncCalendars(admin, id)
  return done()
}

/** Fold a duplicate into the real client: its courses, its teams and every
    name it went by move across, then it goes. All or nothing, in the database. */
export async function mergeClient(fromId: string, intoId: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { error } = await admin.rpc('merge_clients', { from_id: fromId, into_id: intoId })
  if (error) return { ok: false, error: error.message || 'Could not merge them — please try again' }
  await resyncCalendars(admin, intoId)
  return done()
}

/** Remove a sector, subsector or client with no courses. Whatever is filed
    under it is never deleted with it: it moves, all at once, to `rehomeTo`.
    A client that has courses is merged rather than deleted. */
export async function deleteClient(id: string, rehomeTo?: string | null): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { count: courses } = await admin
    .from('course_instances')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', id)
  if (courses) return { ok: false, error: 'It has courses — merge it into another client instead' }
  const rows = await allClients(admin)
  const children = rows.filter((r) => r.parent_id === id)
  if (children.length > 0) {
    if (rehomeTo === undefined) return { ok: false, error: 'Say where what is under it should go' }
    for (const c of children) {
      const problem = placementProblem(rows, c.id, rehomeTo)
      if (problem) return { ok: false, error: `${c.name}: ${problem}` }
      if (!c.is_group && rehomeTo === null) return { ok: false, error: `${c.name}: a client has to sit inside a sector` }
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
  revalidatePath('/admin/clients')
  return { ok: true }
}

