// Why a calendar move can fail. The portal moves a course event between the
// three course calendars when its status or designation changes
// (lib/google-calendar.ts). A move needs writer access on BOTH the source and
// the destination — if it's missing, the fallback is delete + recreate, which
// mints a new event ID and kills every invite link already emailed.
//
// This reports the access level the portal actually has on each calendar.
// Read-only: it creates nothing.
//
// Run with: node --env-file=.env.local scripts/gcal-move-check.mjs

import { createSign } from 'crypto'

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const API = 'https://www.googleapis.com/calendar/v3'
const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

async function token(subject) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600, ...(subject ? { sub: subject } : {}),
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
  if (!res.ok) throw new Error((await res.text()).replace(/\s+/g, ' ').slice(0, 300))
  return (await res.json()).access_token
}

const CALENDARS = {
  military: process.env.GCAL_MILITARY_CALENDAR_ID,
  civilian: process.env.GCAL_CIVILIAN_CALENDAR_ID,
  prospective: process.env.GCAL_PROSPECTIVE_CALENDAR_ID,
  general: process.env.GCAL_GENERAL_CALENDAR_ID,
}

async function main() {
  const sub = process.env.GCAL_INVITE_AS || null
  console.log(`service account: ${key.client_email}`)
  console.log(`acting as: ${sub ?? '(service identity — no impersonation)'}\n`)

  let t
  try {
    t = await token(sub)
  } catch (e) {
    console.log(`impersonation FAILED — ${e.message}`)
    console.log('The portal would fall back to the service identity and write events without attendees.')
    return
  }

  const get = (path) => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } })

  for (const [label, id] of Object.entries(CALENDARS)) {
    if (!id) { console.log(`  ${label.padEnd(12)} not configured`); continue }
    const res = await get(`/users/me/calendarList/${encodeURIComponent(id)}`)
    if (!res.ok) {
      // Not in the acting user's calendar list — try reading it directly, which
      // still works when it's shared but not subscribed.
      const direct = await get(`/calendars/${encodeURIComponent(id)}`)
      console.log(`  ${label.padEnd(12)} ${direct.ok ? 'readable, but NOT in the calendar list (access level unknown)' : `NO ACCESS (${res.status})`}`)
      continue
    }
    const { accessRole } = await res.json()
    const ok = accessRole === 'owner' || accessRole === 'writer'
    console.log(`  ${label.padEnd(12)} ${accessRole}${ok ? '' : '   ← moves in/out of this calendar will FAIL'}`)
  }

  console.log('\nA move needs owner/writer on both calendars. Anything less and the')
  console.log('portal deletes and recreates the event, invalidating invite links.')
}

main()
