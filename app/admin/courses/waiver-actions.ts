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
