// Rate limiting for public (unauthenticated) actions that send email or
// create accounts. These are reachable by anyone who can load a page, so
// without a cap they double as a mail-bomb relay wearing our domain.
//
// Fixed-window counter in the rate_limits table: cheap, no extra service, and
// good enough for abuse control (a burst can straddle a window boundary —
// fine at these limits). Fails OPEN: if the ledger itself errors we let the
// request through rather than break a legitimate signup.

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// Best-effort client IP from the proxy headers Vercel sets.
export async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  return (fwd?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim()
}

export async function checkRateLimit(
  admin: Admin,
  action: string,
  subject: string,
  { limit, windowMinutes }: { limit: number; windowMinutes: number }
): Promise<boolean> {
  if (!subject || subject === 'unknown') return true
  try {
    const now = Date.now()
    const windowMs = windowMinutes * 60_000
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString()

    const { data: existing } = await admin
      .from('rate_limits')
      .select('id, count')
      .eq('action', action)
      .eq('subject', subject)
      .eq('window_start', windowStart)
      .maybeSingle()

    if (!existing) {
      await admin.from('rate_limits').insert({ action, subject, window_start: windowStart })
      return true
    }
    if (existing.count >= limit) return false
    await admin.from('rate_limits').update({ count: existing.count + 1 }).eq('id', existing.id)
    return true
  } catch (e) {
    console.error('rate limit check failed (allowing):', e)
    return true
  }
}
