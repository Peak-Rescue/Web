'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { type LibraryAudience } from '@/lib/library'
import { LINK_PURPOSES, type LinkPurpose } from '@/lib/course-links'
import { refuse, type ActionResult } from '@/lib/action-result'

// One-off links attached to a course — the shared photo album, the client's
// own paperwork, a permit portal. Reusable material belongs in the library and
// arrives through Curriculum; this is for what matters to this delivery only.

async function requireTeam(instanceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') return { user, admin }

  // Instructors on the course can add links too — a photo album is something
  // the person running the course has, not something they email to an admin.
  const { data: assigned } = await admin
    .from('instance_instructors')
    .select('id, instructors!inner(profile_id)')
    .eq('instance_id', instanceId)
    .eq('instructors.profile_id', user.id)
    .maybeSingle()
  if (!assigned) throw new Error('Not authorized')
  return { user, admin }
}

function revalidate(instanceId: string) {
  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath(`/portal/${instanceId}`)
}

export async function addCourseLink(
  instanceId: string,
  input: { url: string; label: string; purpose: LinkPurpose; audience?: LibraryAudience }
): Promise<ActionResult> {
  const { user, admin } = await requireTeam(instanceId)
  if (!LINK_PURPOSES.includes(input.purpose)) return refuse('Unknown kind of link')

  const { url, filename } = normalizeDocLink(input.url, input.label)

  const { data: last } = await admin
    .from('course_links')
    .select('sort_order')
    .eq('instance_id', instanceId)
    .eq('purpose', input.purpose)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await admin.from('course_links').insert({
    instance_id: instanceId,
    purpose: input.purpose,
    label: filename,
    url,
    // Internal unless said otherwise: a link nobody has looked at yet should
    // not already be in front of students.
    audience: input.audience ?? 'internal',
    sort_order: (last?.sort_order ?? -1) + 1,
    added_by: user.id,
  })
  if (error) {
    if (error.code === '23505') return refuse('That link is already on this course')
    throw new Error(error.message)
  }
  revalidate(instanceId)
}

export async function setCourseLinkAudience(
  instanceId: string,
  linkId: string,
  audience: LibraryAudience
) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin
    .from('course_links')
    .update({ audience })
    .eq('id', linkId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

export async function renameCourseLink(instanceId: string, linkId: string, label: string) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin
    .from('course_links')
    .update({ label: label.trim().slice(0, 200) || null })
    .eq('id', linkId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}

export async function removeCourseLink(instanceId: string, linkId: string) {
  const { admin } = await requireTeam(instanceId)
  const { error } = await admin
    .from('course_links')
    .delete()
    .eq('id', linkId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidate(instanceId)
}
