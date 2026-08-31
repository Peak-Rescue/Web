import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  // No fetch ceiling here on purpose: middleware runs on the Edge runtime,
  // where wrapping fetch with an abort signal made every getUser hang until
  // the ceiling fired — 20s and a bounce to /login for a signed-in user.
  //
  // Nothing is missing here. The Node-side clients bound their REST and
  // storage calls and exempt the auth path for the same reason, so this call
  // — which is only ever auth — would be exempt there too.
  //
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
