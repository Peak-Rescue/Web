import { cookies } from 'next/headers'
import { VIEW_AS_COOKIE, normalizeViewAs, viewAsChoices } from './view-as-roles'

// Which role somebody is reading the site as.
//
// This used to be a `?as=` query param, which meant every page that wanted the
// preview to survive a click had to thread it onto every link it rendered by
// hand — `portalHref`, `linkHref`, the calendar's `params`, each one a place to
// forget. A preview you can fall out of by clicking the wrong link is worse
// than no preview, because you don't notice; you just start believing the page.
//
// So it is a cookie: set once, read by whatever page you land on. Session-
// scoped on purpose — sticky across a click-through, gone by tomorrow, because
// somebody who forgot they were previewing three days ago is exactly the
// confusion this is meant to prevent. The chip is always visible while it is
// set, which is the other half of that.
//
// Only the route handler at /api/view-as writes it, and only to a role the
// reader actually outranks — see lib/view-as-roles.ts for that rule.

export { VIEW_AS_COOKIE, normalizeViewAs, viewAsChoices, viewAsSelf, type ViewAs } from './view-as-roles'

/**
 * The role this request should be *rendered* as — never the role it is allowed
 * to do things as. Callers pass their own already-established real role, so a
 * stale or hand-set cookie naming a role above the reader's is inert.
 */
export async function readViewAs(role: string | null | undefined) {
  const allowed = viewAsChoices(role)
  if (allowed.length === 0) return null
  const jar = await cookies()
  const asked = normalizeViewAs(jar.get(VIEW_AS_COOKIE)?.value)
  return asked && allowed.includes(asked) ? asked : null
}
