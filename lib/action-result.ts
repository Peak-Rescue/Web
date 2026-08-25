// How a server action says no.
//
// Next masks anything thrown out of a server function in a production build:
// the browser gets "An error occurred in the Server Components render…" and a
// digest, never the message. So a carefully worded refusal — "that map is
// already on this course" — reads in production as an unexplained wall of red,
// identical to a database outage. Next's own error-handling guide is blunt
// about it: model expected errors as return values, and keep throwing for
// faults.
//
// Expected here means anything a person can hit by using the screen normally:
// a duplicate, a library item that outranks the toggle, a file too big. A
// failed insert is not expected — that one still throws, and the digest below
// is how it gets traced.

export type ActionResult = void | { error: string }

/** An expected refusal, worded for the person who clicked. */
export function refuse(message: string): { error: string } {
  return { error: message }
}

// A tab loaded before the last deploy posts an action id the running build has
// never heard of. Nothing was written, and the fix is a reload — which the
// stock message never says.
const STALE_ACTION = /Server Action .* was not found on the server/

/**
 * Client-side: what to show for something that was thrown rather than
 * returned. Keeps the digest visible — it's the only handle on the real
 * message, which is sitting in the deployment logs.
 */
export function errorFrom(e: unknown, fallback = 'Something went wrong — please try again.'): string {
  if (!(e instanceof Error)) return fallback
  if (STALE_ACTION.test(e.message)) return 'This page is older than the site — reload it and try again.'
  const digest = (e as { digest?: string }).digest
  if (digest) return `${fallback} (ref ${digest.slice(0, 8)})`
  return e.message || fallback
}
