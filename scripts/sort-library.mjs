// A full pass over the library. Dry by default; --apply writes.
//
// Snapshots every row it is about to touch to the scratchpad first, so the
// whole pass can be put back. There is no audit trail in this system by
// design, which makes the snapshot the only way back.
import { readFileSync, writeFileSync } from 'node:fs'

const u = process.env.NEXT_PUBLIC_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: k, Authorization: `Bearer ${k}` }
const APPLY = process.argv.includes('--apply')
const OUT = process.argv[process.argv.indexOf('--out') + 1] || '/tmp/sort'

const { classify, changesFor, NEEDS_SORTING } = await import('../.sorting.mjs')

const page = async (sel) => {
  let all = [], from = 0
  for (;;) {
    const r = await fetch(`${u}/rest/v1/${sel}`, { headers: { ...H, Range: `${from}-${from + 999}` } })
    const d = await r.json(); all = all.concat(d); if (d.length < 1000) break; from += 1000
  }
  return all
}

const items = await page('library_items?select=id,title,url,kind,bucket,admin_only,topics,status,source_topic&status=eq.published&order=id')

// Used: anything a course or a setup points at. Somebody found it where it is.
const used = new Set()
for (const t of ['course_template_items?select=item_id', 'course_items?select=library_item_id',
                 'course_resources?select=library_item_id', 'course_maps?select=library_item_id']) {
  for (const r of await page(t)) { const v = r.item_id ?? r.library_item_id; if (v) used.add(v) }
}

const confident = [], unsure = []
for (const i of items) {
  const v = classify({ ...i, used: used.has(i.id) })
  if (!v.confident) { unsure.push({ ...i, why: v.reason }); continue }
  const ch = changesFor(i, v)
  if (Object.keys(ch).length === 0) continue
  confident.push({ ...i, changes: ch, why: v.reason })
}

const tally = (rows, f) => rows.reduce((m, r) => { const key = f(r); m[key] = (m[key] || 0) + 1; return m }, {})
console.log(`published ${items.length} | used ${used.size}`)
console.log(`WOULD CHANGE ${confident.length}`)
console.log('  by reason:', JSON.stringify(tally(confident, (r) => r.why), null, 1))
console.log(`LEAVING ${unsure.length} for review`)
console.log('  by reason:', JSON.stringify(tally(unsure, (r) => r.why), null, 1))
console.log('\nsample of what moves:')
confident.slice(0, 12).forEach((r) => console.log(`  ${JSON.stringify(r.changes)}  ← ${r.title.slice(0, 44)} (${r.why})`))

// The plan, written out whether or not it is applied — so it can be read
// before it runs and diffed against after.
writeFileSync(`${OUT}-plan.json`, JSON.stringify({ confident, unsure }, null, 1))
console.log(`\nplan written to ${OUT}-plan.json`)

if (!APPLY) { console.log('DRY RUN — nothing written to the database. --apply to write.'); process.exit(0) }

writeFileSync(`${OUT}-before.json`, JSON.stringify(
  [...confident, ...unsure].map(({ id, title, kind, bucket, admin_only, topics }) =>
    ({ id, title, kind, bucket, admin_only, topics })), null, 1))

let wrote = 0
for (const r of confident) {
  const body = { ...r.changes, updated_at: new Date().toISOString() }
  if (body.admin_only) body.audience = 'internal'
  const res = await fetch(`${u}/rest/v1/library_items?id=eq.${r.id}`,
    { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) { console.error('FAILED', r.id, await res.text()); continue }
  wrote++
}

let tagged = 0
for (const r of unsure) {
  const topics = [...new Set([...(r.topics ?? []), NEEDS_SORTING])]
  if (topics.length === (r.topics ?? []).length) continue
  const res = await fetch(`${u}/rest/v1/library_items?id=eq.${r.id}`,
    { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ topics }) })
  if (res.ok) tagged++
}
console.log(`\nwrote ${wrote} changes, tagged ${tagged} for review. before-state: ${OUT}-before.json`)
