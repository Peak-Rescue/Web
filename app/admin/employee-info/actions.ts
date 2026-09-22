'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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

export async function addResource(formData: FormData) {
  const admin = await requireAdmin()

  const title = String(formData.get('title') ?? '').trim()
  const url = String(formData.get('url') ?? '').trim()
  const section = String(formData.get('section') ?? '').trim() || 'Policies & guides'
  const description = String(formData.get('description') ?? '').trim() || null

  if (!title) throw new Error('Title is required')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Enter a full link, e.g. https://docs.google.com/…')
  }
  if (parsed.protocol !== 'https:') throw new Error('Link must start with https://')

  const { data, error } = await admin
    .from('employee_resources')
    .insert({ title, url, section, description })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/admin/employee-info')
  // The section is a field on the form, so the new link can land under any
  // heading on the page — and the form that made it is below all of them.
  // Named here, the page can take the reader to it. (Outside any try:
  // redirect throws.)
  redirect(`/admin/employee-info?added=${data.id}`)
}

export async function deleteResource(id: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('employee_resources').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/employee-info')
}
