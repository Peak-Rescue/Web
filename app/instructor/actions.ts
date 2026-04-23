'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type CertType } from '@/lib/certs'

export async function upsertCert(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const cert_type = formData.get('cert_type') as CertType
  const level = (formData.get('level') as string) || null
  const expires_at = (formData.get('expires_at') as string) || null
  const notes = (formData.get('notes') as string) || null
  const existingId = formData.get('id') as string | null

  const admin = createAdminClient()
  let result

  if (existingId) {
    const { data, error } = await admin
      .from('instructor_certs')
      .update({ cert_type, level, expires_at, notes })
      .eq('id', existingId)
      .eq('instructor_id', user.id)
      .select('id, cert_type, level, expires_at, notes')
      .single()
    if (error) throw new Error(error.message)
    result = data
  } else {
    const { data, error } = await admin
      .from('instructor_certs')
      .insert({ instructor_id: user.id, cert_type, level, expires_at, notes })
      .select('id, cert_type, level, expires_at, notes')
      .single()
    if (error) throw new Error(error.message)
    result = data
  }

  revalidatePath('/instructor')
  return result
}

export async function addCertDocument(certId: string, url: string, fileName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()

  const { data: cert } = await admin
    .from('instructor_certs')
    .select('id')
    .eq('id', certId)
    .eq('instructor_id', user.id)
    .single()

  if (!cert) throw new Error('Cert not found or not yours')

  const { data, error } = await admin
    .from('instructor_cert_documents')
    .insert({ cert_id: certId, url, file_name: fileName })
    .select('id, url, file_name, created_at')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/instructor')
  return data
}

export async function deleteCertDocument(docId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('instructor_cert_documents')
    .select('id, cert_id, url')
    .eq('id', docId)
    .single()

  if (!doc) throw new Error('Document not found')

  const { data: cert } = await admin
    .from('instructor_certs')
    .select('id')
    .eq('id', doc.cert_id)
    .eq('instructor_id', user.id)
    .single()

  if (!cert) throw new Error('Not authorized')

  const { error } = await admin
    .from('instructor_cert_documents')
    .delete()
    .eq('id', docId)

  if (error) throw new Error(error.message)

  // Delete from storage — path follows publicUrl: /storage/v1/object/public/cert-documents/<path>
  try {
    const url = new URL(doc.url)
    const marker = '/object/public/cert-documents/'
    const idx = url.pathname.indexOf(marker)
    if (idx !== -1) {
      const storagePath = url.pathname.slice(idx + marker.length)
      await admin.storage.from('cert-documents').remove([storagePath])
    }
  } catch {
    // non-fatal: DB row is already gone
  }

  revalidatePath('/instructor')
}

export async function updateProfile({ email, phone }: { email: string; phone: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await createAdminClient()
    .from('profiles')
    .update({ email: email || null, phone: phone || null })
    .eq('id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/instructor')
}

export async function deleteCert(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await createAdminClient()
    .from('instructor_certs')
    .delete()
    .eq('id', id)
    .eq('instructor_id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/instructor')
}
