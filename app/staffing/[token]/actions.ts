'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isInstanceRole } from '@/lib/staffing-roles'

// Public action — authorization is the unguessable token itself.
export async function respondToInvite(
  token: string,
  input: { interested: boolean; note: string; accepts?: string[] | null }
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

  // Which seats they said they would take. Validated here and not trusted from
  // the form, because this action's only gate is the token and the answer is
  // about somebody's wage: an unknown role would be stored and read back as a
  // seat nobody can be staffed into.
  //
  // A "can't make it" clears it. Keeping the seats somebody would have taken
  // beside a no is a sentence with two halves that disagree, and staffing would
  // have to decide which half to believe.
  const accepts =
    input.interested && Array.isArray(input.accepts)
      ? input.accepts.filter(isInstanceRole)
      : null
  if (input.interested && Array.isArray(input.accepts) && accepts!.length === 0) {
    return { ok: false, error: 'Pick at least one role you would take' }
  }

  const { error } = await admin
    .from('course_interest_invites')
    .update({
      interested: input.interested,
      note,
      accepts,
      responded_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
  if (error) return { ok: false, error: 'Something went wrong — please try again' }

  revalidatePath(`/admin/courses/${invite.instance_id}`)
  revalidatePath('/admin')
  return { ok: true }
}
