'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseAccess } from '@/lib/course-access'
import { courseShortName } from '@/lib/courses'
import { refuse, type ActionRefusal, type ActionResult } from '@/lib/action-result'
import {
  albumsEnabled,
  createAlbumFolder,
  folderUrl,
  startResumableUpload,
  trashDriveFile,
} from '@/lib/drive-albums'

// Photos onto the course album, and out of it again.
//
// The rule this file exists to enforce: anyone on the course may add, only
// staff may remove. That is a portal rule rather than a Drive one, because
// Drive permissions are grants to Google accounts and our students sign in
// with a magic link to whatever address they gave us. So no student ever holds
// Drive access at all — the folder is reached only through here.

// One picker's worth. Not a policy about how many photos a course may have,
// just a bound on a single request so a stuck client can't ask for ten
// thousand upload sessions.
const MAX_PER_REQUEST = 200

async function viewer(instanceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const access = await courseAccess(admin, user.id, instanceId)
  if (!access.allowed) throw new Error('Not authorized')

  return { user, admin, isStaff: access.isStaff }
}

function revalidate(instanceId: string) {
  revalidatePath(`/portal/${instanceId}`)
  revalidatePath(`/admin/courses/${instanceId}`)
}

// The folder is created by the first upload and never before it.
//
// A course that never has photos should not leave an empty folder behind, and
// most don't — so there is no "create the folder" button anywhere. The cost is
// that this runs inside the upload path and has to survive two people pressing
// Add at the same moment: both create a folder, and the unique index decides
// which one the course keeps. The loser trashes what it made.
async function ensureFolder(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  userId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('course_links')
    .select('drive_folder_id')
    .eq('instance_id', instanceId)
    .not('drive_folder_id', 'is', null)
    .maybeSingle()
  if (existing?.drive_folder_id) return existing.drive_folder_id

  const { data: inst } = await admin
    .from('course_instances')
    .select('course_type, custom_title, starts_at, location, client_name')
    .eq('id', instanceId)
    .single()
  if (!inst) throw new Error('Course not found')

  // Dated first so the Shared Drive sorts chronologically, and legible to
  // someone who is in Drive rather than in the portal.
  const name = [
    inst.starts_at ?? 'undated',
    courseShortName(inst.course_type, inst.custom_title),
    inst.location || inst.client_name || null,
  ]
    .filter(Boolean)
    .join(' — ')

  const folderId = await createAlbumFolder(name)

  const { error } = await admin.from('course_links').insert({
    instance_id: instanceId,
    purpose: 'photos',
    label: name,
    url: folderUrl(folderId),
    drive_folder_id: folderId,
    // Internal until someone shares it, like every other link on a course. The
    // photos exist before anyone has looked at whether they should go out.
    audience: 'internal',
    added_by: userId,
  })

  if (error) {
    if (error.code === '23505') {
      await trashDriveFile(folderId).catch(() => {})
      const { data: winner } = await admin
        .from('course_links')
        .select('drive_folder_id')
        .eq('instance_id', instanceId)
        .not('drive_folder_id', 'is', null)
        .maybeSingle()
      if (winner?.drive_folder_id) return winner.drive_folder_id
    }
    throw new Error(error.message)
  }

  return folderId
}

export type UploadSession = { name: string; uploadUrl: string }

// ActionResult carries no payload, so this says its own shape. The caller
// tells them apart on `error`, the same field every refusal here uses.
export type UploadSessions = ActionRefusal | { sessions: UploadSession[] }

// Hands the browser one upload URL per file. The bytes never come through us:
// Vercel caps a request body at 4.5MB and a phone photo is routinely larger,
// so the client PUTs straight to Google.
export async function startPhotoUploads(
  instanceId: string,
  files: Array<{ name: string; mimeType: string }>
): Promise<UploadSessions> {
  const { admin, user } = await viewer(instanceId)

  if (!albumsEnabled()) return refuse('Photo albums aren’t configured on this environment')
  if (files.length === 0) return refuse('Choose some photos first')
  if (files.length > MAX_PER_REQUEST) {
    return refuse(`That’s more than ${MAX_PER_REQUEST} at once — add them in a few batches`)
  }
  if (files.some((f) => !/^(image|video)\//.test(f.mimeType))) {
    return refuse('Photos and video only')
  }

  const folderId = await ensureFolder(admin, instanceId, user.id)

  const sessions: UploadSession[] = []
  for (const f of files) {
    sessions.push({ name: f.name, uploadUrl: await startResumableUpload(folderId, f.name, f.mimeType) })
  }

  revalidate(instanceId)
  return { sessions }
}

// Called once the browser has finished a PUT, to record who it was from. Drive
// itself can't say — every file there is uploaded by the service account, so
// this table is the only place a name is attached to a photo.
export async function recordPhotoUpload(instanceId: string, driveFileId: string) {
  const { admin, user } = await viewer(instanceId)

  // Ignore a duplicate rather than failing: the row already says what it needs
  // to, and a retried record shouldn't read to the uploader as a failed upload.
  await admin
    .from('course_photos')
    .upsert(
      { instance_id: instanceId, drive_file_id: driveFileId, uploaded_by: user.id },
      { onConflict: 'drive_file_id', ignoreDuplicates: true }
    )

  revalidate(instanceId)
}

// Staff only, and trashed rather than deleted — Drive keeps it for 30 days.
// Students get no path here at all; the client never renders the control, and
// this refuses regardless of what the client renders.
export async function removeCoursePhoto(instanceId: string, driveFileId: string): Promise<ActionResult> {
  const { admin, isStaff } = await viewer(instanceId)
  if (!isStaff) return refuse('Only instructors can remove photos')

  await trashDriveFile(driveFileId)
  await admin.from('course_photos').delete().eq('drive_file_id', driveFileId)

  revalidate(instanceId)
}
