'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'

// General course documents (contracts, site maps, client paperwork) — files
// attached to the course itself rather than a task. Same private bucket and
// signed-URL flow as task documents.

const DOC_BUCKET = 'task-documents'
const MAX_DOC_BYTES = 20 * 1024 * 1024

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return { user, admin }
}

export async function createCourseDocUploadTargets(
  instanceId: string,
  files: { name: string; size: number }[]
): Promise<{ path: string; token: string }[]> {
  const { admin } = await requireAdmin()
  const { randomUUID } = await import('crypto')

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_DOC_BYTES) throw new Error(`"${file.name}" is over the 20 MB limit`)
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `courses/${instanceId}/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(DOC_BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

export async function finalizeCourseDocs(
  instanceId: string,
  uploads: { path: string; filename: string }[]
) {
  const { user, admin } = await requireAdmin()
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
  const { user, admin } = await requireAdmin()
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

export async function renameCourseDoc(instanceId: string, docId: string, filename: string) {
  const { admin } = await requireAdmin()
  const name = filename.trim().slice(0, 200)
  if (!name) throw new Error('File name cannot be empty')
  const { error } = await admin
    .from('course_documents')
    .update({ filename: name })
    .eq('id', docId)
    .eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

export async function deleteCourseDoc(instanceId: string, docId: string) {
  const { admin } = await requireAdmin()
  const { data: doc } = await admin
    .from('course_documents')
    .select('path')
    .eq('id', docId)
    .eq('instance_id', instanceId)
    .single()
  if (!doc) throw new Error('Document not found')
  if (doc.path) await admin.storage.from(DOC_BUCKET).remove([doc.path])
  const { error } = await admin.from('course_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}
