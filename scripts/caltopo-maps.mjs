// What is in the CalTopo account, and what the map library already knows about.
//
// Two auth routes, because CalTopo only documents one of them:
//
//   CALTOPO_CRED_ID + CALTOPO_CRED_SECRET  — a team service account (Team Admin
//     → Details → Create a Service Account). Requests are HMAC-SHA256 signed.
//   CALTOPO_COOKIE                          — the Cookie header copied out of a
//     signed-in browser session, for an individual account with no team API.
//     Same endpoint, session auth instead of a signature.
//
// Either way this only *lists*. The per-access share links — the
// caltopo.com/m/{id}/{code} twins the library stores as read and edit — are not
// in the API; they are made one map at a time in the map's Sharing dialog.
//
// Usage:
//   node scripts/caltopo-maps.mjs <accountId> [> maps.json]

import crypto from 'node:crypto'
import fs from 'node:fs'

const HOST = 'https://caltopo.com'
const accountId = process.argv[2]
if (!accountId) {
  console.error('usage: node scripts/caltopo-maps.mjs <accountId>')
  process.exit(1)
}

function signed(path) {
  const id = process.env.CALTOPO_CRED_ID
  const secret = process.env.CALTOPO_CRED_SECRET
  if (!id || !secret) return null
  const expires = Date.now() + 120000
  const message = `GET ${path}\n${expires}\n`
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(message)
    .digest('base64')
  return `${HOST}${path}?id=${encodeURIComponent(id)}&expires=${expires}&signature=${encodeURIComponent(signature)}`
}

async function caltopo(path) {
  const url = signed(path)
  const res = url
    ? await fetch(url)
    : await fetch(`${HOST}${path}`, {
        headers: {
          Cookie: process.env.CALTOPO_COOKIE ?? '',
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
      })
  const body = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${body.slice(0, 300)}`)
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`Not JSON — probably a sign-in page. First 300 chars:\n${body.slice(0, 300)}`)
  }
}

// The library's side: every map id it already holds a link to, and at what
// access. Two rows for one id is the normal case (read twin + edit twin); two
// *items* for one id is the duplicate this is meant to surface.
async function libraryLinks() {
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
  )
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/library_item_links?select=url,access,audience,item_id,library_items(title,bucket)&limit=2000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  const rows = await res.json()
  const byMap = new Map()
  for (const r of rows) {
    const m = /(?:caltopo|sartopo)\.com\/m\/([A-Z0-9]+)(?:\/([A-Z0-9]+))?/i.exec(r.url ?? '')
    if (!m) continue
    const entry = byMap.get(m[1]) ?? { links: [], items: new Set() }
    entry.links.push({ access: r.access, audience: r.audience, code: m[2] ?? null, url: r.url })
    entry.items.add(r.item_id)
    byMap.set(m[1], entry)
  }
  return byMap
}

const [account, known] = await Promise.all([
  caltopo(`/api/v1/acct/${accountId}/since/0`),
  libraryLinks(),
])

// The account listing nests everything under result/state depending on object
// type; CollaborativeMap is the one that matters.
const raw = account?.result ?? account?.state ?? account
const maps = (Array.isArray(raw) ? raw : Object.values(raw ?? {}).flat())
  .filter((o) => o && (o.class === 'CollaborativeMap' || o.properties?.class === 'CollaborativeMap' || o.properties?.title))
  .map((o) => ({
    id: o.id ?? o.properties?.id,
    title: o.properties?.title ?? o.title ?? '(untitled)',
    sharing: o.properties?.sharing ?? null,
    updated: o.properties?.updated ?? null,
    folderId: o.properties?.folderId ?? null,
  }))
  .filter((m) => m.id)

const report = maps.map((m) => {
  const hit = known.get(m.id)
  return {
    ...m,
    inLibrary: !!hit,
    duplicateItems: hit ? hit.items.size > 1 : false,
    haveRead: !!hit?.links.some((l) => l.access === 'read'),
    haveEdit: !!hit?.links.some((l) => l.access === 'edit'),
    links: hit?.links ?? [],
  }
})

const missing = report.filter((m) => !m.inLibrary)
const halfDone = report.filter((m) => m.inLibrary && !(m.haveRead && m.haveEdit))
console.error(
  `${maps.length} maps in the account — ${report.length - missing.length} already in the library, ` +
  `${missing.length} not, ${halfDone.length} with only one of the two links, ` +
  `${report.filter((m) => m.duplicateItems).length} split across duplicate library items.`
)
console.log(JSON.stringify(report, null, 2))
