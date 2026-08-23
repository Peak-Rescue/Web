'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Choosing which waiver a course uses.
//
// One field, and it is the switch that makes the whole thing real: until a
// course points at a template, nobody is asked to sign anything. That is the
// safe default — a course set up before its paperwork is settled asks for
// nothing rather than asking for the wrong document.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

export type WaiverTemplateOption = { id: string; name: string; version: number | null }

export async function listWaiverTemplates(): Promise<WaiverTemplateOption[]> {
  const admin = await requireAdmin()
  const { data } = await admin
    .from('waiver_templates')
    .select('id, name, current_version_id')
    .is('archived_at', null)
    .order('name')

  const rows = (data ?? []) as { id: string; name: string; current_version_id: string | null }[]
  const versionIds = rows.map((r) => r.current_version_id).filter(Boolean) as string[]
  const { data: versions } = versionIds.length
    ? await admin.from('waiver_template_versions').select('id, version').in('id', versionIds)
    : { data: [] }
  const versionOf = new Map((versions ?? []).map((v) => [v.id, v.version]))

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    version: t.current_version_id ? versionOf.get(t.current_version_id) ?? null : null,
  }))
}

/**
 * Point a course at a waiver, or at none.
 *
 * Changing this does not touch waivers already signed — those name the version
 * they were shown and go on naming it. What changes is only what the next
 * person is asked to sign, which is why swapping a template mid-course is
 * allowed rather than blocked: the record of what everyone signed survives it.
 */
export async function setCourseWaiver(instanceId: string, templateId: string | null): Promise<void> {
  const admin = await requireAdmin()

  if (templateId) {
    const { data: template } = await admin
      .from('waiver_templates')
      .select('current_version_id')
      .eq('id', templateId)
      .maybeSingle()
    if (!template) throw new Error('That waiver no longer exists.')
    // A template with nothing published has no words to show anyone.
    if (!template.current_version_id) {
      throw new Error('That waiver has no published version yet, so nobody could sign it.')
    }
  }

  const { error } = await admin
    .from('course_instances')
    .update({ waiver_template_id: templateId })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

// ─── The course QR code ─────────────────────────────────────────────────────

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'

/**
 * Mint (or replace) the code an instructor holds up at the tailgate.
 *
 * One per course, not one per person: it is shown from a phone to whoever is
 * standing there, and a code per head would defeat the point. Replacing it
 * kills the old one immediately, which is what makes a printed sheet from a
 * finished course safe to leave in a truck.
 */
export async function generateWaiverQr(
  instanceId: string,
  expiresInDays?: number | 'never'
): Promise<{ token: string; url: string }> {
  const admin = await requireAdmin()

  const { data: course } = await admin
    .from('course_instances')
    .select('waiver_template_id, ends_at')
    .eq('id', instanceId)
    .single()
  // A code that opens a page with nothing to sign wastes somebody's time at
  // the worst possible moment.
  if (!course?.waiver_template_id) {
    throw new Error('Choose a waiver for this course first — there would be nothing to sign.')
  }

  // Defaults to a week past the course, matching the invite links: long enough
  // for a late signer, short enough that an old screenshot stops working.
  let expiresAt: string | null = null
  if (expiresInDays === undefined) {
    const end = course.ends_at ? new Date(`${course.ends_at}T00:00:00`) : new Date()
    end.setDate(end.getDate() + 7)
    expiresAt = end.toISOString()
  } else if (expiresInDays !== 'never') {
    const d = new Date()
    d.setDate(d.getDate() + expiresInDays)
    expiresAt = d.toISOString()
  }

  const token = crypto.randomUUID()
  const { error } = await admin
    .from('course_instances')
    .update({ waiver_token: token, waiver_token_expires_at: expiresAt })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/courses/${instanceId}`)
  return { token, url: `${siteUrl()}/waiver/${token}` }
}

export async function revokeWaiverQr(instanceId: string): Promise<void> {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('course_instances')
    .update({ waiver_token: null, waiver_token_expires_at: null })
    .eq('id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// ─── Working the unmatched queue ────────────────────────────────────────────

/**
 * Attach a signature to the student it belongs to, decided by a person.
 *
 * The signature itself doesn't change — it can't, the database won't allow it.
 * What changes is who we say it is about, and the row records that a human
 * said so rather than a rule having fired.
 */
export async function linkWaiverSignature(
  signatureId: string,
  enrollmentId: string
): Promise<void> {
  const admin = await requireAdmin()

  const { data: enrollment } = await admin
    .from('enrollments')
    .select('id, user_id, instance_id')
    .eq('id', enrollmentId)
    .maybeSingle()
  if (!enrollment) throw new Error('That student is no longer enrolled on this course.')

  const { data: sig } = await admin
    .from('waiver_signatures')
    .select('id, instance_id')
    .eq('id', signatureId)
    .maybeSingle()
  if (!sig) throw new Error('That waiver no longer exists.')
  // Attaching a waiver to somebody on a different course would be a filing
  // error with legal consequences, so it is refused rather than trusted.
  if (sig.instance_id !== enrollment.instance_id) {
    throw new Error('That waiver belongs to a different course.')
  }

  const { error } = await admin
    .from('waiver_signatures')
    .update({
      enrollment_id: enrollment.id,
      profile_id: enrollment.user_id,
      link_method: 'manual',
      linked_at: new Date().toISOString(),
    })
    .eq('id', signatureId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/courses/${enrollment.instance_id}`)
}

/** Detach a signature linked to the wrong person. It stays a valid waiver. */
export async function unlinkWaiverSignature(signatureId: string, instanceId: string): Promise<void> {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('waiver_signatures')
    .update({ enrollment_id: null, profile_id: null, link_method: null, linked_at: null })
    .eq('id', signatureId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}
