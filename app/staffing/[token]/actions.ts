'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// Public action — authorization is the unguessable token itself.
export async function respondToInvite(
  token: string,
  input: { interested: boolean; note: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('course_interest_invites')
    .select('id, instance_id, instructor_id, interested')
    .eq('token', token)
    .maybeSingle()
  if (!invite) return { ok: false, error: 'This link is no longer valid' }

  const { data: inst } = await admin
    .from('course_instances')
    .select('course_type, custom_title, client_name, starts_at, ends_at, status')
    .eq('id', invite.instance_id)
    .single()
  if (!inst) return { ok: false, error: 'This course no longer exists' }
  if (inst.status === 'cancelled') return { ok: false, error: 'This course has been cancelled' }

  const note = input.note.trim().slice(0, 2000) || null
  const { error } = await admin
    .from('course_interest_invites')
    .update({ interested: input.interested, note, responded_at: new Date().toISOString() })
    .eq('id', invite.id)
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  revalidatePath(`/admin/courses/${invite.instance_id}`)
  revalidatePath('/admin')
  return { ok: true }
}
