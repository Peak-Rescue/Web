import { cookies } from 'next/headers'

// Which role an admin is reading the site as.
//
// This used to be a `?as=` query param, which meant every page that wanted the
// preview to survive a click had to thread it onto every link it rendered by
// hand — `portalHref`, `linkHref`, the calendar's `params`, each one a place to
// forget. A preview you can fall out of by clicking the wrong link is worse
// than no preview, because you don't notice; you just start believing the page.
//
// So it is a cookie: set once, read by whatever page you land on. Session-
// scoped on purpose — sticky across a click-through, gone by tomorrow, because
// an admin who forgot they were previewing three days ago is exactly the
// confusion this is meant to prevent. The chip is always visible while it is
// set, which is the other half of that.
//
// Only the route handler at /api/view-as writes it, and only for admins.

export const VIEW_AS_COOKIE = 'view_as'

export type ViewAs = 'instructor' | 'student'

export function normalizeViewAs(v: string | null | undefined): ViewAs | null {
  return v === 'instructor' || v === 'student' ? v : null
}

/**
 * The role this request should be *rendered* as — never the role it is allowed
 * to do things as. Callers pass their own already-established `isAdmin`, so a
 * stale or hand-set cookie on a non-admin is inert.
 */
export async function readViewAs(isAdmin: boolean): Promise<ViewAs | null> {
  if (!isAdmin) return null
  const jar = await cookies()
  return normalizeViewAs(jar.get(VIEW_AS_COOKIE)?.value)
}
