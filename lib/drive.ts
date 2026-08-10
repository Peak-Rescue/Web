// Serving Drive files through the portal.
//
// Classroom silently shared every attachment with the students in a class.
// The portal linking to the same Drive files does not, so a student clicking
// one would hit Google's "request access" page. Rather than loosening the
// sharing on ~800 files, the portal fetches them with the service account
// (which already has Drive read access via domain-wide delegation) and streams
// them to people it has decided may see them.
//
// Files stay in Drive and stay the source of truth; access is decided by the
// portal's own permissions.

import { googleToken, serviceKey } from '@/lib/google-auth'

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

export function driveProxyEnabled(): boolean {
  return Boolean(serviceKey() && process.env.GCAL_INVITE_AS)
}

async function getToken(subject?: string): Promise<string> {
  const sub = subject ?? process.env.GCAL_INVITE_AS
  if (!sub) throw new Error('Drive access not configured')
  return googleToken(SCOPE, sub)
}

// Google-native formats have no bytes to download; they're exported instead.
const EXPORT_AS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.drawing': { mime: 'application/pdf', ext: 'pdf' },
}

export type DriveFile = {
  body: ReadableStream<Uint8Array> | null
  contentType: string
  filename: string
  status: number
}

export async function fetchDriveFile(fileId: string, readAs?: string): Promise<DriveFile> {
  const token = await getToken(readAs)
  const auth = { Authorization: `Bearer ${token}` }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType&supportsAllDrives=true`,
    { headers: auth }
  )
  if (!metaRes.ok) {
    return { body: null, contentType: 'text/plain', filename: '', status: metaRes.status }
  }
  const meta = (await metaRes.json()) as { name: string; mimeType: string }

  const exportAs = EXPORT_AS[meta.mimeType]
  const url = exportAs
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportAs.mime)}`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`

  const fileRes = await fetch(url, { headers: auth })
  if (!fileRes.ok) {
    return { body: null, contentType: 'text/plain', filename: meta.name, status: fileRes.status }
  }

  return {
    body: fileRes.body,
    // Drive's own mimeType beats the download response header, which is
    // sometimes octet-stream — and octet-stream always downloads, even for a
    // PDF the browser could have rendered.
    contentType: exportAs?.mime ?? meta.mimeType ?? fileRes.headers.get('content-type') ?? 'application/octet-stream',
    filename: exportAs ? `${meta.name}.${exportAs.ext}` : meta.name,
    status: 200,
  }
}

// Drive file id from any of the URL shapes we store.
export function driveIdFromUrl(url: string | null): string | null {
  if (!url) return null
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) ??
    url.match(/[?&]id=([^&#]+)/) ??
    url.match(/docs\.google\.com\/\w+\/d\/([^/?#]+)/)
  return m?.[1] ?? null
}

// Finds a staff account that can read a file. Classroom attachments sit in the
// uploader's Drive shared with their class, so the portal's default identity
// often can't see them — but someone in the domain always can, and delegation
// lets us be them. Cheaper to remember the answer than to re-discover it.
export async function findDriveReader(
  fileId: string,
  candidates: string[]
): Promise<string | null> {
  for (const who of candidates) {
    try {
      const token = await getToken(who)
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) return who
    } catch {
      // try the next account
    }
  }
  return null
}
