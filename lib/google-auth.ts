// Service-account access tokens, shared by every Google integration.
//
// Calendar, Drive and Classroom each need the same thing: sign a JWT with the
// service account key, optionally naming a Workspace user to act as (that's
// domain-wide delegation), trade it for an access token. Only the scope and
// the impersonated user differ, so that's all this takes as arguments.
//
// Tokens are cached per scope+user until shortly before they expire. The cache
// key has to include the scope — the same user with a different scope is a
// different token, and reusing one across scopes silently loses permissions.

import { createSign } from 'crypto'

type ServiceKey = { client_email: string; private_key: string }

export function serviceKey(): ServiceKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    const k = JSON.parse(raw)
    return k.client_email && k.private_key ? k : null
  } catch {
    return null
  }
}

const cached = new Map<string, { token: string; exp: number }>()

// `subject` is the Workspace user to impersonate; null uses the service
// identity itself, which sees only what's been shared with it directly.
export async function googleToken(scope: string, subject?: string | null): Promise<string> {
  const cacheKey = `${scope}\n${subject ?? ''}`
  const hit = cached.get(cacheKey)
  if (hit && hit.exp > Date.now() + 60_000) return hit.token

  const key = serviceKey()
  if (!key) throw new Error('Google service account not configured')

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    ...(subject ? { sub: subject } : {}),
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  // A scope that hasn't been granted in the admin console fails here, not at
  // the API call, and Google's message ("unauthorized_client") doesn't name
  // the scope — so say which one we asked for.
  if (!res.ok) throw new Error(`Google auth failed for ${scope}: ${await res.text()}`)

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached.set(cacheKey, { token: data.access_token, exp: Date.now() + data.expires_in * 1000 })
  return data.access_token
}
