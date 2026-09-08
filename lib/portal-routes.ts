// Whether a path is the portal rather than the public site.
//
// This lived in the header as a list of portal prefixes — /admin, /portal,
// /instructor, /dashboard — and every route added since had to be remembered
// into it. None of them were: /staffing sat dark for as long as it existed,
// then so did /waiver, and each was found the same way, by someone noticing
// the button was wrong on a page they had reached from the portal. A list that
// fails silently and only ever grows is the wrong shape for the question.
//
// So it asks the other one. The public site is small, stable, and already
// enumerated as the header's own nav — plus the home page and the auth routes.
// Everything else is work, and the button that uses this only renders for
// someone signed in, so "not the public site" and "doing portal work" are the
// same set.
//
// A new portal route now lights the button by existing. The only way to get it
// wrong is to add a *marketing* page and leave it out of the nav, which shows
// up immediately — the Portal button lights up on your new brochure page — and
// which tests/portal-routes.test.ts also watches for.

/** The marketing nav, which is also the definition of the public site. */
export const NAV_LINKS = [
  { href: '/services', label: 'Training' },
  { href: '/team', label: 'Team' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
] as const

const PUBLIC_PREFIXES: string[] = [...NAV_LINKS.map((l) => l.href), '/login', '/auth']

export function isPortalRoute(pathname: string): boolean {
  if (pathname === '/') return false
  return !PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
