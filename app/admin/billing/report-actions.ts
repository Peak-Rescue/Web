'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'

// The list of people a course's numbers can be sent to.
//
// Deliberately thinner than the billers' list beside it. Nobody here holds a
// token, so there is nothing to rotate and nothing to revoke per person — the
// link they are sent belongs to the course, and revoking it there cuts every
// copy at once. All this list decides is who is offered in the send.

type Result = { ok: true } | { ok: false; error: string }

function revalidate() {
  revalidatePath('/admin/billing')
  // Every course's actuals offer these people, and one may be on screen.
  revalidatePath('/portal/[id]', 'page')
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function addReportRecipient(formData: FormData): Promise<Result> {
  const { admin } = await requireAdminUser()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const org = String(formData.get('org') ?? '').trim() || null
  if (!name) return { ok: false, error: 'Name is required' }
  if (!EMAIL.test(email)) return { ok: false, error: 'A valid email is required' }

  // Adding somebody who was retired brings the person back rather than making
  // a second of them — the same bargain the billers' list makes.
  const { data: existing } = await admin
    .from('report_recipients')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    await admin.from('report_recipients').update({ name, org, active: true }).eq('id', existing.id)
    revalidate()
    return { ok: true }
  }

  const { error } = await admin.from('report_recipients').insert({ name, email, org })
  if (error) return { ok: false, error: 'Could not add them — please try again' }
  revalidate()
  return { ok: true }
}

export async function updateReportRecipient(id: string, formData: FormData): Promise<Result> {
  const { admin } = await requireAdminUser()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const org = String(formData.get('org') ?? '').trim() || null
  if (!name) return { ok: false, error: 'Name is required' }
  if (!EMAIL.test(email)) return { ok: false, error: 'A valid email is required' }

  const { data: clash } = await admin
    .from('report_recipients')
    .select('id')
    .eq('email', email)
    .neq('id', id)
    .maybeSingle()
  if (clash) return { ok: false, error: 'Somebody else here already has that address' }

  const { error } = await admin.from('report_recipients').update({ name, email, org }).eq('id', id)
  if (error) return { ok: false, error: 'Could not save — please try again' }
  revalidate()
  return { ok: true }
}

/** Stops somebody being offered, without losing that they were. */
export async function setReportRecipientActive(id: string, active: boolean): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('report_recipients').update({ active }).eq('id', id)
  if (error) return { ok: false, error: 'Could not save — please try again' }
  revalidate()
  return { ok: true }
}

/** Removes a row outright. Safe in a way the billers' list is not: nothing
    records who was sent a P&L, so deleting a reader leaves no request with an
    unexplained name on it. A wrong address should simply go. */
export async function deleteReportRecipient(id: string): Promise<Result> {
  const { admin } = await requireAdminUser()
  const { error } = await admin.from('report_recipients').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not remove them — please try again' }
  revalidate()
  return { ok: true }
}
