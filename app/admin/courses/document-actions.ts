'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { refuse, type ActionResult } from '@/lib/action-result'

// General course documents (contracts, site maps, client paperwork) — files
// attached to the course itself rather than a task. Same private bucket and
// signed-URL flow as task documents.

const DOC_BUCKET = 'task-documents'
const MAX_DOC_BYTES = 20 * 1024 * 1024

async function requireTeam(instanceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') return { user, admin }

  // The people running the course keep its material: a map found the night
  // before, the client's permit, a photo of the gate. Same rule the one-off
  // links have used since they were added — an instructor assigned to this
  // course, and nobody else.
  const { data: assigned } = await admin
    .from('instance_instructors')
    .select('id, instructors!inner(profile_id)')
    .eq('instance_id', instanceId)
    .eq('instructors.profile_id', user.id)
    .maybeSingle()
  if (!assigned) throw new Error('Not authorized')
  return { user, admin }
}


// A file that is too big is the commonest thing to hit here, and the person
// hitting it needs to be told which file — so the whole batch comes back as
// either targets or one refusal, never a half-uploaded set.
export async function createCourseDocUploadTargets(
  instanceId: string,
  files: { name: string; size: number }[]
): Promise<{ targets: { path: string; token: string }[] } | { error: string }> {
  const { admin } = await requireTeam(instanceId)
  const { randomUUID } = await import('crypto')

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_DOC_BYTES) return refuse(`“${file.name}” is over the 20 MB limit`)
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `courses/${instanceId}/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(DOC_BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return { targets }
}

export async function finalizeCourseDocs(
  instanceId: string,
  uploads: { path: string; filename: string }[]
) {
  const { user, admin } = await requireTeam(instanceId)
  if (uploads.length === 0) return
  const { error } = await admin.from('course_documents').insert(
    uploads.map((u) => ({
      instance_id: instanceId,
      path: u.path,
      filename: u.filename,
      uploaded_by: user.id,
    }))
  )
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// A course "document" can also be an external link (Google Drive, Dropbox…)
// — same table and list, url instead of a storage path.
export async function addCourseDocLink(instanceId: string, url: string, title: string) {
  const { user, admin } = await requireTeam(instanceId)
  const link = normalizeDocLink(url, title)
  const { error } = await admin.from('course_documents').insert({
    instance_id: instanceId,
    url: link.url,
    filename: link.filename,
    uploaded_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function renameCourseDoc(
  instanceId: string,
  docId: string,
  filename: string
): Promise<ActionResult> {
  const { admin } = await requireTeam(instanceId)
  const name = filename.trim().slice(0, 200)
  if (!name) return refuse('File name cannot be empty')
  const { error } = await admin
    .from('course_documents')
    .update({ filename: name })
    .eq('id', docId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function deleteCourseDoc(instanceId: string, docId: string): Promise<ActionResult> {
  const { admin } = await requireTeam(instanceId)
  const { data: doc } = await admin
    .from('course_documents')
    .select('path')
    .eq('id', docId)
    .eq('instance_id', instanceId)
    .single()
  if (!doc) return refuse('That file is no longer on this course')
  if (doc.path) await admin.storage.from(DOC_BUCKET).remove([doc.path])
  const { error } = await admin.from('course_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}
