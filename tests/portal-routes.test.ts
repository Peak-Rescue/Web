import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { isPortalRoute, NAV_LINKS } from '@/lib/portal-routes'

// The Portal button in the header lights up on portal routes. It used to be
// driven by a list of portal prefixes that nobody remembered to extend, so
// /staffing and then /waiver each shipped with the button reading "you are on
// the public site" while you stood on a page you had reached from the portal.
//
// The rule is inverted now — everything that isn't the marketing site is the
// portal — and this is what keeps it that way. The last test is the one that
// matters: it walks app/ and fails if a route directory exists that the rule
// would treat as public without it being in the nav.

describe('isPortalRoute', () => {
  it('the public site is not the portal', () => {
    for (const p of ['/', '/services', '/team', '/gallery', '/blog', '/contact', '/login']) {
      expect(isPortalRoute(p), p).toBe(false)
    }
  })

  it('nested marketing pages are not the portal either', () => {
    for (const p of ['/blog/influencers-in-the-wild', '/services/stableflight', '/team/somebody', '/auth/confirm']) {
      expect(isPortalRoute(p), p).toBe(false)
    }
  })

  it('portal routes are the portal, tokenized ones included', () => {
    for (const p of [
      '/admin', '/admin/library', '/dashboard', '/instructor/expenses',
      '/portal/abc-123', '/portal/abc/people/def',
      // The four that were wrong or would have been: reached from the portal
      // by somebody signed in, whatever else they are for.
      '/staffing/tok', '/waiver/tok', '/quote/tok', '/share/tok', '/gear-order/tok', '/join/tok',
    ]) {
      expect(isPortalRoute(p), p).toBe(true)
    }
  })

  it('a path that merely starts with a public word is not public', () => {
    // '/teamwork' is not '/team'. Prefix matching has to respect the segment
    // boundary or a future route could be silently classed as marketing.
    expect(isPortalRoute('/teamwork')).toBe(true)
    expect(isPortalRoute('/blogging')).toBe(true)
  })

  it('every route directory in app/ is classified, and only the nav is public', () => {
    const appDir = path.join(process.cwd(), 'app')
    const routes = fs
      .readdirSync(appDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      // Route groups and dynamic segments aren't paths; api isn't a page.
      .filter((n) => !n.startsWith('(') && !n.startsWith('[') && n !== 'api')

    const publicDirs = new Set([...NAV_LINKS.map((l) => l.href.slice(1)), 'login', 'auth'])

    for (const name of routes) {
      const expected = !publicDirs.has(name)
      expect(isPortalRoute(`/${name}`), `/${name} should be ${expected ? 'portal' : 'public'}`).toBe(expected)
    }
  })
})
