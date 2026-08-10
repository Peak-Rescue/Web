// Checks that the Classroom scopes are actually granted to the service
// account, then lists the classes each instructor can see.
//
// Scope problems surface at the token exchange, not the API call, and Google's
// error ("unauthorized_client") doesn't name the offending scope — so this
// tries each one separately and reports them one by one.
//
// Run with: node --env-file=.env.local scripts/classroom-check.mjs

import { createSign } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const SCOPES = {
  'courses.readonly': 'https://www.googleapis.com/auth/classroom.courses.readonly',
  'topics.readonly': 'https://www.googleapis.com/auth/classroom.topics.readonly',
  'courseworkmaterials.readonly': 'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  rosters: 'https://www.googleapis.com/auth/classroom.rosters',
}

const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

async function token(scope, subject) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email, scope, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600, sub: subject,
  })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  })
  if (!res.ok) throw new Error((await res.text()).slice(0, 300))
  return (await res.json()).access_token
}

async function main() {
  const probe = process.env.GCAL_INVITE_AS
  console.log(`service account: ${key.client_email}`)
  console.log(`client ID (paste this into the admin console): ${key.client_id}`)
  console.log(`probing as: ${probe}\n`)

  const missing = []
  for (const [label, scope] of Object.entries(SCOPES)) {
    try {
      await token(scope, probe)
      console.log(`  ok       ${label}`)
    } catch (e) {
      missing.push(label)
      console.log(`  MISSING  ${label} — ${e.message.replace(/\s+/g, ' ')}`)
    }
  }
  if (missing.length) {
    console.log('\nGrant the missing scopes to the client ID above in the Workspace admin console:')
    console.log('Security → Access and data control → API controls → Domain-wide delegation.')
  }
  // Only the course scope gates the listing below. Bailing on any missing
  // scope would hide a working read path behind an unrelated write scope.
  if (missing.includes('courses.readonly')) return

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: instructors } = await supabase.from('instructors').select('email').not('email', 'is', null)
  const staff = (instructors ?? []).map((i) => i.email).filter((e) => e.endsWith('@peak-rescue.com'))

  console.log(`\nlisting classes as ${staff.length} staff accounts…\n`)
  const seen = new Map()
  for (const who of staff) {
    let courses
    try {
      const t = await token(SCOPES['courses.readonly'], who)
      const res = await fetch(
        'https://classroom.googleapis.com/v1/courses?teacherId=me&courseStates=ACTIVE&pageSize=100',
        { headers: { Authorization: `Bearer ${t}` } }
      )
      if (!res.ok) { console.log(`  ${who}: ${res.status}`); continue }
      courses = (await res.json()).courses ?? []
    } catch (e) {
      console.log(`  ${who}: ${e.message.replace(/\s+/g, ' ').slice(0, 120)}`)
      continue
    }
    for (const c of courses) {
      if (!seen.has(c.id)) seen.set(c.id, { name: c.name, teachers: [] })
      seen.get(c.id).teachers.push(who)
    }
    console.log(`  ${who}: ${courses.length} class(es)`)
  }

  console.log(`\n${seen.size} distinct classes:`)
  for (const [id, c] of seen) console.log(`  ${id}  ${c.name}  (teachers: ${c.teachers.join(', ')})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
