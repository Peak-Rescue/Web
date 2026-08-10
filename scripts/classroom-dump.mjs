// Dumps one Classroom course's topics and materials, so a migration can be
// shaped against what's actually there rather than guessed at.
//
// Run with: node --env-file=.env.local scripts/classroom-dump.mjs <courseId> <actAs>

import { createSign } from 'crypto'

const [courseId, actAs] = process.argv.slice(2)
if (!courseId || !actAs) {
  console.error('usage: classroom-dump.mjs <courseId> <actAs-email>')
  process.exit(1)
}

const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

async function token(scope) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email, scope, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600, sub: actAs,
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

async function listAll(path, scope, collection) {
  const t = await token(scope)
  const out = []
  let pageToken
  do {
    const qs = new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) })
    const res = await fetch(`https://classroom.googleapis.com/v1/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`)
    const page = await res.json()
    out.push(...(page[collection] ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return out
}

const S = 'https://www.googleapis.com/auth/classroom'

const topics = await listAll(`courses/${courseId}/topics`, `${S}.topics.readonly`, 'topic')
const materials = await listAll(
  `courses/${courseId}/courseWorkMaterials`,
  `${S}.courseworkmaterials.readonly`,
  'courseWorkMaterial'
)

const topicName = new Map(topics.map((t) => [t.topicId, t.name]))
console.log(`${topics.length} topics, ${materials.length} materials\n`)

const byTopic = new Map()
for (const m of materials) {
  const k = m.topicId ? topicName.get(m.topicId) ?? m.topicId : '(no topic)'
  if (!byTopic.has(k)) byTopic.set(k, [])
  byTopic.get(k).push(m)
}

for (const [topic, items] of byTopic) {
  console.log(`## ${topic}`)
  for (const m of items) {
    console.log(`  - ${m.title}${m.state !== 'PUBLISHED' ? `  [${m.state}]` : ''}`)
    for (const a of m.materials ?? []) {
      if (a.driveFile?.driveFile) console.log(`      drive: ${a.driveFile.driveFile.id}  ${a.driveFile.driveFile.title ?? ''}`)
      else if (a.link) console.log(`      link : ${a.link.url}`)
      else if (a.youtubeVideo) console.log(`      video: ${a.youtubeVideo.title ?? a.youtubeVideo.id}`)
      else if (a.form) console.log(`      form : ${a.form.formUrl}`)
    }
  }
  console.log()
}
