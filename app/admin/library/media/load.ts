import { createAdminClient } from '@/lib/supabase/admin'
import { folderUrl } from '@/lib/drive-albums'
import {
  albumSubtitle, albumTitle, inheritedDisciplines,
  type AlbumCourse, type MediaAlbum,
} from '@/lib/media'
import type { LibraryItem } from '@/lib/library'

/** Every album there is: one per course that has anything in it, plus the
    general one. Counts come from the rows rather than from Drive — Drive is
    asked for the pictures themselves only once an album is opened, and asking
    it fifteen times to render a list of fifteen names would make the list the
    slowest page in the portal. */
export async function loadMediaShelf(): Promise<{
  albums: MediaAlbum[]
  /** Albums that live somewhere else — a Google Photos link, a Drive folder
      somebody pasted in before the portal grew its own. They are library rows
      rather than course_photos, and they belong on this card rather than on a
      document shelf: nobody browsing Reference is looking for the Coco Cay
      pictures. Teaching videos are deliberately not here; a clip chosen for
      the curriculum is curriculum. */
  linked: LibraryItem[]
  generalFolder: string | null
}> {
  const admin = createAdminClient()

  const [{ data: photoRows }, { data: linkRows }, { data: folder }, { data: linkedRows }] = await Promise.all([
    admin.from('course_photos').select('instance_id, created_at, disciplines, topics'),
    admin.from('course_links').select('instance_id, url, drive_folder_id').eq('purpose', 'photos'),
    admin.from('media_folders').select('drive_folder_id').eq('slug', 'general').maybeSingle(),
    admin
      .from('library_items')
      .select('id, title, description, source_type, url, edit_url, drive_file_id, kind, audience, disciplines, topics, admin_only, venue_id, site_id, expires_at, status, bucket, region, source_class, source_topic, source_item, library_item_links(id, url, access, audience)')
      .eq('kind', 'media')
      .eq('status', 'published')
      .order('title'),
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

  const linked = ((linkedRows ?? []) as unknown as (LibraryItem & { library_item_links?: LibraryItem['links'] })[])
    .map((r) => ({ ...r, links: r.library_item_links ?? [] }) as LibraryItem)

  return { albums, linked, generalFolder: folder?.drive_folder_id ?? null }
}
