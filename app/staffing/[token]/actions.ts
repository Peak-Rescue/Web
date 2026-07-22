'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseShortName } from '@/lib/courses'

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

  // Tell the admins (best-effort, deferred so the click doesn't wait on email).
  if (process.env.RESEND_API_KEY) {
    after(async () => {
      try {
        const [{ data: admins }, { data: instructor }] = await Promise.all([
          admin.from('profiles').select('email').eq('role', 'admin'),
          admin.from('instructors').select('name').eq('id', invite.instructor_id).single(),
        ])
        const recipients = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))
        if (recipients.length === 0 || !instructor) return
        const courseName = courseShortName(inst.course_type, inst.custom_title)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.peakrescuemountainguides.com'
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
          to: recipients,
          subject: input.interested
            ? `🙋 ${instructor.name} is interested in ${courseName}`
            : `${instructor.name} can't work ${courseName}`,
          text: [
            `${instructor.name} responded to the staffing interest check for ${courseName}${inst.client_name ? ` · ${inst.client_name}` : ''}.`,
            '',
            `Response: ${input.interested ? 'Interested' : "Can't make it"}`,
            note ? `Note: ${note}` : null,
            '',
            `Staff the course: ${siteUrl}/admin/courses/${invite.instance_id}`,
          ].filter((l): l is string => l !== null).join('\n'),
        })
      } catch (e) {
        console.error('Interest response notification failed:', e)
      }
    })
  }

  revalidatePath(`/admin/courses/${invite.instance_id}`)
  revalidatePath('/admin')
  return { ok: true }
}
