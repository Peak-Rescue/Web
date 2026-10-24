'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUser } from '@/lib/course-access'
import { keyOf, scopeOf, type ContactHome, type ContactScope } from '@/lib/contact-homes'

// The types are not re-exported from here. `export type { ContactHome }` in a
// `'use server'` file compiled to a value re-export, and the module threw
// `ReferenceError: ContactHome is not defined` at evaluation — so every
// action in it 500'd, which is why the places picker sat on "Loading…".
// Import them from '@/lib/contact-homes', where they are declared.

// People, and where each is known from (267).
//
// A contact used to live inside its owner — three JSON arrays on three
// tables — so somebody who is both the client's booking contact and the
// venue's gate-code holder was written twice, listed twice, and corrected
// once. Now there is one row per person and a link per place they are known
// from, and these are the only writes to either.

export type BookContact = {
  id: string
  name: string
  role?: string | null
  phone?: string | null
  email?: string | null
  note?: string | null
  /** Everywhere this person is known from, including the list they are
      being read on. The row says "also …" by dropping that one, and the
      editor ticks the rest. Labels alone were enough to say it and not
      enough to change it. */
  homes?: ContactHome[]
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

  return (people ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    role: p.role as string | null,
    phone: p.phone as string | null,
    email: p.email as string | null,
    note: p.note as string | null,
    homes: (links ?? [])
      .filter((l) => l.contact_id === p.id)
      .map((l) =>
        l.client_id
          ? { key: `client:${l.client_id}`, label: clientName.get(l.client_id as string) ?? 'a client' }
          : l.venue_id
            ? { key: `venue:${l.venue_id}`, label: venueName.get(l.venue_id as string) ?? 'a venue' }
            : { key: `region:${l.region_code}`, label: String(l.region_code) }
      ),
  }))
}

/** One person, saved. Their details live on the person, so this is also how
    a wrong number is corrected everywhere it is read from. */
export async function saveContact(
  scope: ContactScope,
  contact: { id?: string; name: string; role?: string; phone?: string; email?: string; note?: string },
  /** Every place this person belongs to, as keys, when the editor asked. The
      list being edited is always one of them — you cannot file somebody out
      of the list you are standing in; the trash does that and says so. */
  homes?: string[]
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

  const wanted = new Set([keyOf(scope), ...(homes ?? [])])
  for (const key of wanted) {
    const target = scopeOf(key)
    if (!target) continue
    // A plain insert, not an upsert: the unique indexes are partial (one per
    // kind of place), and ON CONFLICT cannot name a partial index — so the
    // upsert this used to be was refused with 42P10 on every save.
    const { error: linkError } = await admin
      .from('contact_links')
      .insert({ contact_id: id, [column(target)]: value(target) })
    // A duplicate link is the same fact twice, which is not an error.
    if (linkError && linkError.code !== '23505') throw new Error(linkError.message)
  }

  // Only when the editor said what the whole set should be. Called without
  // homes — from a course, from the places form — this adds one link and
  // touches nothing else, because those callers were never asked about the
  // person's other homes and must not be read as having answered.
  if (homes) {
    const { data: existing } = await admin
      .from('contact_links')
      .select('id, client_id, venue_id, region_code')
      .eq('contact_id', id)
    for (const l of existing ?? []) {
      const key = l.client_id ? `client:${l.client_id}` : l.venue_id ? `venue:${l.venue_id}` : `region:${l.region_code}`
      if (!wanted.has(key)) await admin.from('contact_links').delete().eq('id', l.id)
    }
  }

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

/** The person, gone from everywhere that knows them.
 *
 * The trash on a list is "not ours any more", which is the common one and
 * the safe one: the number is still right for the venue even when the client
 * stops using them. This is the other one — left the industry, wrong person
 * entered, a duplicate that slipped past the matching — and it says how many
 * lists it is about to empty before it does it. */
export async function deleteContactEverywhere(contactId: string): Promise<void> {
  await requireAdminUser()
  const admin = createAdminClient()
  // The links cascade off the person, so this is one delete.
  const { error } = await admin.from('contacts').delete().eq('id', contactId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  revalidatePath('/admin/sites')
  revalidatePath('/admin/library')
}

/** Everywhere a person could be filed: every client, every venue, and every
    state or country the places page knows about. Fetched when somebody opens
    the editor rather than loaded onto every page that lists a contact. */
export async function contactHomes(): Promise<{ clients: ContactHome[]; venues: ContactHome[]; regions: ContactHome[] }> {
  await requireAdminUser()
  const admin = createAdminClient()
  const [{ data: clients }, { data: venues }, { data: regions }] = await Promise.all([
    admin.from('clients').select('id, name').order('name'),
    admin.from('venues').select('id, name').order('name'),
    admin.from('region_info').select('region_code').order('region_code'),
  ])
  return {
    clients: (clients ?? []).map((c) => ({ key: `client:${c.id}`, label: c.name as string })),
    venues: (venues ?? []).map((v) => ({ key: `venue:${v.id}`, label: v.name as string })),
    regions: (regions ?? []).map((r) => ({ key: `region:${r.region_code}`, label: String(r.region_code) })),
  }
}
