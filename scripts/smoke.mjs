// Renders real pages as a real signed-in user and asserts they come back 200.
//
// Why this exists: every check in this repo up to now was unauthenticated, so
// a course page could return 200 to curl while throwing for an admin. It did.
// A mode switch handed a function to a client component, which only renders
// for admins, and "200 from curl" said the page was fine for two hours while
// every course page was down for the one person who could edit them.
//
// It signs in for real — a magic link minted with the service role and
// exchanged for a session, then written into the cookie @supabase/ssr reads —
// so the pages run exactly the code path a browser gets. Localhost only; the
// session never leaves this machine.
import { createClient } from '@supabase/supabase-js'
import { createChunks } from '@supabase/ssr'
import fs from 'node:fs'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const ref = new globalThis.URL(URL_).hostname.split('.')[0]

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

/** A cookie header carrying a real session for `email`. */
async function sessionCookie(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink(${email}): ${error.message}`)
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (vErr) throw new Error(`verifyOtp(${email}): ${vErr.message}`)
  // The shape @supabase/ssr writes: base64- prefixed JSON, chunked if long.
  const value = 'base64-' + Buffer.from(JSON.stringify(sess.session)).toString('base64')
  return createChunks(`sb-${ref}-auth-token`, value)
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ')
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' })
  const body = res.status === 200 ? await res.text() : ''
  // A 200 that rendered Next's error boundary is a failure wearing a 200.
  const blew = body.includes('A server error occurred') || body.includes('Application error')
  return { status: res.status, ok: res.status === 200 && !blew, blew }
}

const { data: adminRow } = await admin.from('profiles')
  .select('email').eq('role', 'admin').not('email', 'is', null).limit(1).single()
// Somebody actually enrolled, so the student path is exercised by a student
// rather than by an admin pretending — the preview is a preview, not the real
// thing.
const { data: enrolled } = await admin.from('enrollments')
  .select('instance_id, profiles!inner(email, role)')
  .not('profiles.email', 'is', null).neq('profiles.role', 'admin').limit(1).maybeSingle()
// A real instructor, not an admin previewing as one: the library merged the
// two roles onto one page, and only a real instructor proves the gate.
const { data: instructorRow } = await admin.from('profiles')
  .select('email').eq('role', 'instructor').not('email', 'is', null).limit(1).maybeSingle()
const { data: courses } = await admin.from('course_instances')
  .select('id').order('created_at', { ascending: false }).limit(6)

// The library reads for admins and instructors both, so every shelf is worth
// asking for as each of them — the landing, a document shelf, a template shelf
// with its read-only renderer, a search, and page two.
const LIBRARY_PATHS = [
  '/admin/library',
  '/admin/library?bucket=teaching',
  '/admin/library?bucket=teaching&page=1',
  '/admin/library?bucket=map',
  '/admin/library?bucket=gear',
  '/admin/library?bucket=schedule',
  '/admin/library?q=rope',
]

const runs = []
const argv = process.argv.slice(2)
if (argv.length) {
  runs.push({ who: adminRow.email, label: 'admin', paths: argv })
} else {
  runs.push({
    who: adminRow.email, label: 'admin',
    paths: ['/admin', '/admin/courses', '/admin/employee-info',
      ...LIBRARY_PATHS, '/admin/library?status=pending', '/admin/library?status=all',
      ...courses.flatMap((c) => [
      `/portal/${c.id}`,
      `/portal/${c.id}?mode=build`,
      `/portal/${c.id}?mode=teach`,
    ])],
  })
  // The preview is a cookie now rather than a query param, so each role is its
  // own run. Only the pages that render in that role — /admin under a student
  // preview redirects to /dashboard, which a manual-redirect fetch reads as a
  // failure, and rightly: it isn't a page there.
  runs.push({
    who: adminRow.email, label: 'admin as instructor', preview: 'instructor',
    paths: ['/admin', '/admin/employee-info', ...LIBRARY_PATHS, ...courses.map((c) => `/portal/${c.id}`)],
  })
  runs.push({
    who: adminRow.email, label: 'admin as student', preview: 'student',
    paths: ['/dashboard', ...courses.map((c) => `/portal/${c.id}`)],
  })
  if (instructorRow?.email) {
    runs.push({ who: instructorRow.email, label: 'instructor', paths: ['/admin', ...LIBRARY_PATHS] })
  }
  if (enrolled?.profiles?.email) {
    runs.push({
      who: enrolled.profiles.email, label: 'student',
      paths: ['/dashboard', `/portal/${enrolled.instance_id}`],
    })
  }
}

let bad = 0, total = 0
for (const run of runs) {
  const cookie = await sessionCookie(run.who) + (run.preview ? `; view_as=${run.preview}` : '')
  for (const t of run.paths) {
    total++
    const r = await get(t, cookie)
    if (!r.ok) {
      bad++
      console.log(`  ${r.blew ? 'THREW' : `HTTP ${r.status}`}  [${run.label}] ${t}`)
    }
  }
  console.log(`  ${run.label}: ${run.paths.length} pages as ${run.who}`)
}
// The one thing no page render covers: the handler that writes the cookie.
{
  total++
  const cookie = await sessionCookie(adminRow.email)
  const res = await fetch(`${BASE}/api/view-as?as=instructor&next=%2Fadmin`, {
    headers: { cookie }, redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  if (res.status >= 400 || !setCookie.includes('view_as=instructor')) {
    bad++
    console.log(`  HTTP ${res.status} no view_as cookie  [admin] /api/view-as`)
  }
}

console.log(bad === 0 ? `smoke: all ${total} ok` : `smoke: ${bad} of ${total} FAILED`)
process.exit(bad === 0 ? 0 : 1)
