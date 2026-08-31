import { createAdminClient } from '@/lib/supabase/admin'
import { albumsEnabled, listAlbumPhotos } from '@/lib/drive-albums'
import CourseAlbum, { type AlbumPhotoView } from './CourseAlbum'

// The album's contents, loaded apart from the rest of the course page.
//
// This is the one block that waits on Google. It sits behind its own Suspense
// boundary so the course page — which is mostly about tomorrow morning —
// renders without it, and a slow or unreachable Drive costs the photo grid
// rather than the schedule.
//
// Drive is the source of truth for what the album contains, so an instructor
// who dragged photos in from a laptop appears here alongside everyone who used
// the portal. course_photos only supplies the name against a photo, which Drive
// cannot know: every file there was uploaded by the same service account.
export default async function CourseAlbumSection({
  instanceId,
  canManage,
  album,
}: {
  instanceId: string
  canManage: boolean
  album: { linkId: string; url: string; audience: 'internal' | 'shared'; folderId: string } | null
}) {
  let photos: AlbumPhotoView[] = []

  if (album && albumsEnabled()) {
    const admin = createAdminClient()
    // A Drive outage must not take the section with it — an empty grid above a
    // working Add button is still a usable screen.
    const files = await listAlbumPhotos(album.folderId).catch(() => [])

    const { data: credits } = files.length
      ? await admin
          .from('course_photos')
          .select('drive_file_id, profiles(first_name, last_name)')
          .eq('instance_id', instanceId)
      : { data: [] }

    type Credit = {
      drive_file_id: string
      profiles: { first_name: string | null; last_name: string | null } | null
    }
    const byFile = new Map(
      ((credits ?? []) as unknown as Credit[]).map((c) => [
        c.drive_file_id,
        [c.profiles?.first_name, c.profiles?.last_name].filter(Boolean).join(' ').trim() || null,
      ])
    )

    photos = files.map((f) => ({
      id: f.id,
      name: f.name,
      uploadedBy: byFile.get(f.id) ?? null,
      isVideo: f.mimeType.startsWith('video/'),
    }))
  }

  return (
    <CourseAlbum
      instanceId={instanceId}
      photos={photos}
      canManage={canManage}
      album={album ? { linkId: album.linkId, url: album.url, audience: album.audience } : null}
    />
  )
}
