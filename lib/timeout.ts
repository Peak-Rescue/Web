// An outbound call with no ceiling is a hang waiting to happen. On Vercel a
// stalled fetch does not fail — it holds the invocation until the platform
// kills it, so the caller watches a spinner for minutes and then gets a
// generic client-side error naming nothing. That is how the Aug 2026 sign-in
// outage presented, and why it took a reproduction to localize.
//
// A ceiling turns that into a normal error, in seconds, with a label saying
// which call stalled.

export const DEFAULT_TIMEOUT_MS = 8_000

export class TimeoutError extends Error {}

export async function withTimeout<T>(
  label: string,
  work: PromiseLike<T>,
  ms: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
