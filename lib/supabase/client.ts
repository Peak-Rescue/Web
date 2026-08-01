import { createBrowserClient } from '@supabase/ssr'

// Some corporate networks block *.supabase.co in the browser, which broke
// login and file uploads for those users. Requests try Supabase directly
// (fast path), and on a network-level failure retry through the /sb-api
// rewrite on our own domain (next.config.ts), which proxies server-side.
// Once a request has had to fall back, later ones skip the doomed direct
// attempt for the rest of the page load.
let useProxy = false

function proxiedUrl(url: string): string {
  return url.replace(process.env.NEXT_PUBLIC_SUPABASE_URL!, '/sb-api')
}

async function fetchWithProxyFallback(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString()
  const request = input instanceof Request ? input : undefined

  if (!useProxy) {
    try {
      return await fetch(input, init)
    } catch {
      useProxy = true
    }
  }

  return fetch(
    request ? new Request(proxiedUrl(url), request) : proxiedUrl(url),
    init
  )
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithProxyFallback } }
  )
}
