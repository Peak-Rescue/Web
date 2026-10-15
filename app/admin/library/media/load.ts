import { createAdminClient } from '@/lib/supabase/admin'
import { folderUrl } from '@/lib/drive-albums'
import {
  albumSubtitle, albumTitle, inheritedDisciplines,
  type AlbumCourse, type MediaAlbum,
} from '@/lib/media'

/** Every album there is: one per course that has anything in it, plus the
    general one. Counts come from the rows rather than from Drive — Drive is
    asked for the pictures themselves only once an album is opened, and asking
    it fifteen times to render a list of fifteen names would make the list the
    slowest page in the portal. */
export async function loadMediaShelf(): Promise<{ albums: MediaAlbum[]; generalFolder: string | null }> {
  const admin = createAdminClient()

  const [{ data: photoRows }, { data: linkRows }, { data: folder }] = await Promise.all([
    admin.from('course_photos').select('instance_id, created_at, disciplines, topics'),
    admin.from('course_links').select('instance_id, url, drive_folder_id').eq('purpose', 'photos'),
    admin.from('media_folders').select('drive_folder_id').eq('slug', 'general').maybeSingle(),
  ])

  const photos = (photoRows ?? []) as {
    instance_id: string | null; created_at: string; disciplines: string[] | null; topics: string[] | null
  }[]

  const instanceIds = [...new Set(photos.map((p) => p.instance_id).filter((x): x is string => Boolean(x)))]
  const { data: courseRows } = instanceIds.length
    ? await admin
        .from('course_instances')
        .select('id, course_type, custom_title, custom_categories, location, client_name, starts_at, ends_at, ref_number')
        .in('id', instanceIds)
    : { data: [] }
  const courses = new Map((((courseRows ?? []) as unknown) as AlbumCourse[]).map((c) => [c.id, c]))

  const folderFor = new Map<string, string>()
  for (const l of (linkRows ?? []) as { instance_id: string; url: string | null; drive_folder_id: string | null }[]) {
    if (l.drive_folder_id) folderFor.set(l.instance_id, l.url ?? folderUrl(l.drive_folder_id))
  }

  const byAlbum = new Map<string, typeof photos>()
  for (const p of photos) {
    const k = p.instance_id ?? '_general'
    byAlbum.set(k, [...(byAlbum.get(k) ?? []), p])
  }

  const albums: MediaAlbum[] = []
  for (const [k, rows] of byAlbum) {
    const latest = rows.map((r) => r.created_at).sort().at(-1) ?? null
    // What was typed on the items themselves, which for a course album is an
    // override and for the general one is all there is.
    const own = [...new Set(rows.flatMap((r) => r.disciplines ?? []))]

    if (k === '_general') {
      albums.push({
        instanceId: null,
        title: 'General',
        subtitle: 'Shot for no course in particular',
        folderUrl: folder?.drive_folder_id ? folderUrl(folder.drive_folder_id) : null,
        count: rows.length,
        latest,
        disciplines: own,
        courseType: null,
        location: null,
        startsAt: null,
      })
      continue
    }

    const c = courses.get(k)
    if (!c) continue // the course was deleted; the photos go with it on cascade
    albums.push({
      instanceId: c.id,
      title: albumTitle(c),
      subtitle: albumSubtitle(c),
      folderUrl: folderFor.get(c.id) ?? null,
      count: rows.length,
      latest,
      // Inherited, plus anything typed on an individual drop.
      disciplines: [...new Set([...inheritedDisciplines(c), ...own])],
      courseType: c.course_type,
      location: c.location,
      startsAt: c.starts_at,
    })
  }

  // Most recent first: an album is looked for by when it happened far more
  // often than by what it is called.
  albums.sort((a, b) => {
    if (a.instanceId === null) return 1
    if (b.instanceId === null) return -1
    return (b.startsAt ?? b.latest ?? '').localeCompare(a.startsAt ?? a.latest ?? '')
  })

  return { albums, generalFolder: folder?.drive_folder_id ?? null }
}
