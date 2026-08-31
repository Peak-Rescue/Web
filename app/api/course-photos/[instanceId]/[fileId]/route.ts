import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseAccess } from '@/lib/course-access'
import { albumsEnabled, fetchDriveMedia, fetchDriveThumbnail } from '@/lib/drive-albums'

// One photo out of a course album, at the size asked for.
//
// With a size (?s=), Drive's own rendering rather than the original bytes: a
// phone photo is several megabytes, and an iPhone's HEIC doesn't display in any
// browser — Drive's version of it is a JPEG that does. The original is
// untouched in the folder either way.
//
// Without one, the file itself, range-served. That path is for video, where a
// still is not the point.
//
// Students never hold Drive access, so this route is the only way the photos
// are reachable, and every check that matters happens here: on the course, and
// — unless you're staff — on an album that has actually been shared.

const SIZES = [400, 1600]

export async function GET(
  request: Request,
  { params }: { params: Promise<{ instanceId: string; fileId: string }> }
) {
  const { instanceId, fileId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  if (!albumsEnabled()) {
    return NextResponse.json({ error: 'Photo albums are not configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { allowed, isStaff } = await courseAccess(admin, user.id, instanceId)
  if (!allowed) return NextResponse.json({ error: 'Not available' }, { status: 403 })

  const { data: album } = await admin
    .from('course_links')
    .select('drive_folder_id, audience')
    .eq('instance_id', instanceId)
    .not('drive_folder_id', 'is', null)
    .maybeSingle()

  if (!album?.drive_folder_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isStaff && album.audience !== 'shared') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const sizeParam = new URL(request.url).searchParams.get('s')

  if (sizeParam === null) {
    const media = await fetchDriveMedia(
      fileId,
      album.drive_folder_id,
      request.headers.get('range')
    )
    if (!media.body) {
      return NextResponse.json({ error: 'Could not read that file' }, { status: media.status })
    }
    return new NextResponse(media.body, {
      status: media.status,
      headers: { ...media.headers, 'Cache-Control': 'private, max-age=86400' },
    })
  }

  // A fixed pair rather than any number: an open size parameter is a way to
  // make Drive render arbitrarily large images on request.
  const asked = Number(sizeParam)
  const size = SIZES.includes(asked) ? asked : SIZES[0]

  const image = await fetchDriveThumbnail(fileId, size, album.drive_folder_id)
  if (!image.body) {
    return NextResponse.json({ error: 'Could not read that photo' }, { status: image.status })
  }

  return new NextResponse(image.body, {
    headers: {
      'Content-Type': image.contentType,
      // Private: the response is one person's authorised view of a photo, and
      // must not be held in a shared cache. Long max-age all the same — a
      // Drive file id and a size together always mean the same image.
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
