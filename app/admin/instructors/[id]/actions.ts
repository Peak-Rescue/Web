'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type CertType } from '@/lib/certs'
import { type CapabilityCategory, type CapabilityRole } from '@/lib/capabilities'
import { normalizePhone } from '@/lib/phone'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user
}

export async function adminUpsertCert(instructorId: string, formData: FormData) {
  await requireAdmin()

  const cert_type = formData.get('cert_type') as CertType
  const level = (formData.get('level') as string) || null
  const expires_at = (formData.get('expires_at') as string) || null
  const notes = (formData.get('notes') as string) || null
  const existingId = formData.get('id') as string | null

  const admin = createAdminClient()

  if (existingId) {
    const { data, error } = await admin
      .from('instructor_certs')
      .update({ cert_type, level, expires_at, notes })
      .eq('id', existingId)
      .eq('instructor_id', instructorId)
      .select('id, cert_type, level, expires_at, notes')
      .single()
    if (error) throw new Error(error.message)
    revalidatePath(`/admin/instructors/${instructorId}`)
    return data
  } else {
    const { data, error } = await admin
      .from('instructor_certs')
      .insert({ instructor_id: instructorId, cert_type, level, expires_at, notes })
      .select('id, cert_type, level, expires_at, notes')
      .single()
    if (error) throw new Error(error.message)
    revalidatePath(`/admin/instructors/${instructorId}`)
    return data
  }
}

export async function adminDeleteCert(instructorId: string, certId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instructor_certs')
    .delete()
    .eq('id', certId)
    .eq('instructor_id', instructorId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/instructors/${instructorId}`)
}

export async function adminAddCertDocument(instructorId: string, certId: string, url: string, fileName: string) {
  await requireAdmin()

  const admin = createAdminClient()

  const { data: cert } = await admin
    .from('instructor_certs')
    .select('id')
    .eq('id', certId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cert) throw new Error('Cert not found')

  const { data, error } = await admin
    .from('instructor_cert_documents')
    .insert({ cert_id: certId, url, file_name: fileName })
    .select('id, url, file_name, created_at')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/instructors/${instructorId}`)
  return data
}

export async function adminDeleteCertDocument(instructorId: string, docId: string) {
  await requireAdmin()

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
    .eq('instructor_id', instructorId)
    .single()

  if (!cert) throw new Error('Not authorized')

  const { error } = await admin
    .from('instructor_cert_documents')
    .delete()
    .eq('id', docId)

  if (error) throw new Error(error.message)

  try {
    const url = new URL(doc.url)
    const marker = '/object/public/cert-documents/'
    const idx = url.pathname.indexOf(marker)
    if (idx !== -1) {
      const storagePath = url.pathname.slice(idx + marker.length)
      await admin.storage.from('cert-documents').remove([storagePath])
    }
  } catch {
    // non-fatal
  }

  revalidatePath(`/admin/instructors/${instructorId}`)
}

export async function adminUpdateProfile(instructorId: string, {
  email, phone, emergency_name, emergency_relationship, emergency_phone,
}: {
  email: string
  phone: string
  emergency_name: string
  emergency_relationship: string
  emergency_phone: string
}) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('profiles')
    .update({
      email: email || null,
      phone: phone ? normalizePhone(phone) : null,
      emergency_name: emergency_name || null,
      emergency_relationship: emergency_relationship || null,
      emergency_phone: emergency_phone ? normalizePhone(emergency_phone) : null,
    })
    .eq('id', instructorId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/instructors/${instructorId}`)
}

export async function adminSendInvite(instructorId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: instructor } = await admin
    .from('instructors')
    .select('email')
    .eq('id', instructorId)
    .single()

  if (!instructor?.email) throw new Error('No email on instructor record')

  const { error } = await admin.auth.admin.inviteUserByEmail(instructor.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/instructor`,
  })

  if (error) throw new Error(error.message)
}

export async function adminSetShowOnTeamPage(instructorId: string, show: boolean) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instructors')
    .update({ show_on_team_page: show })
    .eq('id', instructorId)

  if (error) throw new Error(error.message)
  await revalidateInstructor(instructorId)
}

async function revalidateInstructor(instructorId: string) {
  const { data } = await createAdminClient()
    .from('instructors')
    .select('profile_id')
    .eq('id', instructorId)
    .single()
  if (data?.profile_id) revalidatePath(`/admin/instructors/${data.profile_id}`)
  revalidatePath('/admin/instructors')
}

export async function adminSetCapability(instructorId: string, category: CapabilityCategory, role: CapabilityRole) {
  await requireAdmin()
  const admin = createAdminClient()

  await admin
    .from('instructor_capabilities')
    .delete()
    .eq('instructor_id', instructorId)
    .eq('category', category)

  const { error } = await admin
    .from('instructor_capabilities')
    .insert({ instructor_id: instructorId, category, role })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/instructors')
}

export async function adminRemoveCapability(instructorId: string, category: CapabilityCategory) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instructor_capabilities')
    .delete()
    .eq('instructor_id', instructorId)
    .eq('category', category)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/instructors')
}
