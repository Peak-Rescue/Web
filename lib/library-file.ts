import { createAdminClient } from '@/lib/supabase/admin'
import { albumsEnabled, findOrCreateFolder, uploadFileToFolder } from '@/lib/drive-albums'
import { bucketForKind } from '@/lib/library'
import { classify, NEEDS_SORTING } from '@/lib/sorting'
import { refuse } from '@/lib/action-result'

// Filing an uploaded file to the library.
//
// The link version of this has existed since the course pages grew an "add to
// library" box, and it files a URL. A file is different in one way that
// matters: it lives in a private bucket and is read through a signed URL that
// lasts an hour, so the row cannot hold a link. It holds the path, and
// /api/library/file/<id> signs one for whoever is asking.
//
// The bytes are left where they are. Copying them into a second bucket to
// make the library's copy "its own" would mean a course deleting its document
// and taking the library row's file with it, or two copies that drift — so
// the row points at the same object the course is using, and deleting a
// course document that the library holds is the thing to guard, not the
// sharing.

const DOC_BUCKET = 'task-documents'
const LIBRARY_FOLDER = 'Peak Rescue Library'

export async function fileToLibrary(
  admin: ReturnType<typeof createAdminClient>,
  {
    path,
    filename,
    instanceId,
    told,
    audience = 'internal',
  }: {
    /** The object in task-documents. */
    path: string
    filename: string
    /** The course it came off, for the place and the discipline. */
    instanceId: string | null
    /** What the person said it is, on the form. Beats the classifier, which
        is guessing from a file name. */
    told?: string
    audience?: 'internal' | 'shared'
  }
): Promise<{ error: string } | { id: string }> {
  // The same file filed twice is the same row. Somebody adding it from two
  // courses is saying it matters, not asking for two copies.
  const { data: already } = await admin
    .from('library_items')
    .select('id')
    .eq('storage_path', path)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()
  if (already) return refuse('That file is already in the library')

  const { data: inst } = instanceId
    ? await admin
        .from('course_instances')
        .select('region, venue_id, course_type, custom_categories')
        .eq('id', instanceId)
        .single()
    : { data: null }

  const verdict = told && told !== 'reference'
    ? { confident: true as const, kind: told, bucket: bucketForKind(told) ?? 'resource', adminOnly: false }
    : classify({ title: filename, url: null, kind: 'reference', bucket: 'resource', source_topic: null })

  const { courseCapabilityCategories } = await import('@/lib/capabilities')

  const { data: created, error } = await admin
    .from('library_items')
    .insert({
      title: filename.replace(/\.[a-z0-9]{1,5}$/i, '') || filename,
      source_type: 'file',
      storage_path: path,
      kind: verdict.confident ? verdict.kind ?? 'reference' : 'reference',
      bucket: verdict.confident ? verdict.bucket ?? 'resource' : 'resource',
      admin_only: verdict.confident ? verdict.adminOnly ?? false : false,
      audience,
      region: inst?.region ?? null,
      venue_id: inst?.venue_id ?? null,
      disciplines: inst
        ? (courseCapabilityCategories(inst.course_type, inst.custom_categories) as string[])
        : [],
      // A file name is weak evidence. When it was not enough, the row says so
      // rather than looking sorted — the same pile the sorting pass leaves.
      topics: verdict.confident ? [] : [NEEDS_SORTING],
      status: 'published',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // The row's url is this route, so every list, picker and course row that
  // already renders `item.url` opens the file without knowing it is one.
  await admin
    .from('library_items')
    .update({ url: `/api/library/file/${created.id}` })
    .eq('id', created.id)

  // Best effort, and deliberately after the row exists: the library works
  // without Drive, and a Drive outage must not be the reason a file could not
  // be filed.
  void backupToDrive(admin, created.id, path, filename)

  return { id: created.id }
}

/** The second copy. Storage objects are not in the database's backups, so a
    promoted file is otherwise a single copy of something somebody decided was
    worth keeping. One flat folder — Drive is not the filing system. */
async function backupToDrive(
  admin: ReturnType<typeof createAdminClient>,
  itemId: string,
  path: string,
  filename: string
): Promise<void> {
  if (!albumsEnabled()) return
  try {
    const { data: file } = await admin.storage.from(DOC_BUCKET).download(path)
    if (!file) return
    const folder = await findOrCreateFolder(LIBRARY_FOLDER)
    const driveId = await uploadFileToFolder(
      folder,
      filename,
      file.type || 'application/octet-stream',
      await file.arrayBuffer()
    )
    await admin.from('library_items').update({ drive_backup_id: driveId }).eq('id', itemId)
  } catch {
    // Nothing reads drive_backup_id to render a row. A missed copy is worth
    // knowing about eventually, not worth failing the filing over.
  }
}

/** The link-shaped sibling of fileToLibrary, for a course row that is a
    pasted URL rather than an upload. Same classification, same tagging from
    the course, same needs-sorting admission when a title is not enough. */
export async function addLinkToLibrary(
  admin: ReturnType<typeof createAdminClient>,
  {
    url,
    title,
    instanceId,
    told,
    audience = 'internal',
  }: {
    url: string
    title: string
    instanceId: string | null
    told?: string
    audience?: 'internal' | 'shared'
  }
): Promise<{ error: string } | { id: string }> {
  const { data: already } = await admin
    .from('library_items')
    .select('id')
    .eq('url', url)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()
  if (already) return refuse('That link is already in the library')

  const { data: inst } = instanceId
    ? await admin
        .from('course_instances')
        .select('region, venue_id, course_type, custom_categories')
        .eq('id', instanceId)
        .single()
    : { data: null }

  const verdict = told && told !== 'reference'
    ? { confident: true as const, kind: told, bucket: bucketForKind(told) ?? 'resource', adminOnly: false }
    : classify({ title, url, kind: 'reference', bucket: 'resource', source_topic: null })

  const { courseCapabilityCategories } = await import('@/lib/capabilities')
  const drive = /drive\.google\.com|docs\.google\.com/i.test(url)

  const { data: created, error } = await admin
    .from('library_items')
    .insert({
      title,
      url,
      source_type: drive ? 'drive' : /youtube\.com|youtu\.be/i.test(url) ? 'youtube' : 'link',
      kind: verdict.confident ? verdict.kind ?? 'reference' : 'reference',
      bucket: verdict.confident ? verdict.bucket ?? 'resource' : 'resource',
      admin_only: verdict.confident ? verdict.adminOnly ?? false : false,
      audience,
      region: inst?.region ?? null,
      venue_id: inst?.venue_id ?? null,
      disciplines: inst
        ? (courseCapabilityCategories(inst.course_type, inst.custom_categories) as string[])
        : [],
      topics: verdict.confident ? [] : [NEEDS_SORTING],
      status: 'published',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: created.id }
}

/** A PlaceSelect value — `region:`, `venue:` or `site:` — as the three
    columns a row stores. A site answers for its venue and the venue for its
    state, so the levels can never contradict each other. */
export async function resolvePlaceValue(
  admin: ReturnType<typeof createAdminClient>,
  raw: string
): Promise<{ venue_id: string | null; site_id: string | null; region: string | null }> {
  const none = { venue_id: null, site_id: null, region: null }
  const i = raw.indexOf(':')
  const level = i === -1 ? '' : raw.slice(0, i)
  const id = i === -1 ? '' : raw.slice(i + 1)
  if (!id) return none

  if (level === 'region') return { ...none, region: id }
  if (level === 'venue') {
    const { data: v } = await admin.from('venues').select('region_code, region').eq('id', id).maybeSingle()
    return { venue_id: id, site_id: null, region: v?.region_code ?? v?.region ?? null }
  }
  if (level === 'site') {
    const { data: s } = await admin
      .from('sites')
      .select('venue_id, region_code, venues(region_code, region)')
      .eq('id', id)
      .maybeSingle()
    const v = s?.venues as unknown as { region_code: string | null; region: string | null } | null
    return {
      venue_id: s?.venue_id ?? null,
      site_id: id,
      region: v?.region_code ?? v?.region ?? s?.region_code ?? null,
    }
  }
  return none
}

/** What the filing form fills in, for the two paths that take one. Everything
    is optional: with nothing said it files the way it always did, from the
    course and the classifier. */
export type FilingChoices = {
  title?: string
  kind?: string
  audience?: 'internal' | 'shared' | 'admin'
  place?: string
  disciplines?: string[]
  topics?: string
  /** The rest of what the filing panel asks. See 242, 250 and 262. */
  note?: string
  clientId?: string | null
  courseTypes?: string[]
}

/** The said-out-loud version of what fileToLibrary and addLinkToLibrary work
    out for themselves. Applied after the row exists so there is one place
    that knows how a library row is shaped. */
export async function applyChoices(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  choices: FilingChoices
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (choices.title?.trim()) update.title = choices.title.trim().slice(0, 300)
  if (choices.kind) {
    update.kind = choices.kind
    const shelf = bucketForKind(choices.kind)
    if (shelf) update.bucket = shelf
  }
  if (choices.audience) {
    update.admin_only = choices.audience === 'admin'
    update.audience = choices.audience === 'shared' ? 'shared' : 'internal'
  }
  if (choices.disciplines) update.disciplines = choices.disciplines
  if (choices.topics !== undefined) {
    update.topics = choices.topics.split(',').map((t) => t.trim()).filter(Boolean)
  }
  if (choices.note !== undefined) update.description = choices.note.trim() || null
  if (choices.clientId !== undefined) update.client_id = choices.clientId
  if (choices.courseTypes !== undefined) update.course_types = choices.courseTypes
  if (choices.place !== undefined) Object.assign(update, await resolvePlaceValue(admin, choices.place))

  const { error } = await admin.from('library_items').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}
