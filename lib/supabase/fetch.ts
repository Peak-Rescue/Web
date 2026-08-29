// Why Supabase requests from the server get a ceiling and one retry.
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

const REQUEST_TIMEOUT_MS = 10_000
// Server-side storage transfers are legitimately slower than a query.
const STORAGE_TIMEOUT_MS = 30_000

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ms = urlOf(input).includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS

  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    try {
      return await fetch(input, { ...init, signal })
    } catch (err) {
      // The caller's own abort is not ours to retry.
      if (init?.signal?.aborted) throw err
      const stalled = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (attempt === 0 && stalled) {
        console.error(`supabase request stalled after ${ms}ms, retrying on a fresh connection: ${urlOf(input)}`)
        continue
      }
      throw err
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error('supabaseFetch: exhausted attempts')
}
