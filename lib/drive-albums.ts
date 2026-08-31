// Course photo albums: a folder per course in a Shared Drive we own.
//
// Separate from lib/drive.ts on purpose. That file reads files other people
// put in Drive and needs only drive.readonly; this one creates folders and
// uploads into them, which is a broader scope and a different risk. Keeping
// them apart means the proxy that serves 800 Classroom attachments never holds
// a token that could write.
//
// Unlike the rest of our Google code, nothing here impersonates a person. The
// service account is a member of the Shared Drive in its own right, so it acts
// as itself — which means this needs no domain-wide delegation entry and no
// admin console change, only somebody adding it to the drive.
//
// That works precisely because the files land in a Shared Drive: a service
// account has no Drive storage of its own and cannot own a file anywhere else.
// Here the *drive* owns them, which is the whole point — an album must outlive
// whoever shot it.

import { googleToken, serviceKey } from '@/lib/google-auth'

// Create, upload, list, trash — one scope covers all of it. drive.file would
// be narrower but only ever sees files this app created, and instructors will
// drag photos straight into the folder from a laptop; those must show up too.
const SCOPE = 'https://www.googleapis.com/auth/drive'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export function albumsEnabled(): boolean {
  return Boolean(serviceKey() && process.env.DRIVE_PHOTOS_PARENT)
}

// No subject: googleToken with no user to impersonate returns a token for the
// service identity itself, which sees only what has been shared with it — and
// the Shared Drive has been.
async function token(): Promise<string> {
  return googleToken(SCOPE)
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${await token()}`,
    },
  })
  return res
}

// The folder URL is derivable from the id, so only the id is ever stored.
export function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}

export async function createAlbumFolder(name: string): Promise<string> {
  const parent = process.env.DRIVE_PHOTOS_PARENT
  if (!parent) throw new Error('Drive albums not configured: DRIVE_PHOTOS_PARENT')

  const res = await driveFetch('files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  })
  if (!res.ok) throw new Error(`Drive folder create failed: ${await res.text()}`)

  const { id } = (await res.json()) as { id: string }
  return id
}

// Trash, never delete. Drive keeps a trashed file for 30 days, which is the
// difference between a misclick and a lost photo.
export async function trashDriveFile(fileId: string): Promise<void> {
  const res = await driveFetch(`files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  if (!res.ok) throw new Error(`Drive trash failed: ${await res.text()}`)
}

export type AlbumPhoto = {
  id: string
  name: string
  mimeType: string
  createdTime: string
  width: number | null
  height: number | null
}

// What the folder actually contains. Drive is the source of truth here, so a
// photo an instructor dropped in from a laptop appears alongside the ones
// uploaded through the portal.
export async function listAlbumPhotos(folderId: string): Promise<AlbumPhoto[]> {
  const photos: AlbumPhoto[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, imageMediaMetadata(width, height))',
      orderBy: 'createdTime',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await driveFetch(`files?${params}`)
    if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`)

    const page = (await res.json()) as {
      nextPageToken?: string
      files: Array<{
        id: string
        name: string
        mimeType: string
        createdTime: string
        imageMediaMetadata?: { width?: number; height?: number }
      }>
    }

    for (const f of page.files) {
      photos.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        createdTime: f.createdTime,
        width: f.imageMediaMetadata?.width ?? null,
        height: f.imageMediaMetadata?.height ?? null,
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  return photos
}

// Drive's own rendering of a file, at a size we ask for.
//
// Used for both the grid and the enlarged view rather than serving originals:
// a phone photo is several megabytes, and an iPhone's HEIC doesn't render in
// any browser at all — but Drive's thumbnail of it is a JPEG that does.
// `expectedParent` is the authorisation, not a sanity check. Without it this
// route would stream any file in the Shared Drive to anyone enrolled on any
// course, given only its id — so the folder membership is asked for in the
// same request that fetches the link, and a file that isn't in this course's
// album is a 403 rather than a photo.
export async function fetchDriveThumbnail(
  fileId: string,
  size: number,
  expectedParent: string
): Promise<{ body: ReadableStream<Uint8Array> | null; contentType: string; status: number }> {
  const metaRes = await driveFetch(`files/${fileId}?fields=thumbnailLink,parents&supportsAllDrives=true`)
  if (!metaRes.ok) return { body: null, contentType: 'text/plain', status: metaRes.status }

  const { thumbnailLink, parents } = (await metaRes.json()) as {
    thumbnailLink?: string
    parents?: string[]
  }
  if (!parents?.includes(expectedParent)) return { body: null, contentType: 'text/plain', status: 403 }
  if (!thumbnailLink) return { body: null, contentType: 'text/plain', status: 404 }

  // Drive hands back a link ending in a size hint (=s220). Swapping it is the
  // documented way to ask for another size; the link itself is short-lived,
  // which is why it's fetched here and never handed to the browser.
  const sized = thumbnailLink.replace(/=s\d+(-\w+)?$/, `=s${size}`)
  const res = await fetch(sized, { headers: { Authorization: `Bearer ${await token()}` } })
  if (!res.ok) return { body: null, contentType: 'text/plain', status: res.status }

  return {
    body: res.body,
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
    status: 200,
  }
}

// The file itself, for video.
//
// A thumbnail is a still, so playback needs the real bytes — and needs them
// range-served: Safari will not play a video at all without it, and seeking
// anywhere in a clip depends on it. Drive honours Range on alt=media, so the
// header is passed straight through in both directions rather than us buffering
// a video to work out its length.
export async function fetchDriveMedia(
  fileId: string,
  expectedParent: string,
  range: string | null
): Promise<{
  body: ReadableStream<Uint8Array> | null
  status: number
  headers: Record<string, string>
}> {
  const metaRes = await driveFetch(`files/${fileId}?fields=mimeType,parents&supportsAllDrives=true`)
  if (!metaRes.ok) return { body: null, status: metaRes.status, headers: {} }

  const meta = (await metaRes.json()) as { mimeType?: string; parents?: string[] }
  if (!meta.parents?.includes(expectedParent)) return { body: null, status: 403, headers: {} }

  const res = await driveFetch(`files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: range ? { Range: range } : {},
  })
  if (!res.ok && res.status !== 206) return { body: null, status: res.status, headers: {} }

  const headers: Record<string, string> = {
    'Content-Type': meta.mimeType ?? res.headers.get('content-type') ?? 'application/octet-stream',
    // Says a range *can* be asked for. Without it the browser downloads the
    // whole clip before playing a second of it.
    'Accept-Ranges': 'bytes',
  }
  for (const h of ['content-length', 'content-range']) {
    const v = res.headers.get(h)
    if (v) headers[h === 'content-range' ? 'Content-Range' : 'Content-Length'] = v
  }

  return { body: res.body, status: res.status, headers }
}

// A one-shot URL the browser can PUT bytes to directly.
//
// The upload cannot go through us: Vercel caps a request body at 4.5MB and
// phone photos routinely exceed that. Drive's resumable session URI carries
// its own authorisation and is scoped to this one file in this one folder, so
// handing it to the client grants nothing else.
//
// `origin` is not optional in practice. Google decides whether a session is
// CORS-enabled when the session is *opened*, not when it is written to — so an
// origin declared here is what puts Access-Control-Allow-Origin on the
// browser's upload response. Without it the upload still succeeds and the file
// still lands, but the browser discards the reply it cannot read and reports a
// bare "Failed to fetch" over a photo that is already in Drive.
export async function startResumableUpload(
  folderId: string,
  name: string,
  mimeType: string,
  origin: string | null
): Promise<string> {
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    }
  )
  if (!res.ok) throw new Error(`Drive upload session failed: ${await res.text()}`)

  const location = res.headers.get('location')
  if (!location) throw new Error('Drive upload session returned no location')
  return location
}
