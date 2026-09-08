import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIEW_AS_COOKIE, normalizeViewAs } from '@/lib/view-as'

// Sets — or clears — the admin's preview role, then puts them back where they
// were. A GET so the menu can be plain links: no JavaScript, no form, and the
// browser's own back button undoes it the way you'd expect.
//
// Cookies can only be written where response headers are still open, which a
// Server Component isn't. That is the whole reason this handler exists.

/** Same-origin path only — this value goes straight into a redirect. */
function safePath(candidate: string | null, origin: string): string | null {
  if (!candidate) return null
  try {
    // A relative candidate resolves against origin; an absolute one keeps its
    // own, and the origin check below throws it out.
    const u = new URL(candidate, origin)
    if (u.origin !== origin) return null
    return u.pathname + u.search
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const role = normalizeViewAs(url.searchParams.get('as'))
  const back =
    safePath(url.searchParams.get('next'), url.origin) ??
    safePath(request.headers.get('referer'), url.origin) ??
    '/admin'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const login = new URL('/login', url.origin)
    login.searchParams.set('next', back)
    return NextResponse.redirect(login)
  }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()

  const res = NextResponse.redirect(new URL(back, url.origin))
  // Non-admins get sent back untouched rather than refused: there is nothing
  // to protect here beyond not letting them fake a role, and readViewAs already
  // ignores the cookie for them. Clearing it as well keeps a demoted admin from
  // carrying a stale preview around forever.
  if (profile?.role === 'admin' && role) {
    res.cookies.set(VIEW_AS_COOKIE, role, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      // No maxAge — it dies with the browser session. See lib/view-as.ts.
    })
  } else {
    res.cookies.delete({ name: VIEW_AS_COOKIE, path: '/' })
  }
  return res
}
