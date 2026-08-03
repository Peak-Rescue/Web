'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { type CertType } from '@/lib/certs'
import { type CapabilityCategory, type CapabilityRole } from '@/lib/capabilities'
import { certDocPath, CERT_BUCKET } from '@/lib/cert-docs'
import { normalizePhone } from '@/lib/phone'
import { normalizeEmail } from '@/lib/email'

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

// Revalidate all paths affected by an instructor record change (by instructors.id)
async function revalidateInstructor(instructorId: string) {
  const { data } = await createAdminClient()
    .from('instructors')
    .select('slug')
    .eq('id', instructorId)
    .single()
  revalidatePath(`/admin/instructors/${instructorId}`)
  revalidatePath('/admin/instructors')
  revalidatePath('/team')
  if (data?.slug) revalidatePath(`/team/${data.slug}`)
}

// Revalidate paths when we only have a profile UUID (cert/profile actions)
async function revalidateByProfileId(profileId: string) {
  const { data } = await createAdminClient()
    .from('instructors')
    .select('id, slug')
    .eq('profile_id', profileId)
    .maybeSingle()
  revalidatePath('/admin/instructors')
  if (data?.id) {
    revalidatePath(`/admin/instructors/${data.id}`)
    revalidatePath('/team')
    if (data?.slug) revalidatePath(`/team/${data.slug}`)
  }
}

export async function adminUpsertCert(profileId: string, formData: FormData) {
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
      .eq('instructor_id', profileId)
      .select('id, cert_type, level, expires_at, notes')
      .single()
    if (error) throw new Error(error.message)
    await revalidateByProfileId(profileId)
    return data
  } else {
    const { data, error } = await admin
      .from('instructor_certs')
      .insert({ instructor_id: profileId, cert_type, level, expires_at, notes })
      .select('id, cert_type, level, expires_at, notes')
      .single()
    if (error) throw new Error(error.message)
    await revalidateByProfileId(profileId)
    return data
  }
}

export async function adminDeleteCert(profileId: string, certId: string) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('instructor_certs')
    .delete()
    .eq('id', certId)
    .eq('instructor_id', profileId)

  if (error) throw new Error(error.message)
  await revalidateByProfileId(profileId)
}

export async function adminAddCertDocument(profileId: string, certId: string, url: string, fileName: string) {
  await requireAdmin()

  const admin = createAdminClient()

  const { data: cert } = await admin
    .from('instructor_certs')
    .select('id')
    .eq('id', certId)
    .eq('instructor_id', profileId)
    .single()

  if (!cert) throw new Error('Cert not found')

  const storedPath = certDocPath(url)
  if (!storedPath) throw new Error('Invalid document reference')

  const { data, error } = await admin
    .from('instructor_cert_documents')
    .insert({ cert_id: certId, url: storedPath, file_name: fileName })
    .select('id, url, file_name, created_at')
    .single()

  if (error) throw new Error(error.message)
  await revalidateByProfileId(profileId)
  return data
}

export async function adminDeleteCertDocument(profileId: string, docId: string) {
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
    .eq('instructor_id', profileId)
    .single()

  if (!cert) throw new Error('Not authorized')

  const { error } = await admin
    .from('instructor_cert_documents')
    .delete()
    .eq('id', docId)

  if (error) throw new Error(error.message)

  const storagePath = certDocPath(doc.url)
  if (storagePath) {
    await admin.storage.from(CERT_BUCKET).remove([storagePath])
  }

  await revalidateByProfileId(profileId)
}

export async function adminUpdateProfile(profileId: string, {
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
    .eq('id', profileId)

  if (error) throw new Error(error.message)
  await revalidateByProfileId(profileId)
}

export async function adminUpdateInstructorEmail(instructorId: string, formData: FormData) {
  await requireAdmin()
  const email = normalizeEmail(formData.get('email') as string) || null

  const { error } = await createAdminClient()
    .from('instructors')
    .update({ email })
    .eq('id', instructorId)

  if (error) throw new Error(error.message)
  await revalidateInstructor(instructorId)
}

export async function adminUpdateInstructorProfile(instructorId: string, formData: FormData) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: instructor } = await admin
    .from('instructors')
    .select('id, avatar')
    .eq('id', instructorId)
    .single()

  if (!instructor) throw new Error('Instructor not found')

  const bio = (formData.get('bio') as string) || null
  const photo = formData.get('photo') as File | null
  const avatarPosition = ((formData.get('avatar_position') as string) || '').trim() || null
  const avatarScale = ((formData.get('avatar_scale') as string) || '').trim() || null

  let avatar = instructor.avatar

  if (photo && photo.size > 0) {
    const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const storageKey = `${instructor.id}.${ext}`
    const bytes = await photo.arrayBuffer()

    const { error: uploadError } = await admin.storage
      .from('instructor-photos')
      .upload(storageKey, bytes, { contentType: photo.type, upsert: true })

    if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)

    const { data: { publicUrl } } = admin.storage.from('instructor-photos').getPublicUrl(storageKey)
    avatar = publicUrl
  }

  const { error } = await admin
    .from('instructors')
    .update({ bio, avatar, avatar_position: avatarPosition, avatar_scale: avatarScale })
    .eq('id', instructorId)

  if (error) throw new Error(error.message)
  await revalidateInstructor(instructorId)
}

export async function adminSendInvite(instructorId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: instructor } = await admin
    .from('instructors')
    .select('email, name, profile_id')
    .eq('id', instructorId)
    .single()

  if (!instructor?.email) throw new Error('No email on instructor record')

  const nameParts = instructor.name.trim().split(/\s+/)
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ')

  // A failed send must reach the button: SMTP outages otherwise die silently
  // here and the UI shows "Sent" for an email that never left the building.
  const sendOtp = async (): Promise<string | null> => {
    const anon = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: 'implicit' } }
    )
    const { error: otpError } = await anon.auth.signInWithOtp({
      email: instructor.email!,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
        shouldCreateUser: false,
      },
    })
    return otpError ? otpError.message : null
  }

  // Active instructor (already has a portal account) — send sign-in link directly
  if (instructor.profile_id) {
    const sendError = await sendOtp()
    revalidatePath(`/admin/instructors/${instructorId}`)
    revalidatePath('/admin/instructors')
    if (sendError) return { ok: false as const, error: `Email failed to send: ${sendError}` }
    return { ok: true as const }
  }

  // Invite links come back from Supabase with the session in the URL hash
  // (implicit flow — admin-generated links have no browser to hold a PKCE
  // verifier), so they must land on /auth/confirm, the browser-side handler
  // magic links use. A server route (/auth/callback) never sees the hash and
  // would bounce the new instructor to the login page. Names travel via user
  // metadata (the signup trigger writes them to the profile).
  const { error } = await admin.auth.admin.inviteUserByEmail(instructor.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    data: { first_name: firstName, last_name: lastName },
  })

  if (error) {
    if (!error.message.includes('already been registered')) {
      return { ok: false as const, error: `Invite failed to send: ${error.message}` }
    }

    // User exists in auth but profile not linked yet — resolve their ID and link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: instructor.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
    })
    if (linkError || !linkData?.user?.id) throw new Error(linkError?.message ?? 'Could not resolve existing user')

    await Promise.all([
      admin.from('instructors').update({ profile_id: linkData.user.id, invite_sent_at: new Date().toISOString() }).eq('id', instructorId),
      // Never demote an admin who is also being linked as an instructor.
      admin.from('profiles').update({ role: 'instructor' }).eq('id', linkData.user.id).neq('role', 'admin'),
    ])

    const sendError = await sendOtp()

    revalidatePath(`/admin/instructors/${instructorId}`)
    revalidatePath('/admin/instructors')
    if (sendError) return { ok: false as const, error: `Email failed to send: ${sendError}` }
    return { ok: true as const }
  }

  await admin
    .from('instructors')
    .update({ invite_sent_at: new Date().toISOString() })
    .eq('id', instructorId)

  revalidatePath(`/admin/instructors/${instructorId}`)
  revalidatePath('/admin/instructors')
  return { ok: true as const }
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

const VALID_SECTORS = new Set(['military', 'civilian'])

// Which client sectors this instructor can work. Separate from expertise:
// sector is eligibility for the job, expertise is what they can run on it.
export async function adminSetInstructorSectors(instructorId: string, sectors: string[]) {
  await requireAdmin()
  const clean = [...new Set(sectors.filter((s) => VALID_SECTORS.has(s)))]
  const { error } = await createAdminClient()
    .from('instructors')
    .update({ sectors: clean })
    .eq('id', instructorId)
  if (error) throw new Error(error.message)
  await revalidateInstructor(instructorId)
}

// Single entry point for the bulk expertise grid: role null clears the
// sign-off, otherwise it's set. Saves one cell at a time so a mis-click is
// one click to undo.
export async function adminSetExpertise(
  instructorId: string,
  category: CapabilityCategory,
  role: CapabilityRole | null
) {
  await requireAdmin()
  const admin = createAdminClient()

  if (role === null) {
    const { error } = await admin
      .from('instructor_capabilities')
      .delete()
      .eq('instructor_id', instructorId)
      .eq('category', category)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin
      .from('instructor_capabilities')
      .upsert({ instructor_id: instructorId, category, role }, { onConflict: 'instructor_id,category' })
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/instructors')
  revalidatePath('/admin/instructors/expertise')
  revalidatePath(`/admin/instructors/${instructorId}`)
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
  revalidatePath(`/admin/instructors/${instructorId}`)
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
  revalidatePath(`/admin/instructors/${instructorId}`)
}

export async function adminCreateInstructor(firstName: string, lastName: string, email: string): Promise<{ id: string }> {
  await requireAdmin()
  const admin = createAdminClient()

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
  const slugBase = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

  let finalSlug = slugBase
  let attempt = 1
  while (true) {
    const { data: existing } = await admin
      .from('instructors')
      .select('id')
      .eq('slug', finalSlug)
      .maybeSingle()
    if (!existing) break
    attempt++
    finalSlug = `${slugBase}-${attempt}`
  }

  const { data, error } = await admin
    .from('instructors')
    .insert({
      slug: finalSlug,
      name: fullName,
      email: normalizeEmail(email) || null,
      instructor_role: 'specialized',
      title: fullName,
      bio: '',
      show_on_team_page: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/admin/instructors')
  return { id: data.id }
}

export async function adminDeleteInstructor(instructorId: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: instructor } = await admin
    .from('instructors')
    .select('slug, profile_id')
    .eq('id', instructorId)
    .single()

  if (!instructor) throw new Error('Instructor not found')

  const { error } = await admin
    .from('instructors')
    .delete()
    .eq('id', instructorId)

  if (error) throw new Error(error.message)

  if (instructor.profile_id) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(instructor.profile_id)
    if (deleteUserError) console.error('Failed to delete auth user:', deleteUserError.message)
  }

  revalidatePath('/admin/instructors')
  revalidatePath('/team')
  if (instructor.slug) revalidatePath(`/team/${instructor.slug}`)
}

// FLSA exemption controls per-diem eligibility on expense reports.
export async function adminSetExempt(profileId: string, isExempt: boolean) {
  await requireAdmin()

  const { error } = await createAdminClient()
    .from('profiles')
    .update({ is_exempt: isExempt })
    .eq('id', profileId)

  if (error) throw new Error(error.message)

  await revalidateByProfileId(profileId)
  revalidatePath('/instructor/expenses')
}
