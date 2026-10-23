'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUser } from '@/lib/course-access'

// People, and where each is known from (267).
//
// A contact used to live inside its owner — three JSON arrays on three
// tables — so somebody who is both the client's booking contact and the
// venue's gate-code holder was written twice, listed twice, and corrected
// once. Now there is one row per person and a link per place they are known
// from, and these are the only writes to either.

export type ContactScope =
  | { clientId: string }
  | { venueId: string }
  | { regionCode: string }

export type BookContact = {
  id: string
  name: string
  role?: string | null
  phone?: string | null
  email?: string | null
  note?: string | null
  /** Everywhere else this person is known from, for the row that says so. */
  alsoFrom?: string[]
}

const column = (scope: ContactScope) =>
  'clientId' in scope ? 'client_id' : 'venueId' in scope ? 'venue_id' : 'region_code'
const value = (scope: ContactScope) =>
  'clientId' in scope ? scope.clientId : 'venueId' in scope ? scope.venueId : scope.regionCode

/** The people known from one place, each saying where else they are known
    from — which is the line that used to be a second copy of them. */
export async function contactsFor(scope: ContactScope): Promise<BookContact[]> {
  await requireAdminUser()
  const admin = createAdminClient()

  const { data: here } = await admin
    .from('contact_links')
    .select('contact_id')
    .eq(column(scope), value(scope))
  const ids = (here ?? []).map((l) => l.contact_id as string)
  if (ids.length === 0) return []

  const [{ data: people }, { data: links }, { data: venues }, { data: clients }] = await Promise.all([
    admin.from('contacts').select('id, name, role, phone, email, note').in('id', ids).order('name'),
    admin.from('contact_links').select('contact_id, client_id, venue_id, region_code').in('contact_id', ids),
    admin.from('venues').select('id, name'),
    admin.from('clients').select('id, name'),
  ])

  const venueName = new Map((venues ?? []).map((v) => [v.id as string, v.name as string]))
  const clientName = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]))
  const mine = value(scope)

  return (people ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    role: p.role as string | null,
    phone: p.phone as string | null,
    email: p.email as string | null,
    note: p.note as string | null,
    alsoFrom: (links ?? [])
      .filter((l) => l.contact_id === p.id)
      .map((l) =>
        l.client_id
          ? { key: l.client_id as string, label: clientName.get(l.client_id as string) ?? 'a client' }
          : l.venue_id
            ? { key: l.venue_id as string, label: venueName.get(l.venue_id as string) ?? 'a venue' }
            : { key: l.region_code as string, label: l.region_code as string }
      )
      .filter((x) => x.key !== mine)
      .map((x) => x.label),
  }))
}

/** One person, saved. Their details live on the person, so this is also how
    a wrong number is corrected everywhere it is read from. */
export async function saveContact(
  scope: ContactScope,
  contact: { id?: string; name: string; role?: string; phone?: string; email?: string; note?: string }
): Promise<{ error: string } | { id: string }> {
  await requireAdminUser()
  const admin = createAdminClient()

  const name = contact.name.trim().slice(0, 120)
  if (!name) return { error: 'A contact needs a name.' }
  const row = {
    name,
    role: contact.role?.trim().slice(0, 80) || null,
    phone: contact.phone?.trim().slice(0, 40) || null,
    email: contact.email?.trim().slice(0, 120) || null,
    note: contact.note?.trim().slice(0, 300) || null,
  }

  let id = contact.id
  if (id) {
    const { error } = await admin.from('contacts').update(row).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    // The same person twice is the thing this table exists to stop, so a
    // name with a matching number or address is them rather than a second
    // one of them.
    const { data: already } = await admin
      .from('contacts')
      .select('id, phone, email')
      .ilike('name', name)
    const match = (already ?? []).find(
      (c) =>
        (row.phone && c.phone === row.phone) ||
        (row.email && c.email === row.email) ||
        (!row.phone && !row.email)
    )
    if (match) id = match.id as string
    else {
      const { data: made, error } = await admin.from('contacts').insert(row).select('id').single()
      if (error) throw new Error(error.message)
      id = made.id as string
    }
  }

  const { error: linkError } = await admin
    .from('contact_links')
    .upsert({ contact_id: id, [column(scope)]: value(scope) }, { onConflict: `contact_id,${column(scope)}` })
  // A duplicate link is the same fact twice, which is not an error.
  if (linkError && !linkError.message.includes('duplicate')) throw new Error(linkError.message)

  revalidatePath('/admin/clients')
  revalidatePath('/admin/sites')
  revalidatePath('/admin/library')
  return { id: id! }
}

/** Off this list, not off the planet. The person stays while anywhere else
    still knows them; the last link taking them with it is the difference
    between "not ours" and "nobody's". */
export async function unlinkContact(scope: ContactScope, contactId: string): Promise<void> {
  await requireAdminUser()
  const admin = createAdminClient()

  await admin.from('contact_links').delete().eq('contact_id', contactId).eq(column(scope), value(scope))
  const { count } = await admin
    .from('contact_links')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
  if ((count ?? 0) === 0) await admin.from('contacts').delete().eq('id', contactId)

  revalidatePath('/admin/clients')
  revalidatePath('/admin/sites')
  revalidatePath('/admin/library')
}
