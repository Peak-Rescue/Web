'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUser } from '@/lib/course-access'

type Result = { ok: true } | { ok: false; error: string }

function revalidate() {
  revalidatePath('/admin/billing')
  // The Send button names the active recipients, so a course page that has one
  // cached would go on offering to mail somebody who is no longer there.
  revalidatePath('/portal/[id]', 'page')
}

export async function addBillingRecipient(formData: FormData): Promise<Result> {
  const { admin } = await requireAdminUser()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const org = String(formData.get('org') ?? '').trim() || 'Harken'
  if (!name) return { ok: false, error: 'Name is required' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'A valid email is required' }

  const { data: existing } = await admin
    .from('billing_recipients')
    .select('id, active')
    .eq('email', email)
    .maybeSingle()
  // Re-adding somebody who was deactivated brings back the person, not a
  // duplicate of them — and deliberately reuses their old token, because the
  // link they bookmarked is the thing they will reach for.
  if (existing) {
    await admin.from('billing_recipients').update({ name, org, active: true }).eq('id', existing.id)
    revalidate()
    return { ok: true }
  }

  const { error } = await admin.from('billing_recipients').insert({ name, email, org })
  if (error) return { ok: false, error: 'Could not add them — please try again' }
  revalidate()
  return { ok: true }
}

/** Corrects the person. A name typed wrong, an address that changed, the
    role moving to somebody else at the same firm — none of which is a reason
    to deactivate a row and build a new one, which is what this page left you
    doing.

    The link is not touched. A bookmarked address belongs to whoever holds it,
    and changing it silently under somebody because their surname was fixed
    would break the page they use. Rotate is right there when the point is to
    cut the old link. */
export async function updateBillingRecipient(id: string, formData: FormData): Promise<Result> {
  const { admin } = await requireAdminUser()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const org = String(formData.get('org') ?? '').trim() || 'Harken'
  if (!name) return { ok: false, error: 'Name is required' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'A valid email is required' }

  // Two rows with one address would make "add them again" ambiguous and send
  // every request twice.
  const { data: clash } = await admin
    .from('billing_recipients')
    .select('id')
    .eq('email', email)
    .neq('id', id)
    .maybeSingle()
  if (clash) return { ok: false, error: 'Somebody else here already has that address' }

  const { error } = await admin.from('billing_recipients').update({ name, email, org }).eq('id', id)
  if (error) return { ok: false, error: 'Could not save — please try again' }
  revalidate()
  return { ok: true }
}

/** Removes somebody who never did anything — a row added with a typo, a
    person who turned out not to be the one.

    The same shape as retiring a cost category, for the same reason: a
    recipient who has marked invoices is named on those invoices, and deleting
    them would leave a request saying somebody raised it and nobody able to
    say who. Those are deactivated instead, and this says so rather than
    failing on a foreign key. */
export async function deleteBillingRecipient(id: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { count } = await admin
    .from('invoice_requests')
    .select('id', { count: 'exact', head: true })
    .or(`invoiced_by.eq.${id},paid_by.eq.${id}`)
  if ((count ?? 0) > 0) {
    return { ok: false, error: 'They have marked invoices, so their name has to stay — deactivate them instead' }
  }
  const { error } = await admin.from('billing_recipients').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not remove them — please try again' }
  revalidate()
  return { ok: true }
}

// Revoking a link, not deleting a person: their name stays on every invoice
// they raised, which is the whole reason this is a flag and not a delete.
export async function setBillingRecipientActive(id: string, active: boolean): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('billing_recipients').update({ active }).eq('id', id)
  if (error) return { ok: false, error: 'Could not save — please try again' }
  revalidate()
  return { ok: true }
}

// For a link that has been forwarded further than it should have been. The
// person keeps working; the old address stops.
export async function rotateBillingToken(id: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('billing_recipients').update({ token: crypto.randomUUID() }).eq('id', id)
  if (error) return { ok: false, error: 'Could not rotate — please try again' }
  revalidate()
  return { ok: true }
}
