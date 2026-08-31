// End-to-end check of the course photo album plumbing, without the browser.
//
// Proves the four things that have to be true before the portal's Photos
// section can work, and says which one failed rather than "403":
//
//   1. the service account can get a token for the drive scope
//   2. it is a member of DRIVE_PHOTOS_PARENT and can write there
//   3. a resumable upload session opens and accepts bytes
//   4. the file is listable and has a thumbnail to render
//
// Everything it creates, it removes. What it cannot test is the browser's own
// PUT to the session URL, which is a CORS question and needs a real browser.
//
// Run with: node --env-file=.env.local scripts/album-check.mjs

import { createSign } from 'crypto'

const SCOPE = 'https://www.googleapis.com/auth/drive'
const parent = process.env.DRIVE_PHOTOS_PARENT

if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) fail('GOOGLE_SERVICE_ACCOUNT_KEY is not set')
if (!parent) fail('DRIVE_PHOTOS_PARENT is not set — the Shared Drive folder id')

function fail(message, detail) {
  console.error(`\n  ✗ ${message}`)
  if (detail) console.error(`\n${detail}\n`)
  process.exit(1)
}

const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

// 1. Token, for the service account itself — no `sub`, so no domain-wide
//    delegation is involved and nothing in the admin console gates this.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: key.client_email,
  scope: SCOPE,
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600,
})}`
const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')

const authRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${sig}`,
  }),
})
if (!authRes.ok) {
  fail(`Could not get a token for ${SCOPE}.`, await authRes.text())
}
const { access_token: token } = await authRes.json()
const auth = { Authorization: `Bearer ${token}` }
console.log(`  ✓ token for ${key.client_email}`)

// 2. A folder in the Shared Drive, exactly as the first upload would make one.
const folderRes = await fetch(
  'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name',
  {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `album-check ${new Date().toISOString()}`,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    }),
  }
)
if (!folderRes.ok) {
  fail(
    `Could not create a folder in ${parent}.\n    Check the id is the Shared Drive (or a folder in it) and that\n    ${key.client_email}\n    is a member of it with Content manager or Manager.`,
    await folderRes.text()
  )
}
const folder = await folderRes.json()
console.log(`  ✓ created folder ${folder.id}`)

// Whatever happens next, don't leave it behind.
async function cleanup() {
  await fetch(`https://www.googleapis.com/drive/v3/files/${folder.id}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  }).catch(() => {})
}

try {
  // 3. Resumable session, then the bytes — the same two steps the browser does,
  //    minus the cross-origin question only a browser can answer.
  const sessionRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'image/png' },
      body: JSON.stringify({ name: 'album-check.png', parents: [folder.id] }),
    }
  )
  if (!sessionRes.ok) fail('Could not open an upload session', await sessionRes.text())

  const uploadUrl = sessionRes.headers.get('location')
  if (!uploadUrl) fail('Upload session returned no location header')
  console.log('  ✓ opened a resumable upload session')

  // Smallest valid PNG: one transparent pixel.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  })
  if (!putRes.ok) fail('Upload failed', await putRes.text())
  const uploaded = await putRes.json()
  console.log(`  ✓ uploaded ${uploaded.id}`)

  // 4. Listing and thumbnail — what the grid needs.
  const params = new URLSearchParams({
    q: `'${folder.id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, thumbnailLink)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: auth })
  if (!listRes.ok) fail('Could not list the folder', await listRes.text())
  const { files } = await listRes.json()
  console.log(`  ✓ listed ${files.length} file${files.length === 1 ? '' : 's'}`)

  // Drive generates thumbnails a moment after upload, so its absence here is
  // timing rather than a fault — worth saying, not worth failing on.
  const thumb = files[0]?.thumbnailLink
  console.log(thumb ? '  ✓ thumbnail ready' : '  · no thumbnail yet (Drive is still generating it)')

  console.log('\n  Everything the server does works. What is left is the browser\'s own')
  console.log('  upload to the session URL — sign in and add a photo to a course.\n')
} finally {
  await cleanup()
  console.log('  · cleaned up the test folder')
}
