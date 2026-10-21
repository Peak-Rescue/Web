'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDocLink } from '@/lib/doc-links'
import { refuse, type ActionResult } from '@/lib/action-result'
import { classify } from '@/lib/sorting'
import { courseCapabilityCategories } from '@/lib/capabilities'
import { type Venue } from '@/lib/library'
import { type CurriculumFilingDraft, type CurriculumFilingChoices } from './actions'

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
  // The library may be pointing at this very object — filing a file to the
  // library shares it rather than copying it, so removing the bytes here
  // would empty a library row that nobody touched. The course row goes; the
  // file stays as long as the library wants it.
  if (doc.path) {
    const { data: kept } = await admin
      .from('library_items')
      .select('id')
      .eq('storage_path', doc.path)
      .neq('status', 'archived')
      .limit(1)
      .maybeSingle()
    if (!kept) await admin.storage.from(DOC_BUCKET).remove([doc.path])
  }
  const { error } = await admin.from('course_documents').delete().eq('id', docId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// Filing a course file to the library, so the next course can reach for it.
//
// Asked, not assumed. It used to ask one question — what is it — and work
// the rest out from the course, so a manual that is only ever about Bridger
// Bowl arrived with whatever place the course happened to carry, and the
// only way to say otherwise was to go and find it in the library afterwards.
//
// Same form the curriculum and the contacts use, so filing asks the same
// questions wherever it happens.
export async function courseDocFilingDraft(
  instanceId: string,
  docId: string
): Promise<CurriculumFilingDraft> {
  const { admin } = await requireTeam(instanceId)
  const { data: doc } = await admin
    .from('course_documents')
    .select('path, url, filename')
    .eq('id', docId)
    .eq('instance_id', instanceId)
    .single()
  if (!doc) return { error: 'That file is no longer on this course' }

  // Already filed: there is nothing to ask, and a second copy is what the
  // dedupe exists to prevent.
  const { data: existing } = doc.path
    ? await admin.from('library_items').select('id, title, admin_only').eq('storage_path', doc.path).neq('status', 'archived').limit(1).maybeSingle()
    : await admin.from('library_items').select('id, title, admin_only').eq('url', doc.url ?? '').neq('status', 'archived').limit(1).maybeSingle()
  if (existing) {
    return { existing: { id: existing.id, title: existing.title, adminOnly: existing.admin_only } }
  }

  const [{ data: inst }, { data: venueRows }, { data: siteRows }] = await Promise.all([
    admin.from('course_instances').select('region, venue_id, course_type, custom_categories').eq('id', instanceId).single(),
    admin.from('venues').select('id, name, region, region_code, client_name, notes, links, contacts, active').order('name'),
    admin.from('sites').select('id, name, kind, beta, venue_id, venues(name)').eq('active', true).order('name'),
  ])

  const title = (doc.filename ?? 'Document').replace(/\.[a-z0-9]{1,5}$/i, '')
  const verdict = classify({ title, url: doc.url ?? null, kind: 'reference', bucket: 'resource', source_topic: null })

  return {
    draft: {
      title,
      kind: verdict.confident ? verdict.kind ?? 'reference' : 'reference',
      audience: 'internal',
      // The course's place is the guess, not the answer — see above.
      place: inst?.venue_id ? `venue:${inst.venue_id}` : inst?.region ? `region:${inst.region}` : '',
      disciplines: inst ? (courseCapabilityCategories(inst.course_type, inst.custom_categories) as string[]) : [],
      topics: '',
      unsure: !verdict.confident,
    },
    venues: (venueRows ?? []) as Venue[],
    sites: ((siteRows ?? []) as unknown as {
      id: string; name: string; kind: string | null; beta: string | null; venue_id: string | null; venues: { name: string } | null
    }[]).map((x) => ({ id: x.id, name: x.name, kind: x.kind, beta: x.beta, venue_id: x.venue_id, venue_name: x.venues?.name ?? null })),
  }
}

export async function fileCourseDocToLibrary(
  instanceId: string,
  docId: string,
  choices?: CurriculumFilingChoices
): Promise<ActionResult> {
  const { admin } = await requireTeam(instanceId)
  const { data: doc } = await admin
    .from('course_documents')
    .select('path, url, filename')
    .eq('id', docId)
    .eq('instance_id', instanceId)
    .single()
  if (!doc) return refuse('That file is no longer on this course')

  const { fileToLibrary, addLinkToLibrary, applyChoices } = await import('@/lib/library-file')
  const told = choices?.kind
  const r = doc.path
    ? await fileToLibrary(admin, {
        path: doc.path,
        filename: doc.filename ?? 'Document',
        instanceId,
        told,
      })
    : doc.url
      ? await addLinkToLibrary(admin, {
          url: doc.url,
          title: choices?.title || doc.filename || 'Document',
          instanceId,
          told,
        })
      : refuse('That row has neither a file nor a link to save')
  if ('error' in r) return r

  if (choices) await applyChoices(admin, r.id, choices)

  revalidatePath(`/admin/courses/${instanceId}`)
  revalidatePath('/admin/library')
}
