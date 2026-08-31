// Why Supabase requests from the server get a ceiling, and why the auth path
// is deliberately exempt from it.
//
// Fluid compute keeps instances hot (97% of starts), and Node reuses pooled
// keep-alive sockets to supabase.co across every request an instance serves.
// When one of those sockets dies silently — an idle timeout at a NAT or load
// balancer, with no RST coming back — the next request to reuse it waits
// forever. supabase-js sets no timeout, so the invocation burns its whole
// budget on a socket that will never answer, and Vercel records a Timeout
// against 64ms of active CPU. Every request routed to that instance which
// touches Supabase hangs with it, which is why an outage takes out the
// authenticated pages and the anonymous gallery alike, and why it clears on
// its own once the instance is recycled.
//
// Aborting is what makes this work: it destroys the socket, so the pool drops
// it and the retry dials a fresh connection. A racing timeout would leave the
// dead socket in the pool to poison the next request too.
//
// ---
//
// This wrapper existed once before and was reverted, because applying it to
// everything signed people out. Two things make the auth path different, and
// both of them are reasons never to abort it:
//
//   A refresh token rotates. `POST /auth/v1/token` invalidates the old token
//   the moment the server handles it, and hands back the replacement in the
//   response. Abort while that response is in flight and the server has
//   already rotated: the replacement is lost, the old token is dead, and the
//   session cannot be recovered on any later attempt. The person is signed
//   out for real — not stalled, signed out — which is exactly what was seen.
//
//   auth-js retries on its own. Any thrown fetch error, an abort included, is
//   classified as AuthRetryableFetchError, and _refreshAccessToken retries
//   with backoff for as long as AUTO_REFRESH_TICK_DURATION_MS (30s) allows.
//   A ceiling underneath that loop does not cap anything; it multiplies, and
//   each attempt is another chance to rotate a token we then throw away.
//
// So auth calls pass straight through, unwrapped. They keep the stall this
// fixes elsewhere; the fix for those is to stop sockets going stale in the
// first place (a shorter pool keep-alive than the network's idle timeout),
// not to abort a request that may already have changed something.

const REQUEST_TIMEOUT_MS = 10_000
// Server-side storage transfers are legitimately slower than a query.
const STORAGE_TIMEOUT_MS = 30_000

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)

  // Never put a ceiling on the auth path — see above.
  if (url.includes('/auth/v1/')) return fetch(input, init)

  const ms = url.includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS

  // Only a read gets dialled again. An aborted write may have been applied
  // before the socket was cut — a stalled response is no evidence either way —
  // and repeating it would apply it twice. Writes still get the ceiling, so
  // the dead socket is still destroyed; they just report the failure rather
  // than guessing that it did not happen.
  const method = (init?.method ?? 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'
  const attempts = idempotent ? 2 : 1

  for (let attempt = 0; attempt < attempts; attempt++) {
    const timeout = AbortSignal.timeout(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    try {
      return await fetch(input, { ...init, signal })
    } catch (err) {
      // The caller's own abort is not ours to retry.
      if (init?.signal?.aborted) throw err
      const stalled = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (stalled && attempt < attempts - 1) {
        console.error(`supabase request stalled after ${ms}ms, retrying on a fresh connection: ${url}`)
        continue
      }
      throw err
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error('supabaseFetch: exhausted attempts')
}
