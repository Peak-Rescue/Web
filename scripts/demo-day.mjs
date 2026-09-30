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
const STUDENT_EMAIL = process.env.DEMO_STUDENT_EMAIL ?? 'demo.student@peak-rescue.com'
const COPY_FROM = 13 // PR-0013 — the most completely built real course we have

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

const { data: studentRow } = await db
  .from('profiles')
  .select('id')
  .ilike('email', STUDENT_EMAIL)
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
  if (studentRow) {
    // Enrollments go with the courses; the account does not.
    await db.from('profiles').delete().eq('id', studentRow.id)
    await db.auth.admin.deleteUser(studentRow.id).catch(() => {})
    console.log('  deleted the demo student')
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
let student = wiped ? null : studentRow
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

    // The instructor's own page is one of the five screens in the demo, and an
    // empty profile is the least convincing of the five. Filled in with the
    // shape of a real record rather than lorem: a bio that reads like somebody
    // wrote it, certs with real expiry dates (one of them expiring soon, since
    // that is the state the page exists to nag about), and expertise across the
    // disciplines this course actually needs.
    await db
      .from('instructors')
      .update({
        bio:
          'Demo has been working rope and water rescue since 2012, first with a ' +
          'county dive team and then full time in canyon environments. They teach ' +
          'anchors, moving water and litter work, and spend the off season running ' +
          'swiftwater refreshers for municipal teams in the mountain west.',
        certifications: ['SPRAT Level 2', 'Swiftwater Rescue Technician', 'WFR'],
        specialties: ['Canyon rescue', 'Moving water', 'Litter rigging'],
        sectors: ['civilian'],
        show_phone: true,
        show_email: true,
      })
      .eq('id', ins.id)

    const { error: capErr } = await db.from('instructor_capabilities').insert([
      { instructor_id: ins.id, category: 'canyon', role: 'assist' },
      { instructor_id: ins.id, category: 'swiftwater', role: 'assist' },
      { instructor_id: ins.id, category: 'rope', role: 'lead' },
    ])
    if (capErr) console.error('  (capabilities skipped:', capErr.message + ')')

    // instructor_certs.instructor_id points at profiles, not instructors —
    // the column name says otherwise, and a foreign key is how you find out.
    const { error: certErr } = await db.from('instructor_certs').insert([
      { instructor_id: uid, cert_type: 'sprat', level: '2', expires_at: day(400) },
      { instructor_id: uid, cert_type: 'swiftwater', expires_at: day(45) },
      { instructor_id: uid, cert_type: 'wfr', expires_at: day(210) },
    ])
    if (certErr) console.error('  (certs skipped:', certErr.message + ')')

    demo = tokened
    console.log('  created the demo instructor, with bio, certs and expertise')
  }

  // Somebody real to be the primary, so the crew list is not one name.
  const { data: primary } = await db
    .from('instructors')
    .select('id')
    .ilike('name', 'Nadav%')
    .maybeSingle()

  // A real course, copied whole. Everything below this line used to be invented —
  // a five-line intro, eight gear entries, four tasks — and invented content
  // reads as invented to a room of people who have run the real thing. So the
  // demo courses are copies of PR-0013, which is the most completely built course
  // we have: ten modules, a hundred and twelve items, seven tasks, three
  // updates, a gear list and a hundred and seventeen photos.
  //
  // Photos are the one thing that cannot come along. course_photos has a unique
  // index on drive_file_id — deliberately, because the same Drive file recorded
  // twice doubles it in the gallery — so a photo belongs to exactly one course
  // and there is no copying it without taking it off the real one. The demo shows
  // the upload, and the 117 real photos stay where they are.
  //
  // Enrollments deliberately do not copy. Those are five real students with real
  // names and emails, and putting them on a screen in front of the pool is the
  // same mistake as demoing from a real instructor's login.
  const SKIP_ON_COPY = new Set([
    'id', 'ref_number', 'slug', 'created_at', 'updated_at',
    // A copied Google event id would make the demo edit a real course's calendar
    // entry, and a copied token would hand out a live waiver link.
    'gcal_event_id', 'gcal_calendar_id', 'invite_token', 'invite_expires_at',
    'waiver_token', 'waiver_token_expires_at',
  ])

  const copyCourse = async (title, startOffset, status) => {
    const { data: src, error: srcErr } = await db
      .from('course_instances')
      .select('*')
      .eq('ref_number', COPY_FROM)
      .single()
    if (srcErr) throw srcErr

    const days =
      src.starts_at && src.ends_at
        ? Math.round((Date.parse(src.ends_at) - Date.parse(src.starts_at)) / 86400000)
        : 4

    const fields = Object.fromEntries(Object.entries(src).filter(([k]) => !SKIP_ON_COPY.has(k)))
    const { data: c, error } = await db
      .from('course_instances')
      .insert({
        ...fields,
        custom_title: `${MARK} — ${title}`,
        client_name: 'Demo Client',
        status,
        starts_at: day(startOffset),
        ends_at: day(startOffset + days),
        lead_slots: 1,
        assist_slots: 2,
        shadow_slots: 1,
        instructor_slots: 4,
        // The one thing PR-0013 never filled in, and the first thing a student
        // looks for.
        meeting_point: src.meeting_point ?? 'Ouray Hot Springs parking lot, north end',
        meeting_time: src.meeting_time ?? '07:30',
      })
      .select('id, ref_number, custom_title, starts_at')
      .single()
    if (error) throw error

    const { error: crewErr } = await db.from('instance_instructors').insert([
      ...(primary ? [{ instance_id: c.id, instructor_id: primary.id, role: 'lead', in_charge: true }] : []),
      { instance_id: c.id, instructor_id: demo.id, role: 'assist', in_charge: false },
    ])
    if (crewErr) throw crewErr

    // Curriculum: modules, then the items under each.
    const { data: mods } = await db
      .from('course_modules')
      .select('title, audience, order, course_items(title, type, url, description, order, audience, library_item_id)')
      .eq('instance_id', src.id)
    let items = 0
    for (const m of mods ?? []) {
      const { data: mod, error: mErr } = await db
        .from('course_modules')
        .insert({ instance_id: c.id, title: m.title, audience: m.audience, order: m.order })
        .select('id')
        .single()
      if (mErr) throw mErr
      const rows = (m.course_items ?? []).map((it) => ({ ...it, module_id: mod.id }))
      if (rows.length) {
        const { error: iErr } = await db.from('course_items').insert(rows)
        if (iErr) throw iErr
        items += rows.length
      }
    }

    // Gear, with its entries.
    const { data: lists } = await db
      .from('gear_lists')
      .select('name, audience, intro, description, disciplines, topics, students, course_type, gear_list_entries(gear_item_id, name, url, section, group_type, quantity, sort_order, note, joined_above, qty_each, qty_per_students)')
      .eq('instance_id', src.id)
    for (const l of lists ?? []) {
      const { gear_list_entries: entries, ...list } = l
      const { data: made, error: lErr } = await db
        .from('gear_lists')
        .insert({ ...list, instance_id: c.id })
        .select('id')
        .single()
      if (lErr) throw lErr
      if (entries?.length) {
        const { error: eErr } = await db
          .from('gear_list_entries')
          .insert(entries.map((e) => ({ ...e, list_id: made.id })))
        if (eErr) throw eErr
      }
    }

    // The flat children: same columns, new instance.
    const copyRows = async (table, cols) => {
      const { data: rows } = await db.from(table).select(cols).eq('instance_id', src.id)
      if (!rows?.length) return 0
      const { error: e } = await db.from(table).insert(rows.map((r) => ({ ...r, instance_id: c.id })))
      if (e) throw e
      return rows.length
    }
    const tasks = await copyRows('course_tasks', 'title, notes, status, completed_at, sort_order')
    const updates = await copyRows('course_updates', 'body, audience, links, attachments')
    await copyRows('instance_off_days', 'off_date, end_date')
    const links = await copyRows('course_links', 'purpose, label, url, audience, sort_order, drive_folder_id')

    console.log(
      `  copied PR-${String(COPY_FROM).padStart(4, '0')} → PR-${String(c.ref_number).padStart(4, '0')} (${title}): ` +
      `${(mods ?? []).length} modules, ${items} items, ${tasks} tasks, ${updates} updates, ${links} links`
    )
    return c
  }

  if (!upcoming) {
    upcoming = await copyCourse('next month', 27, 'confirmed')
    const { data: inv, error: invErr } = await db
      .from('course_interest_invites')
      .insert({ instance_id: upcoming.id, instructor_id: demo.id })
      .select('token')
      .single()
    if (invErr) throw invErr
  }

  if (!finished) {
    finished = await copyCourse('last week', -9, 'completed')

    const { data: report, error: rErr } = await db
      .from('expense_reports')
      .insert({
        profile_id: demo.profile_id,
        reason: `${MARK} — Ouray canyon rescue`,
        status: 'draft',
        default_instance_id: finished.id,
      })
      .select('id')
      .single()
    if (rErr) throw rErr
    const { error: e_expense_items } = await db.from('expense_items').insert([
      { report_id: report.id, start_date: day(-10), category: 'lodging', paid_by: 'personal', description: 'Motel, 2 nights', amount: 218.4, instance_id: finished.id, sort_order: 0 },
      { report_id: report.id, start_date: day(-9), category: 'per_diem', paid_by: 'personal', description: 'Crew dinner, 4 people', amount: 96.15, instance_id: finished.id, sort_order: 1 },
      { report_id: report.id, start_date: day(-10), end_date: day(-4), category: 'personal_auto', paid_by: 'personal', description: 'Casper to Ouray and back', miles: 612, amount: 410.04, instance_id: finished.id, sort_order: 2 },
    ])
    if (e_expense_items) throw e_expense_items
    console.log('  draft expense report, 3 lines')
  }

  // ── A student, so the room can see what their students see ────────────────
  // Asked for, and worth its own account rather than the admin preview: the
  // preview is honest about most things but it is still an admin looking at a
  // page, and the question in the room will be "what do they actually get".
  if (!student) {
    const { data: created, error: sErr } = await db.auth.admin.createUser({
      email: STUDENT_EMAIL,
      email_confirm: true,
    })
    if (sErr && !/already/i.test(sErr.message)) throw sErr
    let sid = created?.user?.id
    if (!sid) {
      const { data: list } = await db.auth.admin.listUsers({ perPage: 200 })
      sid = list.users.find((u) => u.email?.toLowerCase() === STUDENT_EMAIL)?.id
    }
    await db.from('profiles').update({ role: 'student', first_name: 'Demo', last_name: 'Student' }).eq('id', sid)
    student = { id: sid }
    // On both courses: one to prepare for, one they have been through.
    for (const c of [upcoming, finished]) {
      const { error: eErr } = await db
        .from('enrollments')
        .insert({ instance_id: c.id, user_id: sid })
      if (eErr) throw eErr
    }
    console.log('  created the demo student, enrolled on both')
  }
}

if (!demo || !upcoming || !finished) {
  console.log('\n  Nothing built yet. node scripts/demo-day.mjs --create\n')
  process.exit(0)
}

// ── The run of show ─────────────────────────────────────────────────────────
// Built against our own /auth/callback rather than Supabase's action_link.
//
// That is not a shortcut, it is what this app does: the email templates point at
// /auth/callback with the token hash, deliberately, because some corporate
// networks block *.supabase.co in the browser and the verify hop died there.
// Handing out the action_link instead sends you through the host the app stopped
// using, and you arrive at the login page wondering which password you forgot.
//
// The callback also runs linkStaffAccount, so signing in this way promotes the
// profile exactly as a real instructor's first sign-in does.
const { data: link, error: linkErr } = await db.auth.admin.generateLink({
  type: 'magiclink',
  email: DEMO_EMAIL,
})
if (linkErr) throw linkErr
const callback = (hash, next) =>
  `${BASE}/auth/callback?token_hash=${hash}&type=email&next=${encodeURIComponent(next)}`

const signIn = callback(link.properties.hashed_token, '/instructor')

// The student's own way in, so the room sees the student's course page rather
// than an admin's preview of it. Same page, different person — and the
// difference is the point: no tasks, no crew pay, no pricing.
const { data: sLink } = await db.auth.admin.generateLink({ type: 'magiclink', email: STUDENT_EMAIL })
const studentSignIn = sLink?.properties?.hashed_token
  ? callback(sLink.properties.hashed_token, `/portal/${upcoming.id}`)
  : null

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
       Curriculum is real — copied from ${`PR-${String(COPY_FROM).padStart(4, '0')}`}.

  3 · "What your students see"                — a second private window
       ${studentSignIn ?? '(no student account)'}
       Signs in as Demo Student, straight onto the same course. No tasks, no
       crew, no pricing — and the gear list they get rather than yours.

  4 · "Your own page"
       ${BASE}/instructor
       Profile, certs, expertise, and the calendar feed to subscribe to.

  5 · "Your calendar, in your own calendar app"
       ${BASE}/calendar/${demo.schedule_token ?? '(no token yet — open /instructor once)'}

  6 · "The course ran. Now the paperwork."     — ${ref(finished)}
       ${BASE}/portal/${finished.id}            notes and close-out
       Photos are the one thing not seeded — a Drive file belongs to exactly
       one course, so the 117 on PR-0013 stay there. Upload one live, or show
       PR-0013's gallery from your own admin window.
       ${BASE}/instructor/expenses              the draft report, 3 lines in
       ${BASE}/instructor/hours                 hours for the pay period

  ─── Afterwards ─────────────────────────────────────────────────────────────

    node scripts/demo-day.mjs --delete

  Removes both courses, both accounts, their logins and the expense report.
  Nothing was emailed and no calendar events were made.
`)
