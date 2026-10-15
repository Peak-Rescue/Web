'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { albumsEnabled, createAlbumFolder, startResumableUpload, trashDriveFile } from '@/lib/drive-albums'
import { CAPABILITY_ORDER } from '@/lib/capabilities'
import { refuse, type ActionRefusal, type ActionResult } from '@/lib/action-result'

const MAX_PER_REQUEST = 25
const VALID_DISCIPLINES = new Set<string>(CAPABILITY_ORDER)

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) throw new Error('Not authorized')
  return { admin, userId: user.id }
}

function revalidate() {
  revalidatePath('/admin/library')
}

/** The general album's folder, made by the first upload into it and never
    before — the same bargain a course's folder makes. An empty folder nobody
    asked for is worse than one that appears when it is needed. */
async function ensureGeneralFolder(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data: existing } = await admin
    .from('media_folders')
    .select('drive_folder_id')
    .eq('slug', 'general')
    .maybeSingle()
  if (existing?.drive_folder_id) return existing.drive_folder_id

  const folderId = await createAlbumFolder('General — Peak Rescue media')
  const { error } = await admin.from('media_folders').insert({ slug: 'general', drive_folder_id: folderId })
  if (error) {
    // Two uploads racing both made a folder; the primary key decides which one
    // is the album and the loser's folder goes in the bin.
    if (error.code === '23505') {
      await trashDriveFile(folderId).catch(() => {})
      const { data: winner } = await admin
        .from('media_folders').select('drive_folder_id').eq('slug', 'general').maybeSingle()
      if (winner?.drive_folder_id) return winner.drive_folder_id
    }
    throw new Error(error.message)
  }
  return folderId
}

export type UploadSession = { name: string; uploadUrl: string }
export type UploadSessions = ActionRefusal | { sessions: UploadSession[] }

/** Hands the browser one upload URL per file, exactly as a course album does:
    the bytes go straight to Google, because Vercel caps a request body at
    4.5MB and a phone photo is routinely larger. */
export async function startGeneralUploads(
  files: Array<{ name: string; mimeType: string }>
): Promise<UploadSessions> {
  const { admin } = await requireStaff()

  if (!albumsEnabled()) return refuse('Photo albums aren’t configured on this environment')
  if (files.length === 0) return refuse('Choose some photos or videos first')
  if (files.length > MAX_PER_REQUEST) {
    return refuse(`That’s more than ${MAX_PER_REQUEST} at once — add them in a few batches`)
  }
  if (files.some((f) => !/^(image|video)\//.test(f.mimeType))) {
    return refuse('Photos and videos only')
  }

  const folderId = await ensureGeneralFolder(admin)
  const origin = (await headers()).get('origin')

  const sessions: UploadSession[] = []
  for (const f of files) {
    sessions.push({ name: f.name, uploadUrl: await startResumableUpload(folderId, f.name, f.mimeType, origin) })
  }
  return { sessions }
}

/** Records the row once the PUT lands, with the tags chosen for the drop.
 *
 * Per drop, not per file. Tagging forty photos one at a time is the job that
 * does not get done, and a drop is almost always one shoot of one thing — so
 * the tags are asked for once, before the files go, and every file in that
 * batch carries them. A photo that needs its own is retagged afterwards.
 */
export async function recordGeneralUpload(
  driveFileId: string,
  tags: { disciplines: string[]; caption: string | null }
) {
  const { admin, userId } = await requireStaff()
  await admin.from('course_photos').upsert(
    {
      instance_id: null,
      drive_file_id: driveFileId,
      uploaded_by: userId,
      disciplines: tags.disciplines.filter((d) => VALID_DISCIPLINES.has(d)),
      caption: tags.caption?.trim() || null,
    },
    { onConflict: 'drive_file_id', ignoreDuplicates: true }
  )
  revalidate()
}

/** Retagging after the fact — a whole album at once, or the general one. The
    counterpart to tagging the drop: the drop is tagged before anyone has seen
    the pictures, and sometimes that turns out to be wrong. */
export async function tagMedia(
  scope: { instanceId: string | null },
  disciplines: string[]
): Promise<ActionResult> {
  const { admin } = await requireStaff()
  const clean = disciplines.filter((d) => VALID_DISCIPLINES.has(d))
  const q = admin.from('course_photos').update({ disciplines: clean })
  const { error } = scope.instanceId
    ? await q.eq('instance_id', scope.instanceId)
    : await q.is('instance_id', null)
  if (error) throw new Error(error.message)
  revalidate()
}
