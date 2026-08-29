import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseFetch } from './fetch'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Never let this throw. A malformed session cookie made getUser throw and
  // returned a 500 for every page that browser asked for, until the user
  // thought to clear cookies; a stalled request now aborts rather than
  // hanging, which would throw here too. Either way the caller is simply not
  // signed in, which the gate below already knows how to handle.
  let user = null
  try {
    ({ data: { user } } = await supabase.auth.getUser())
  } catch (err) {
    console.error('middleware getUser failed:', err instanceof Error ? err.message : err)
  }

  const { pathname } = request.nextUrl

  const isProtected =
    pathname === '/instructor' ||
    pathname.startsWith('/instructor/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/dashboard')

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
