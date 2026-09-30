// Find and remove Google Calendar events left behind by deleted DEMO courses.
//
// A course deleted through the app removes its calendar event first
// (deleteInstance → removeCourseEvent). A course deleted straight out of the
// database does not, because nothing in Postgres knows Google exists — so every
// rebuild of the demo course that had ever been synced left its event behind,
// and the next rebuild made another one. That is the duplication.
//
//   node scripts/gcal-demo-cleanup.mjs           list what is orphaned
//   node scripts/gcal-demo-cleanup.mjs --delete  remove it
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import crypto from 'node:crypto'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// The same JWT dance lib/google-calendar does, inlined because that module is
// written for the app's import aliases and this is a one-off broom.
const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/^['"]|['"]$/g, ''))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const claim = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/calendar',
  aud: 'https://oauth2.googleapis.com/token',
  exp: now + 3600,
  iat: now,
  ...(key.subject ? { sub: key.subject } : {}),
})
const sig = crypto.createSign('RSA-SHA256').update(claim).sign(key.private_key.replace(/\\n/g, '\n'), 'base64url')
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${claim}.${sig}`,
  }),
})
const { access_token, error_description } = await tokenRes.json()
if (!access_token) throw new Error(`Google auth failed: ${error_description ?? tokenRes.status}`)

const CAL = process.env.DEMO_CALENDAR
  ?? 'c_70d167053e9de06ef091d98214caf85d4246c5de1bf106545df4e9d4e102210d@group.calendar.google.com'
const api = (path, init) =>
  fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

// Every event id the database still claims, so a live course's event is never
// mistaken for litter.
const { data: live } = await db
  .from('course_instances')
  .select('ref_number, custom_title, gcal_event_id')
  .not('gcal_event_id', 'is', null)
const claimed = new Map((live ?? []).map((c) => [c.gcal_event_id, c]))

const res = await api(`/calendars/${encodeURIComponent(CAL)}/events?maxResults=2500&singleEvents=false`)
if (!res.ok) throw new Error(`Listing failed: ${res.status} ${await res.text()}`)
const { items = [] } = await res.json()

const demo = items.filter((e) => /demo/i.test(e.summary ?? '') && e.status !== 'cancelled')
const orphans = demo.filter((e) => !claimed.has(e.id))

console.log(`\n  ${items.length} events on that calendar, ${demo.length} mentioning DEMO\n`)
for (const e of demo) {
  const owner = claimed.get(e.id)
  console.log(
    `  ${owner ? 'KEEP   ' : 'ORPHAN '} ${(e.start?.date ?? e.start?.dateTime ?? '').slice(0, 10)}  ${e.summary}` +
    (owner ? `  (PR-${String(owner.ref_number).padStart(4, '0')})` : '')
  )
}

if (!process.argv.includes('--delete')) {
  console.log(`\n  ${orphans.length} orphaned. Re-run with --delete to remove them.\n`)
  process.exit(0)
}

for (const e of orphans) {
  const r = await api(`/calendars/${encodeURIComponent(CAL)}/events/${e.id}`, { method: 'DELETE' })
  console.log(`  ${r.ok || r.status === 410 ? 'deleted' : 'FAILED ' + r.status}  ${e.summary}`)
}
console.log()
