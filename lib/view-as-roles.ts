// Who may read as whom — the rule itself, with nothing server-only in it.
//
// It lives apart from lib/view-as.ts because the chip that offers the choices
// is a client component and that file reaches for `cookies()`; one import of it
// from the client and the build stops. The rule is the one thing both halves
// need, so it is the one thing in here.

export const VIEW_AS_COOKIE = 'view_as'

export type ViewAs = 'instructor' | 'student'

export function normalizeViewAs(v: string | null | undefined): ViewAs | null {
  return v === 'instructor' || v === 'student' ? v : null
}

/**
 * The previews a real role may enter — you can only ever read *down*.
 *
 * An instructor writes the welcome note, tags a document internal and sets a
 * gear list's quantities, and every one of those decisions is about what a
 * student ends up seeing. Checking it was an admin-only errand for no reason
 * other than that admins got the control first; the thing being checked is the
 * instructor's own work. Downward is the whole rule: a student has nobody below
 * them, and nothing here ever hands anyone a role they don't have.
 */
export function viewAsChoices(role: string | null | undefined): ViewAs[] {
  if (role === 'admin') return ['instructor', 'student']
  if (role === 'instructor') return ['student']
  return []
}

/**
 * The role the chip calls "you" — and null for anyone with nobody below them,
 * which is also the signal not to draw the chip at all.
 */
export function viewAsSelf(role: string | null | undefined): 'admin' | 'instructor' | null {
  return viewAsChoices(role).length > 0 ? (role as 'admin' | 'instructor') : null
}
