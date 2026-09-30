// Everything an instructor sees, on a demo account, with one command to undo it.
//
// Built for presenting to the instructor pool. Three things make a live demo go
// wrong, and this exists to handle all three.
//
// 1. Signing in as a real instructor shows the room that person's pay. The hours
//    page, the expense reports and the crew row all carry money, and it is
//    somebody's. So the demo is its own account with its own money.
// 2. Empty screens demo badly. An instructor looking at "Nobody staffed yet" and
//    "No schedule" learns nothing about the thing you are selling them. So the
//    courses come stocked, and the curriculum is copied from a real course
//    rather than invented.
// 3. Half of what an instructor does is about a course that has not happened and
//    half is about one that has. One course cannot show both, so there are two:
//    one next month to get ready for, one last week to close out.
//
// Everything is written directly rather than through the actions, so nothing is
// emailed, no calendar event is made, and nobody outside the room hears about it.
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
const CURRICULUM_FROM = 13 // PR-0013 — the most fully built real course we have

const CREATE = process.argv.includes('--create')
let wiped = false
const DELETE = process.argv.includes('--delete')

const day = (offset) => {
  const d = new Date('2026-09-29T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

// ── Find what already exists ────────────────────────────────────────────────
const { data: courses } = await db
  .from('course_instances')
  .select('id, ref_number, custom_title, starts_at')
  .like('custom_title', `${MARK} —%`)
  .order('starts_at')

const { data: person } = await db
  .from('instructors')
  .select('id, name, profile_id, schedule_token')
  .ilike('email', DEMO_EMAIL)
  .maybeSingle()

// ── Teardown ────────────────────────────────────────────────────────────────
// --create runs this first: a build that died halfway leaves rows behind, and a
// rerun that skips what already exists is how you get on stage with a course
// that has no gear list. Rebuilding is cheap; finding out live is not.
if (DELETE || (CREATE && ((courses ?? []).length > 0 || person))) {
  for (const c of courses ?? []) {
    await db.from('course_instances').delete().eq('id', c.id)
    console.log(`  deleted PR-${String(c.ref_number).padStart(4, '0')} — ${c.custom_title}`)
  }
  if (person) {
    // Reports are the instructor's, not the course's, so nothing cascades them.
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
  wiped = true
}

// ── Build ───────────────────────────────────────────────────────────────────
// Everything read above the teardown is a pointer to a row that no longer
// exists, so a wipe forgets all of it rather than finding out through a foreign
// key three inserts later.
let demo = wiped ? null : person
let upcoming = wiped ? null : (courses ?? []).find((c) => c.custom_title.includes('next month'))
let finished = wiped ? null : (courses ?? []).find((c) => c.custom_title.includes('last week'))

if (CREATE) {
  if (!demo) {
    // A real auth user, so the sign-in link below is a real sign-in and the demo
    // exercises the same path the pool will.
    const { data: created, error: authErr } = await db.auth.admin.createUser({
      email: DEMO_EMAIL,
      email_confirm: true,
      user_metadata: { first_name: 'Demo', last_name: 'Instructor' },
    })
    if (authErr && !/already/i.test(authErr.message)) throw authErr
    let uid = created?.user?.id
    if (!uid) {
      const { data: list } = await db.auth.admin.listUsers({ perPage: 200 })
      uid = list.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL)?.id
    }
    await db.from('profiles').upsert({
      id: uid,
      role: 'instructor',
      first_name: 'Demo',
      last_name: 'Instructor',
      email: DEMO_EMAIL,
      is_exempt: false,
    })
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
        // So the hours page is reachable in the demo. It is gated on this
        // because most of the pool files hours under their own ADP login.
        hours_via_admin: true,
      })
      .select('id, name, profile_id, schedule_token')
      .single()
    if (insErr) throw insErr

    // The promotion goes last, and it has to. Creating the auth user fires a
    // trigger that writes the profiles row with the default role — student — so
    // an earlier upsert setting 'instructor' is quietly overwritten. And
    // profiles.role is the only thing gating the portal: leave it and the demo
    // signs in fine and is bounced off /instructor/expenses.
    const { error: roleErr } = await db
      .from('profiles')
      .update({ role: 'instructor', first_name: 'Demo', last_name: 'Instructor' })
      .eq('id', uid)
    if (roleErr) throw roleErr

    // The calendar feed is a token that is minted the first time somebody asks
    // for it in the portal. Minted here so step 4 of the demo is a working link
    // rather than a button to press on stage.
    const { data: tokened, error: tokErr } = await db
      .from('instructors')
      .update({ schedule_token: crypto.randomUUID() })
      .eq('id', ins.id)
      .select('id, name, profile_id, schedule_token')
      .single()
    if (tokErr) throw tokErr

    demo = tokened
    console.log('  created the demo instructor')
  }

  // Somebody real to be the primary, so the crew list is not one name.
  const { data: primary } = await db
    .from('instructors')
    .select('id')
    .ilike('name', 'Nadav%')
    .maybeSingle()

  const makeCourse = async (title, startOffset, days, status) => {
    const { data: c, error } = await db
      .from('course_instances')
      .insert({
        course_type: 'canyoneering',
        custom_title: `${MARK} — ${title}`,
        client_name: 'Demo Client',
        status,
        location: 'Ouray, Colorado',
        region: 'US-CO',
        starts_at: day(startOffset),
        ends_at: day(startOffset + days - 1),
        max_students: 8,
        lead_slots: 1,
        assist_slots: 2,
        shadow_slots: 1,
        instructor_slots: 4,
        meeting_point: 'Ouray Hot Springs parking lot, north end',
        meeting_time: '07:30',
        intro:
          'Five days of canyon rescue: anchors and rigging, moving water, ' +
          'litter work and a full scenario on the last day.',
      })
      .select('id, ref_number, custom_title, starts_at')
      .single()
    if (error) throw error

    const { error: crewErr } = await db.from('instance_instructors').insert([
      ...(primary ? [{ instance_id: c.id, instructor_id: primary.id, role: 'lead', in_charge: true }] : []),
      { instance_id: c.id, instructor_id: demo.id, role: 'assist', in_charge: false },
    ])
    if (crewErr) throw crewErr
    return c
  }

  if (!upcoming) {
    upcoming = await makeCourse('next month', 27, 5, 'confirmed')
    console.log(`  created PR-${String(upcoming.ref_number).padStart(4, '0')} (next month)`)

    // Curriculum copied from a real course. Invented modules read as invented,
    // and the room knows the difference.
    const { data: src } = await db
      .from('course_instances')
      .select('id, course_modules(id, title, audience, order, course_items(title, type, url, description, order, audience))')
      .eq('ref_number', CURRICULUM_FROM)
      .maybeSingle()
    for (const m of src?.course_modules ?? []) {
      const { data: mod } = await db
        .from('course_modules')
        .insert({ instance_id: upcoming.id, title: m.title, audience: m.audience, order: m.order })
        .select('id')
        .single()
      const items = (m.course_items ?? []).map((it) => ({
        module_id: mod.id,
        title: it.title,
        type: it.type,
        url: it.url,
        description: it.description,
        order: it.order,
        audience: it.audience,
      }))
      if (items.length) await db.from('course_items').insert(items)
    }
    console.log(`    curriculum copied from PR-${String(CURRICULUM_FROM).padStart(4, '0')}`)

    // A gear list, because "what am I bringing" is the question instructors ask
    // first and it is the screen that sells the portal on its own.
    const { data: list, error: listErr } = await db
      .from('gear_lists')
      .insert({
        instance_id: upcoming.id,
        name: 'Personal kit — canyon rescue',
        audience: 'instructor',
        intro: 'Bring all of it. Anything marked per-student is issued, not yours.',
      })
      .select('id')
      .single()
    if (listErr) throw listErr
    const { error: e_gear_list_entries } = await db.from('gear_list_entries').insert(
      [
        ['Harness', 'Personal', 1],
        ['Helmet', 'Personal', 1],
        ['Wetsuit, 5mm', 'Personal', 1],
        ['Canyon boots', 'Personal', 1],
        ['Belay device', 'Technical', 1],
        ['Locking carabiners', 'Technical', 4],
        ['200ft static line', 'Team', 2],
        ['Litter, break-apart', 'Team', 1],
      ].map(([name, section, quantity], i) => ({
        list_id: list.id,
        name,
        section,
        quantity,
        sort_order: i,
      }))
    )
    if (e_gear_list_entries) throw e_gear_list_entries
    console.log('    gear list added')

    const { error: e_course_tasks } = await db.from('course_tasks').insert([
      { instance_id: upcoming.id, title: 'Confirm canyon permits', status: 'done', completed_at: new Date().toISOString(), sort_order: 0 },
      { instance_id: upcoming.id, title: 'Pick up the rental van', status: 'open', assigned_to: demo.profile_id, sort_order: 1 },
      { instance_id: upcoming.id, title: 'Print student packets', status: 'open', sort_order: 2 },
      { instance_id: upcoming.id, title: 'Check litter and hardware', status: 'open', assigned_to: demo.profile_id, sort_order: 3 },
    ])
    if (e_course_tasks) throw e_course_tasks

    const { error: e_course_updates } = await db.from('course_updates').insert([
      {
        instance_id: upcoming.id,
        body: 'Water is running high this month, so day 3 moves to the lower canyon. Same meeting point.',
        audience: 'everyone',
      },
      {
        instance_id: upcoming.id,
        body: 'Crew: we are one assist short. Say something if you know somebody free that week.',
        audience: 'instructors',
      },
    ])
    if (e_course_updates) throw e_course_updates
    console.log('    tasks and updates added')

    // The invite, so the accept flow can be shown live without sending mail.
    const { data: inv } = await db
      .from('course_interest_invites')
      .insert({ instance_id: upcoming.id, instructor_id: demo.id })
      .select('token')
      .single()
    upcoming.inviteToken = inv.token
  }

  if (!finished) {
    finished = await makeCourse('last week', -9, 5, 'completed')
    console.log(`  created PR-${String(finished.ref_number).padStart(4, '0')} (last week)`)

    // An expense report mid-flight: the state an instructor actually opens.
    const { data: report } = await db
      .from('expense_reports')
      .insert({
        profile_id: demo.profile_id,
        reason: `${MARK} — Ouray canyon rescue`,
        status: 'draft',
        default_instance_id: finished.id,
      })
      .select('id')
      .single()
    const { error: e_expense_items } = await db.from('expense_items').insert([
      { report_id: report.id, start_date: day(-10), category: 'lodging', paid_by: 'personal', description: 'Motel, 2 nights', amount: 218.4, instance_id: finished.id, sort_order: 0 },
      { report_id: report.id, start_date: day(-9), category: 'per_diem', paid_by: 'personal', description: 'Crew dinner, 4 people', amount: 96.15, instance_id: finished.id, sort_order: 1 },
      { report_id: report.id, start_date: day(-10), end_date: day(-4), category: 'personal_auto', paid_by: 'personal', description: 'Casper to Ouray and back', miles: 612, amount: 410.04, instance_id: finished.id, sort_order: 2 },
    ])
    if (e_expense_items) throw e_expense_items
    console.log('    draft expense report with 3 lines')
  }
}

if (!demo || !upcoming || !finished) {
  console.log('\n  Nothing built yet. node scripts/demo-day.mjs --create\n')
  process.exit(0)
}

// ── The run of show ─────────────────────────────────────────────────────────
// The link has to keep Supabase's own host — that is the endpoint that verifies
// the token — and send the browser back to wherever we are demoing afterwards.
// Rewriting the host instead points the browser at a verify endpoint that does
// not exist there, which fails in a way that looks like a bad token.
const { data: link, error: linkErr } = await db.auth.admin.generateLink({
  type: 'magiclink',
  email: DEMO_EMAIL,
  options: { redirectTo: `${BASE}/instructor` },
})
if (linkErr) throw linkErr
const signIn = link?.properties?.action_link

const { data: invite } = await db
  .from('course_interest_invites')
  .select('token')
  .eq('instance_id', upcoming.id)
  .eq('instructor_id', demo.id)
  .maybeSingle()

const ref = (c) => `PR-${String(c.ref_number).padStart(4, '0')}`
console.log(`
  ─── Run of show ────────────────────────────────────────────────────────────

  Sign in as Demo Instructor first, in a private window. One click, no email:

    ${signIn}

  1 · "You get asked to work a course"        — no login needed, open this cold
       ${BASE}/staffing/${invite?.token ?? '(none)'}
       The roles, what each pays, the hours, and which ones you'd accept.

  2 · "You're on it"                          — the portal for ${ref(upcoming)}
       ${BASE}/portal/${upcoming.id}
       Details · Prep · Schedule · Updates. Gear list, tasks, meeting point.
       Curriculum is real — copied from ${`PR-${String(CURRICULUM_FROM).padStart(4, '0')}`}.

  3 · "Your own page"
       ${BASE}/instructor
       Profile, certs, expertise, and the calendar feed to subscribe to.

  4 · "Your calendar, in your own calendar app"
       ${BASE}/calendar/${demo.schedule_token ?? '(no token yet — open /instructor once)'}

  5 · "The course ran. Now the paperwork."     — ${ref(finished)}
       ${BASE}/portal/${finished.id}            photos, notes, close-out
       ${BASE}/instructor/expenses              the draft report, 3 lines in
       ${BASE}/instructor/hours                 hours for the pay period

  ─── Afterwards ─────────────────────────────────────────────────────────────

    node scripts/demo-day.mjs --delete

  Removes both courses, the demo instructor, their login and their expense
  report. Nothing was emailed and no calendar events were made.
`)
