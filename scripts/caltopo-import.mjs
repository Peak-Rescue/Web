// Shelve the CalTopo account's maps in the map library.
//
// Reads the listing scripts/caltopo-maps.mjs writes, re-checks the library
// live (so a second run is a no-op, not a second copy), and inserts what is
// missing as a *pending* item with one link: the bare map URL, read access,
// instructors only.
//
// Deliberately conservative, for the reason migration 146 gives: widening who
// sees a map is a decision for a person in the editor, not something a bulk
// import makes on everyone's behalf while nobody is watching. The students'
// twin is a CalTopo access code that has to be generated per map anyway, so
// this leaves the audience where it can do no harm and prints the worklist.
//
// Usage:
//   node scripts/caltopo-import.mjs maps.json          # dry run
//   node scripts/caltopo-import.mjs maps.json --apply

import fs from 'node:fs'

const file = process.argv[2]
const apply = process.argv.includes('--apply')
if (!file) {
  console.error('usage: node scripts/caltopo-import.mjs <maps.json> [--apply]')
  process.exit(1)
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  })
)
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${body.slice(0, 400)}`)
  return body ? JSON.parse(body) : null
}

const MAP_URL = /(?:caltopo|sartopo)\.com\/m\/([A-Z0-9]+)(?:\/([A-Z0-9]+))?/i

// Every CalTopo map id the library already points at, however it points at it:
// the item's own url, or any of its links. Both, because the old rows predate
// library_item_links and only some were carried over.
async function shelved() {
  const [items, links] = await Promise.all([
    rest('library_items?select=id,title,url,status&bucket=eq.map&limit=2000'),
    rest('library_item_links?select=item_id,url,access,audience&limit=5000'),
  ])
  const byMap = new Map()
  const note = (url, entry) => {
    const m = MAP_URL.exec(url ?? '')
    if (!m) return
    const e = byMap.get(m[1]) ?? { items: new Set(), links: [] }
    if (entry.item_id) e.items.add(entry.item_id)
    if (entry.access) e.links.push(entry)
    byMap.set(m[1], e)
  }
  for (const i of items) if (i.status !== 'archived') note(i.url, { item_id: i.id, title: i.title })
  for (const l of links) note(l.url, l)
  return byMap
}

const maps = JSON.parse(fs.readFileSync(file, 'utf8'))
const known = await shelved()

const missing = []
const oneLink = []
const duplicates = []
for (const m of maps) {
  const hit = known.get(m.id)
  if (!hit) { missing.push(m); continue }
  if (hit.items.size > 1) duplicates.push({ ...m, items: [...hit.items] })
  const access = new Set(hit.links.map((l) => l.access))
  if (!(access.has('read') && access.has('edit'))) oneLink.push({ ...m, has: [...access].join('+') || 'url only' })
}

console.log(`${maps.length} maps in the account`)
console.log(`  ${missing.length} not in the library — this run inserts them`)
console.log(`  ${oneLink.length} shelved with only one kind of link — need an access code pasted in the editor`)
console.log(`  ${duplicates.length} split across more than one library item — merge by hand`)

if (missing.length) {
  console.log('\nTo insert:')
  for (const m of missing) console.log(`  ${m.id.padEnd(10)} ${m.title}`)
}
if (oneLink.length) {
  console.log('\nNeeds its twin:')
  for (const m of oneLink) console.log(`  ${m.id.padEnd(10)} ${String(m.has).padEnd(12)} ${m.title}`)
}
if (duplicates.length) {
  console.log('\nDuplicate items for one map:')
  for (const m of duplicates) console.log(`  ${m.id.padEnd(10)} ${m.title} — items ${m.items.join(', ')}`)
}

if (!apply) {
  console.log('\nDry run. Re-run with --apply to insert.')
  process.exit(0)
}

for (const m of missing) {
  const url = `https://caltopo.com/m/${m.id}`
  const [item] = await rest('library_items', {
    method: 'POST',
    body: JSON.stringify({
      title: m.title,
      url,
      source_type: 'link',
      kind: 'map',
      bucket: 'map',
      audience: 'internal',
      disciplines: [],
      topics: [],
      // Imports are reviewed before anyone sees them — 081's rule, and the
      // reason a bulk insert is safe to run at all.
      status: 'pending',
    }),
  })
  await rest('library_item_links', {
    method: 'POST',
    body: JSON.stringify({ item_id: item.id, url, access: 'read', audience: 'instructors' }),
  })
  console.log(`inserted ${m.id} — ${m.title}`)
}
console.log(`\n${missing.length} inserted as pending. Review at /admin/library?status=pending&bucket=map`)
