// Two demo screens: accepting a course, and filing an expense report.
//
// This started out building the whole instructor experience, which was the wrong
// shape. Everything course-shaped — prep, schedule, updates, gear, photos, the
// student view — demos better on a *real* course from an admin session with the
// view-as chip set to instructor: the chip removes pricing outright rather than
// dimming it, so nothing personal is on screen, and the content is real instead
// of copied.
//
// What the chip cannot show is anything belonging to a person rather than a
// course. A staffing invite is one instructor's token; an expense report is
// somebody's money. Those two are what is left here.
//
// One course, and a demo instructor who both holds an invite to it and is crewed
// on it: the invite so the acceptance page has something to accept, the crew row
// so the expense report has a course to file against.
//
// Written directly rather than through the actions, so nothing is emailed and no
// calendar event is made.
//
//   node scripts/demo-day.mjs --create
//   node scripts/demo-day.mjs            (links again, without rebuilding)
//   node scripts/demo-day.mjs --delete
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

// The marker every demo row carries, and the only thing --delete will touch.
const MARK = 'DEMO'
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo.instructor@peak-rescue.com'

const CREATE = process.argv.includes('--create')
const DELETE = process.argv.includes('--delete')

// Fixed rather than relative to "now", so a rerun tomorrow gives the same week.
// Monday to Friday on purpose: that plus a travel day each end sits inside one
// Sunday-to-Saturday week, which is what makes the overtime line appear. A
// Thursday start splits the hours either side of a Saturday and the page
// correctly says no premium applies — true, and the least useful true thing to
// put in front of a room.
const STARTS = '2026-10-26'
const ENDS = '2026-10-30'

const { data: found } = await db
  .from('course_instances')
  .select('id, ref_number')
  .like('custom_title', `${MARK} —%`)
const { data: foundPerson } = await db
  .from('instructors')
  .select('id, name, profile_id')
  .ilike('email', DEMO_EMAIL)
  .maybeSingle()

let course = found?.[0] ?? null
let person = foundPerson ?? null

// ── Teardown ────────────────────────────────────────────────────────────────
// --create runs this first. A build that died halfway leaves rows behind, and a
// rerun that skips what already exists is how you get on stage with half a demo.
if (DELETE || (CREATE && (course || person))) {
  for (const c of found ?? []) {
    await db.from('course_instances').delete().eq('id', c.id)
    console.log(`  deleted PR-${String(c.ref_number).padStart(4, '0')}`)
  }
  if (person) {
    // Reports belong to the person, not the course, so nothing cascades them.
    const { data: reports } = await db
      .from('expense_reports')
      .select('id')
      .eq('profile_id', person.profile_id)
    for (const r of reports ?? []) await db.from('expense_reports').delete().eq('id', r.id)
    await db.from('instructors').delete().eq('id', person.id)
    if (person.profile_id) {
      await db.from('profiles').delete().eq('id', person.profile_id)
      await db.auth.admin.deleteUser(person.profile_id).catch(() => {})
    }
    console.log(`  deleted the demo instructor and ${(reports ?? []).length} expense report(s)`)
  }
  if (DELETE) {
    console.log('\n  Clean.\n')
    process.exit(0)
  }
  console.log('  (cleared what was there — rebuilding)')
  course = null
  person = null
}

// ── Build ───────────────────────────────────────────────────────────────────
if (CREATE) {
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
  })
  if (authErr && !/already/i.test(authErr.message)) throw authErr
  let uid = created?.user?.id
  if (!uid) {
    const { data: list } = await db.auth.admin.listUsers({ perPage: 200 })
    uid = list.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL)?.id
  }

  // The promotion goes after the auth user, and it has to: creating the user
  // fires a trigger that writes the profiles row with the default role, so an
  // earlier upsert setting 'instructor' is silently overwritten. profiles.role is
  // the only thing gating the portal — get it wrong and the demo signs in fine
  // and is then bounced off the expenses page.
  const { error: roleErr } = await db
    .from('profiles')
    .update({ role: 'instructor', first_name: 'Demo', last_name: 'Instructor', email: DEMO_EMAIL })
    .eq('id', uid)
  if (roleErr) throw roleErr

  const { data: ins, error: insErr } = await db
    .from('instructors')
    .insert({
      name: 'Demo Instructor',
      slug: 'demo-instructor',
      instructor_role: 'lead',
      title: 'Rescue Instructor',
      email: DEMO_EMAIL,
      profile_id: uid,
      active: true,
      show_on_team_page: false,
      paid_for_days: true,
    })
    .select('id, name, profile_id')
    .single()
  if (insErr) throw insErr
  person = ins

  const { data: primary } = await db
    .from('instructors')
    .select('id')
    .ilike('name', 'Nadav%')
    .maybeSingle()

  const { data: c, error: cErr } = await db
    .from('course_instances')
    .insert({
      course_type: 'canyoneering',
      custom_title: `${MARK} — do not use`,
      client_name: 'Demo Client',
      status: 'confirmed',
      location: 'Ouray, Colorado',
      region: 'US-CO',
      starts_at: STARTS,
      ends_at: ENDS,
      max_students: 8,
      // All three seats, so the acceptance page shows all three wages. No real
      // course carries a shadow seat yet, so this is the only place that row has
      // ever been seen.
      lead_slots: 1,
      assist_slots: 2,
      shadow_slots: 1,
      instructor_slots: 4,
      meeting_point: 'Ouray Hot Springs parking lot, north end',
      meeting_time: '07:30',
    })
    .select('id, ref_number')
    .single()
  if (cErr) throw cErr
  course = c

  // in_charge is spelled out on both rows rather than left to the column
  // default: PostgREST unifies the columns across a batch insert, so a row that
  // merely omits the key is sent an explicit null, which a not-null column
  // rejects — and it rejects the whole batch.
  const { error: crewErr } = await db.from('instance_instructors').insert([
    ...(primary ? [{ instance_id: c.id, instructor_id: primary.id, role: 'lead', in_charge: true }] : []),
    { instance_id: c.id, instructor_id: person.id, role: 'assist', in_charge: false },
  ])
  if (crewErr) throw crewErr

  const { error: invErr } = await db
    .from('course_interest_invites')
    .insert({ instance_id: c.id, instructor_id: person.id })
  if (invErr) throw invErr

  // Tasks, with two of them theirs.
  //
  // The section hides itself entirely when a course has no tasks and you are not
  // the one who can add them — so an empty demo course shows an instructor no
  // Tasks section at all, which reads as "instructors don't get tasks" rather
  // than "this course has none".
  //
  // Not primary on purpose, because that is the ordinary case: an assist can
  // tick off and annotate the tasks assigned to *them*, and cannot add, assign
  // or delete. Seeding one unassigned task shows the difference in the same list.
  const { error: taskErr } = await db.from('course_tasks').insert([
    { instance_id: c.id, title: 'Pick up the rental van', status: 'open', assigned_to: person.profile_id, sort_order: 0 },
    { instance_id: c.id, title: 'Check litter and hardware', status: 'open', assigned_to: person.profile_id, sort_order: 1 },
    { instance_id: c.id, title: 'Confirm canyon permits', status: 'done', completed_at: new Date('2026-09-20T00:00:00Z').toISOString(), sort_order: 2 },
    { instance_id: c.id, title: 'Print student packets', status: 'open', sort_order: 3 },
  ])
  if (taskErr) throw taskErr

  const { data: report, error: rErr } = await db
    .from('expense_reports')
    .insert({
      profile_id: person.profile_id,
      reason: `${MARK} — Ouray canyon rescue`,
      status: 'draft',
      default_instance_id: c.id,
    })
    .select('id')
    .single()
  if (rErr) throw rErr

  // Mid-flight, which is the state an instructor actually opens one in. A mileage
  // line included because it is the one that does its own arithmetic.
  const { error: itemErr } = await db.from('expense_items').insert([
    { report_id: report.id, start_date: '2026-10-25', category: 'lodging', paid_by: 'personal', description: 'Motel, 2 nights', amount: 218.4, instance_id: c.id, sort_order: 0 },
    { report_id: report.id, start_date: '2026-10-27', category: 'per_diem', paid_by: 'personal', description: 'Crew dinner, 4 people', amount: 96.15, instance_id: c.id, sort_order: 1 },
    { report_id: report.id, start_date: '2026-10-25', end_date: '2026-10-31', category: 'personal_auto', paid_by: 'personal', description: 'Casper to Ouray and back', miles: 612, amount: 410.04, instance_id: c.id, sort_order: 2 },
  ])
  if (itemErr) throw itemErr

  console.log(`  built PR-${String(c.ref_number).padStart(4, '0')}, the demo instructor, an invite, 4 tasks, and a 3-line draft report`)
}

if (!course || !person) {
  console.log('\n  Nothing built. node scripts/demo-day.mjs --create\n')
  process.exit(0)
}

// ── The links ───────────────────────────────────────────────────────────────
// Sign-in is built against our own /auth/callback rather than Supabase's
// action_link. That is what this app does: the email templates point here with
// the token hash, deliberately, because some corporate networks block
// *.supabase.co in the browser. Handing out the action_link sends you through a
// host the app stopped using, and you land on the login page.
const { data: link, error: linkErr } = await db.auth.admin.generateLink({
  type: 'magiclink',
  email: DEMO_EMAIL,
})
if (linkErr) throw linkErr

const { data: invite } = await db
  .from('course_interest_invites')
  .select('token')
  .eq('instance_id', course.id)
  .eq('instructor_id', person.id)
  .maybeSingle()

console.log(`
  ─── Run of show ────────────────────────────────────────────────────────────

  1 · Accepting a course. No login — open it cold, in a private window. This is
      what lands in an instructor's inbox.

      ${BASE}/staffing/${invite?.token ?? '(none)'}

      Three roles, what each pays, the hours, and tick-boxes for which ones they
      would take. Untick one and the point makes itself: they say what they will
      accept, we do not tell them what they are.

  ── Everything below needs the demo login. Open this next, same window: ──────

      ${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=email&next=%2Finstructor

      That IS the sign-in — one click, no email, no password. It lands on the
      instructor's own page. The two links below only work afterwards; on their
      own they bounce you to the login screen.

  2 · Their tasks, on the course page.

      ${BASE}/portal/${course.id}

      Two of the four tasks are theirs: they can tick those off and add notes.
      No Add button and no sign of anybody else's work — assigning is the
      primary's, and unassigned tasks are invisible to everyone.

  3 · Their expense report.

      ${BASE}/instructor/expenses

      A draft with three lines in it: lodging, per diem, and a 612-mile drive
      that works out its own amount.

  Everything else — prep, schedule, updates, gear, photos, the student view —
  from your own admin window on a real course with the view-as chip. The chip
  takes pricing away rather than dimming it.

  ─── Afterwards ─────────────────────────────────────────────────────────────

    node scripts/demo-day.mjs --delete

  The sign-in token is single-use and expires. Rerun without --delete for a
  fresh one — do that right before you present.
`)
