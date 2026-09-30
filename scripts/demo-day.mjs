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
// An address with a real mailbox behind it, for two reasons.
//
// The sign-in link below is a magic link: single-use, and it expires. That is
// what a magic link is, and the login page offers no password to fall back on —
// so without a reachable address, a dead link means finding a terminal. With
// one, /login works the ordinary way and the code arrives in an inbox.
//
// And assigning a task emails the assignee. Pointed at an address that does not
// exist, every rehearsal is a bounce against our sending domain's reputation.
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'nadav+demo@peak-rescue.com'

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
  .select('id, ref_number, gcal_event_id')
  .like('custom_title', `${MARK} —%`)
const DEMO_SLUG = 'demo-instructor'

const { data: foundPerson } = await db
  .from('instructors')
  .select('id, name, profile_id')
  .eq('slug', DEMO_SLUG)
  .maybeSingle()

let course = found?.[0] ?? null
let person = foundPerson ?? null

// --create used to tear down first, so that a build which died halfway could not
// leave a half-built demo behind. That was the wrong trade: it also meant a
// rerun silently destroyed a demo course somebody had been editing, taking the
// date they had just changed with it — and leaving the Google Calendar event
// behind, because a raw row delete knows nothing about Google. The next edit
// then made a second event.
//
// So it refuses instead. Deleting is a thing you ask for.
if (CREATE && (course || person)) {
  console.log(`
  A demo already exists${course ? ` (PR-${String(course.ref_number).padStart(4, '0')})` : ''}.

  Rebuilding would throw away any changes made to it — dates, answers, tasks —
  and leave its Google Calendar event orphaned. If that is what you want:

    node scripts/demo-day.mjs --delete && node scripts/demo-day.mjs --create

  For links to what is already there, run this with no arguments.
`)
  process.exit(1)
}

// ── Teardown ────────────────────────────────────────────────────────────────
if (DELETE) {
  const gcalLeft = (found ?? []).filter((c) => c.gcal_event_id)
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
  // The calendar event does not live in Postgres, so deleting the row cannot
  // take it with it. deleteInstance calls removeCourseEvent before it deletes;
  // this cannot, so it says what is left rather than leaving it to be found in
  // the team's calendar next week.
  if (gcalLeft.length > 0) {
    console.log(`
  ${gcalLeft.length} Google Calendar event(s) may be left behind — a row delete
  cannot remove them. Sweep with:

    node scripts/gcal-demo-cleanup.mjs --delete
`)
  }
  console.log('  Clean.\n')
  process.exit(0)
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
      slug: DEMO_SLUG,
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

  // A primary, and deliberately nobody else.
  //
  // The demo instructor is *not* crewed here, because being crewed is what the
  // demo is about arriving at. The staff home lists a live interest invite only
  // for a course you are not already on (app/admin/page.tsx) — staffing somebody
  // is the answer to the question, so the question stops being asked — so a
  // demo instructor who starts on the crew never sees the invite in their portal
  // and the whole first half has to happen in an email instead.
  //
  // They do not need the crew row for anything else: the expense editor offers
  // every live course, not only yours.
  const { error: crewErr } = await db.from('instance_instructors').insert(
    primary ? [{ instance_id: c.id, instructor_id: primary.id, role: 'lead', in_charge: true }] : []
  )
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

// Re-minted if it has gone. The invite is the one thing here that somebody can
// delete from the staffing panel without meaning to end the demo, and a run of
// show whose first link is "/staffing/" with nothing after it is a bad thing to
// discover in front of a room.
let { data: invite } = await db
  .from('course_interest_invites')
  .select('token')
  .eq('instance_id', course.id)
  .eq('instructor_id', person.id)
  .maybeSingle()

if (!invite) {
  const { data: remade, error: remakeErr } = await db
    .from('course_interest_invites')
    .insert({ instance_id: course.id, instructor_id: person.id })
    .select('token')
    .single()
  if (remakeErr) throw remakeErr
  invite = remade
  console.log('  (the invite had gone — minted a new one)')
}

// One link: signs in as the demo instructor *and* lands on the interest page.
//
// The interest page itself needs no login — that is the point of it, an emailed
// token opening cold on a phone. But a demo that starts there and then wants to
// walk into the portal needs the session anyway, and asking somebody to click a
// sign-in link first and the interest link second is two chances to click them
// in the wrong order. So the callback carries the interest page as its
// destination and the demo begins in one click.
//
// Signed in, the interest page grows a "← Portal" link to the staff home, which
// is where their courses are. That is the whole onward path: everything else in
// the demo is a click from there.
const start = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=email&next=${encodeURIComponent(`/staffing/${invite?.token ?? ''}`)}`

console.log(`
  ─── Start here ─────────────────────────────────────────────────────────────

  A private window, this link, and everything else is navigation.

    ${start}

  It signs you in as Demo Instructor and opens the course interest page — the
  thing that lands in an instructor's inbox. Three roles, what each pays, the
  hours, and tick-boxes for which they would take.

  ─── Or start one step earlier, from your own admin window ──────────────────

  Send Demo Instructor a staffing-interest invite from the course's staffing
  panel. The mail lands in your own inbox — the account is ${DEMO_EMAIL} — and
  the same ask appears on their portal home, because they are not on this crew
  yet. That is the more honest opening: the room sees where the link comes from.

  ─── Then, without leaving the private window ───────────────────────────────

  1 · Accept it. Untick a role first: they say what they will take, we do not
      tell them what they are.

  2 · In your admin window, staff them. Their answer is sitting in the staffing
      panel, and the roles they declined are struck through.

  3 · Back in the private window: "← Portal" → the course is theirs now. Two
      tasks are already assigned to them; assign "Print student packets" as well
      and reload to watch it land. They can tick tasks off and add notes, but
      there is no Add button — assigning belongs to the primary.

  4 · Then /instructor/expenses for the draft report: lodging, per diem, and a
      612-mile drive that works out its own amount.

  The course, if you want it directly:
    ${BASE}/portal/${course.id}

  ─── Notes ──────────────────────────────────────────────────────────────────

  Nothing refreshes on its own — reload after assigning.

  Assigning emails the assignee, and that address is yours — so the mail lands
  in your inbox instead of bouncing, and you can show it arriving.

  The link above is a magic link: single-use, and it expires. The session does
  not — sign in once, leave the window open, and you are set for the talk.

  If it does die you do not need this script. Go to ${BASE}/login, enter
  ${DEMO_EMAIL}, and the code comes to your own inbox.

  For a fresh link anyway:

    PREVIEW_BASE=${BASE} node scripts/demo-day.mjs

  Afterwards:

    node scripts/demo-day.mjs --delete
`)
