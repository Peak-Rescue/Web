// See the staffing-interest page exactly as one instructor would see it —
// without sending anybody anything.
//
// The page's content is not a property of the course. It is decided per
// instructor, at the moment they open the link: which seats the crew plan has,
// which of them are still open right now, and which of those this person is
// signed off to take. So "what will staff see" has no single answer, and the
// only honest way to check it is to look as a particular person.
//
// Sending the real invite would work and would also email them. This mints the
// invite row directly and prints the link, so nothing leaves the building. The
// row is the same row the real send would make, so the page runs its real code
// path — and `sent_at` is left null, because nothing was sent and the staffing
// panel should not claim otherwise.
//
//   node scripts/staffing-preview.mjs PR-0042
//   node scripts/staffing-preview.mjs PR-0042 "Toph"
//   node scripts/staffing-preview.mjs PR-0042 "Toph" --mint
//   node scripts/staffing-preview.mjs PR-0042 "Toph" --unmint    (clean up)
//
// With no instructor it lists who could be asked and what each of them would be
// offered, so you can pick the case you actually want to see. --mint is what
// creates the invite and prints the URL; without it this only reports.
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

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const MINT = process.argv.includes('--mint')
const UNMINT = process.argv.includes('--unmint')
const [courseArg, whoArg] = args

if (!courseArg) {
  console.error('Usage: node scripts/staffing-preview.mjs <PR-0042|uuid> [instructor name] [--mint]')
  process.exit(1)
}

// ── The course ──────────────────────────────────────────────────────────────
const ref = /^PR-?(\d+)$/i.exec(courseArg)
let q = db
  .from('course_instances')
  .select('id, ref_number, course_type, custom_title, custom_categories, client_name, status, starts_at, ends_at, lead_slots, assist_slots, shadow_slots, instructor_slots')
q = ref ? q.eq('ref_number', Number(ref[1])) : q.eq('id', courseArg)
const { data: course, error: courseErr } = await q.maybeSingle()
if (courseErr) throw courseErr
if (!course) {
  console.error(`No course matching ${courseArg}`)
  process.exit(1)
}

const label = `PR-${String(course.ref_number).padStart(4, '0')} · ${course.custom_title ?? course.course_type}${course.client_name ? ` · ${course.client_name}` : ''}`

// ── The plan, and who is already on it ──────────────────────────────────────
const ROLES = ['lead', 'assist', 'shadow']
const plan = { lead: course.lead_slots, assist: course.assist_slots, shadow: course.shadow_slots }
const planned = ROLES.some((r) => plan[r] !== null)

const { data: crew } = await db
  .from('instance_instructors')
  .select('instructor_id, role, in_charge, instructors(name)')
  .eq('instance_id', course.id)

const filled = (role) => (crew ?? []).filter((c) => (c.role ?? 'assist') === role).length
const open = (role) => Math.max((plan[role] ?? 0) - filled(role), 0)

console.log(`\n${label}`)
console.log(`  ${course.status} · ${course.starts_at ?? 'no dates'}${course.ends_at && course.ends_at !== course.starts_at ? ` – ${course.ends_at}` : ''}`)

if (!planned) {
  console.log(`\n  ⚠ No crew plan on this course — lead/assist/shadow are all unset.`)
  console.log(`    The page will show no seats at all, which is the honest answer but`)
  console.log(`    probably not what you want to look at. Set the crew plan on the`)
  console.log(`    course details first.`)
} else {
  console.log('\n  Crew plan')
  for (const r of ROLES) {
    if ((plan[r] ?? 0) === 0) continue
    console.log(`    ${r.padEnd(7)} ${plan[r]} planned · ${filled(r)} filled · ${open(r)} open`)
  }
}
if ((crew ?? []).length > 0) {
  console.log('\n  On it now')
  for (const c of crew) {
    console.log(`    ${(c.instructors?.name ?? c.instructor_id).padEnd(22)} ${c.role ?? 'assist'}${c.in_charge ? ' · primary' : ''}`)
  }
}

// ── What a given person would be offered ────────────────────────────────────
// The course's disciplines, so a lead sign-off in the right one is what counts.
// Mirrors lib/capabilities.courseCapabilityCategories; read from the app rather
// than restated, because a second copy of that map is a second thing to be
// wrong. Loaded lazily so this script still runs if the import path moves.
let categories = []
try {
  const caps = await import('../lib/capabilities.ts')
  categories = caps.courseCapabilityCategories(course.course_type, course.custom_categories)
} catch {
  console.log('\n  (could not load the discipline map — lead qualification not checked)')
}

const { data: roster } = await db
  .from('instructors')
  .select('id, name, email, active, instructor_capabilities(category, role)')
  .eq('active', true)
  .order('name')

const staffed = new Set((crew ?? []).map((c) => c.instructor_id))
const leadQualified = (i) =>
  (i.instructor_capabilities ?? []).some((c) => categories.includes(c.category) && c.role === 'lead')

// The rule the page itself uses: their own ceiling, not the course's. A lead can
// take an assist or shadow seat; an assist cannot cover a lead seat.
const offeredTo = (i) =>
  (leadQualified(i) ? ROLES : ROLES.filter((r) => r !== 'lead')).find((r) => open(r) > 0) ?? null

const candidates = (roster ?? []).filter((i) => !staffed.has(i.id))

if (!whoArg) {
  console.log('\n  Who could be asked, and what the page would offer them')
  for (const i of candidates) {
    const seat = offeredTo(i)
    const why = seat === null
      ? leadQualified(i) ? 'nothing open' : 'nothing open they can take'
      : seat
    console.log(`    ${i.name.padEnd(22)} ${leadQualified(i) ? 'lead-signed' : 'not lead   '}  →  ${why}`)
  }
  console.log('\n  Pass a name to preview as one of them, and --mint to get the link.')
  if (planned && open('lead') === 0) {
    console.log('  Note: the lead seat is filled, so nobody here is being capped —')
    console.log('  to see the "the lead seat needs a lead sign-off" line, use a course')
    console.log('  whose lead seat is still open.')
  }
  process.exit(0)
}

const needle = whoArg.toLowerCase()
const matches = candidates.filter((i) => i.name.toLowerCase().includes(needle) || (i.email ?? '').toLowerCase().includes(needle))
if (matches.length !== 1) {
  console.error(`\n  ${matches.length === 0 ? 'Nobody unstaffed matches' : 'More than one matches'} "${whoArg}".`)
  if (matches.length > 1) for (const m of matches) console.error(`    ${m.name}`)
  process.exit(1)
}
const person = matches[0]
const seat = offeredTo(person)

console.log(`\n  As ${person.name}`)
console.log(`    lead sign-off in this discipline: ${leadQualified(person) ? 'yes' : 'no'}`)
console.log(`    the page will offer: ${seat ?? 'nothing — no seat they can take is open'}`)
if (seat && seat !== 'lead' && open('lead') > 0) {
  console.log(`    and will say why the open lead seat is not theirs`)
}

if (UNMINT) {
  const { error } = await db
    .from('course_interest_invites')
    .delete()
    .eq('instance_id', course.id)
    .eq('instructor_id', person.id)
  if (error) throw error
  console.log(`\n  Invite for ${person.name} on ${label} deleted.\n`)
  process.exit(0)
}

if (!MINT) {
  console.log('\n  Add --mint to create the invite and print the link. Nothing is emailed either way.')
  process.exit(0)
}

// ── The invite, with nothing sent ───────────────────────────────────────────
const { data: invite, error: inviteErr } = await db
  .from('course_interest_invites')
  .upsert(
    { instance_id: course.id, instructor_id: person.id },
    { onConflict: 'instance_id,instructor_id', ignoreDuplicates: false }
  )
  .select('token, sent_at, interested')
  .single()
if (inviteErr) throw inviteErr

console.log(`\n  ${BASE}/staffing/${invite.token}`)
console.log(`\n  Nothing was emailed. sent_at is ${invite.sent_at ?? 'null — the staffing panel will show this as not yet sent'}.`)
if (invite.interested !== null) {
  console.log(`  Heads up: this invite already carries an answer (${invite.interested ? 'interested' : "can't make it"}),`)
  console.log(`  so the page opens on that rather than on the question.`)
}
console.log(`  This is a real row in whatever database .env.local points at. Remove it`)
console.log(`  when you are done — the trash icon beside them in the staffing panel, or:`)
console.log(`    node scripts/staffing-preview.mjs ${courseArg} "${whoArg}" --unmint\n`)
