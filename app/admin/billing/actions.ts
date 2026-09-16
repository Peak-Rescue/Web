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
