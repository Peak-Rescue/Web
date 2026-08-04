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

import { createSign } from 'crypto'

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

type ServiceKey = { client_email: string; private_key: string }

function serviceKey(): ServiceKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    const k = JSON.parse(raw)
    return k.client_email && k.private_key ? k : null
  } catch {
    return null
  }
}

export function driveProxyEnabled(): boolean {
  return Boolean(serviceKey() && process.env.GCAL_INVITE_AS)
}

const cached = new Map<string, { token: string; exp: number }>()

async function getToken(subject?: string): Promise<string> {
  const sub = subject ?? process.env.GCAL_INVITE_AS
  const hit = cached.get(sub ?? '')
  if (hit && hit.exp > Date.now() + 60_000) return hit.token
  const key = serviceKey()
  if (!key || !sub) throw new Error('Drive access not configured')

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    sub,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`Drive auth failed: ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached.set(sub, { token: data.access_token, exp: Date.now() + data.expires_in * 1000 })
  return data.access_token
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
    contentType: exportAs?.mime ?? fileRes.headers.get('content-type') ?? 'application/octet-stream',
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
