'use client'

import Link from 'next/link'

// The library's own error page.
//
// Without one, a throw anywhere in here renders Vercel's "This page couldn't
// load" with a number under it — no navigation, no way back, and nothing to
// tell whether the fault is the shelf you are standing on or the whole
// library. This keeps you inside the app and says which half failed, and the
// digest is what matches the stack in the logs.
export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    // pt-16/20 like every admin page: the site header is fixed, and an error
    // page that forgets it puts its own heading underneath the logo.
    <div className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-2xl mx-auto px-4 py-16">
      <h1 className="text-lg font-semibold mb-2">This shelf didn’t render</h1>
      <p className="text-sm text-zinc-400">
        The rest of the library is fine — this is the page you are on.
      </p>
      <p className="text-[11px] text-zinc-600 font-mono mt-3 break-all">
        {error.message}
        {error.digest && <> · digest {error.digest}</>}
      </p>
        <div className="flex items-center gap-3 mt-5">
        <button
          onClick={reset}
          className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
        >
          Try again
        </button>
        <Link href="/admin/library" className="text-xs text-zinc-500 hover:text-white transition-colors">
          Back to the shelves
        </Link>
        </div>
      </div>
    </div>
  )
}
