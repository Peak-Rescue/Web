// A throwaway course, for looking at a flow end to end, and one command to undo
// it.
//
// There is one Supabase project, so there is no such thing as a course that is
// not a real row. What there is, is a row created without going near the actions
// that tell anybody about it: creating a course through the UI emails the admins
// and schedules a Google Calendar sync, and neither of those is undoable by
// deleting the row afterwards. So this inserts directly.
//
// Everything it makes hangs off the course by foreign key with `on delete
// cascade`, so --delete really is the whole undo: the crew rows, the interest
// invites and the course itself go together.
//
//   node scripts/test-course.mjs --create
//   node scripts/test-course.mjs --delete
//   node scripts/test-course.mjs            (say whether one exists)
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const BASE = process.env.PREVIEW_BASE ?? env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// The title is the safety mechanism. Anybody who stumbles on this course in the
// admin list should know inside one second what it is and that it can go, and
// --delete only ever touches courses that carry it.
const MARK = 'ZZ TEST — safe to delete'

// Far enough out that it cannot collide with anything real or appear in any
// "coming up" list somebody is actually reading.
const STARTS = '2027-12-06'
const ENDS = '2027-12-10'

const CREATE = process.argv.includes('--create')
const DELETE = process.argv.includes('--delete')

const { data: existing } = await db
  .from('course_instances')
  .select('id, ref_number, custom_title, starts_at')
  .eq('custom_title', MARK)

if (DELETE) {
  if (!existing?.length) {
    console.log('\n  Nothing to delete — no test course exists.\n')
    process.exit(0)
  }
  for (const c of existing) {
    // Cascades take the crew and the invites with it.
    const { error } = await db.from('course_instances').delete().eq('id', c.id)
    if (error) throw error
    console.log(`  Deleted PR-${String(c.ref_number).padStart(4, '0')} — ${c.custom_title}`)
  }
  console.log('\n  Gone, along with its crew rows and interest invites.\n')
  process.exit(0)
}

if (!CREATE) {
  console.log(
    existing?.length
      ? `\n  A test course exists: PR-${String(existing[0].ref_number).padStart(4, '0')} (${existing[0].starts_at}).` +
        '\n  node scripts/test-course.mjs --delete    to remove it\n'
      : '\n  No test course. node scripts/test-course.mjs --create\n'
  )
  process.exit(0)
}

if (existing?.length) {
  console.log(`\n  One already exists: PR-${String(existing[0].ref_number).padStart(4, '0')}. Delete it first.\n`)
  process.exit(1)
}

// ── The course ──────────────────────────────────────────────────────────────
// A crew plan with all three seats, because a shadow seat is the one thing no
// real course currently has — so it is the one thing the page has never been
// looked at with. instructor_slots is the sum, written here the same way the
// app writes it.
const plan = { lead_slots: 1, assist_slots: 2, shadow_slots: 1 }
const { data: course, error } = await db
  .from('course_instances')
  .insert({
    course_type: 'maritime-mobility',
    custom_title: MARK,
    client_name: 'Test Client',
    status: 'tentative',
    location: 'Nowhere',
    region: 'US-WY',
    starts_at: STARTS,
    ends_at: ENDS,
    max_students: 8,
    ...plan,
    instructor_slots: plan.lead_slots + plan.assist_slots + plan.shadow_slots,
  })
  .select('id, ref_number')
  .single()
if (error) throw error

const ref = `PR-${String(course.ref_number).padStart(4, '0')}`
console.log(`\n  Created ${ref} — ${MARK}`)
console.log(`  ${STARTS} – ${ENDS} · tentative · crew plan 1 lead · 2 assist · 1 shadow`)

// ── Two invites: somebody who can lead this, and somebody who cannot ────────
// The whole point of the page is that those two people see different things on
// the same course, so a preview with only one of them proves nothing.
const { data: roster } = await db
  .from('instructors')
  .select('id, name, instructor_capabilities(category, role)')
  .eq('active', true)
  .order('name')

const caps = await import('../lib/capabilities.ts')
const categories = caps.courseCapabilityCategories('maritime-mobility', null)
const leads = (roster ?? []).filter((i) =>
  (i.instructor_capabilities ?? []).some((c) => categories.includes(c.category) && c.role === 'lead')
)
const others = (roster ?? []).filter((i) => !leads.includes(i))

const pick = [leads[0], others[0]].filter(Boolean)
if (pick.length < 2) {
  console.log('\n  ⚠ Could not find both a lead-signed and a non-lead instructor for this')
  console.log('    discipline, so the two cases cannot be compared on this course.')
}

console.log('\n  Links — nothing was emailed:\n')
for (const person of pick) {
  const { data: invite, error: e } = await db
    .from('course_interest_invites')
    .insert({ instance_id: course.id, instructor_id: person.id })
    .select('token')
    .single()
  if (e) throw e
  const isLead = leads.includes(person)
  console.log(`    ${person.name} (${isLead ? 'lead-signed' : 'no lead sign-off'})`)
  console.log(`    ${BASE}/staffing/${invite.token}\n`)
}

if (BASE.includes('localhost')) {
  const up = await fetch(BASE, { method: 'HEAD' }).then(() => true).catch(() => false)
  if (!up) console.log(`  ⚠ Nothing is listening on ${BASE} — run "npm run dev" first.\n`)
}

console.log(`  The course itself: ${BASE}/admin/courses/${course.id}`)
console.log(`  Undo everything:   node scripts/test-course.mjs --delete\n`)
