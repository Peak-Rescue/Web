// Prints a Drive file's text, read as a Workspace user via domain-wide
// delegation — the same mechanism the portal uses to serve Classroom
// attachments it doesn't own (see lib/drive.ts and migration 092).
//
// Run with: node --env-file=.env.local scripts/drive-read.mjs <fileId> <actAs>

import { createSign } from 'crypto'

const [fileId, actAs] = process.argv.slice(2)
if (!fileId || !actAs) {
  console.error('usage: drive-read.mjs <fileId> <actAs-email>')
  process.exit(1)
}

const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/drive.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600, sub: actAs,
})}`
const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')
const auth = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${sig}`,
  }),
})
if (!auth.ok) throw new Error(`auth failed: ${(await auth.text()).slice(0, 300)}`)
const { access_token: token } = await auth.json()
const headers = { Authorization: `Bearer ${token}` }

const metaRes = await fetch(
  `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,owners&supportsAllDrives=true`,
  { headers }
)
if (!metaRes.ok) throw new Error(`metadata failed (${metaRes.status}): ${(await metaRes.text()).slice(0, 300)}`)
const meta = await metaRes.json()
console.error(`# ${meta.name}  (${meta.mimeType}, owner ${(meta.owners ?? []).map((o) => o.emailAddress).join(', ')})\n`)

// Google-native files have no bytes to download; they export instead.
const native = meta.mimeType.startsWith('application/vnd.google-apps.')
const url = native
  ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
  : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
const res = await fetch(url, { headers })
if (!res.ok) throw new Error(`read failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
console.log(await res.text())
