'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

export async function setSubmissionArchived(id: string, archived: boolean) {
  const admin = await requireAdmin()
  const { error } = await admin.from('contact_submissions').update({ archived }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/contact')
}

export async function setSubmissionSpam(id: string, spam: boolean) {
  const admin = await requireAdmin()
  const { error } = await admin.from('contact_submissions').update({ spam }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/contact')
}

export async function deleteSubmission(id: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('contact_submissions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/contact')
}
