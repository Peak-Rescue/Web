'use client'

// What a broken shelf says instead of taking the page with it.
//
// A thrown error inside a server component renders Vercel's "This page
// couldn't load" with a number on it, and the number means nothing to the
// person holding it: the whole library, including the shelves that are fine,
// is replaced by eight characters of hex. This boundary keeps the rest of the
// page and says what happened where an admin can read it.
export default function ShelfError({ what, error }: { what: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-4">
      <p className="text-sm text-red-200">{what} could not be loaded.</p>
      <p className="text-[11px] text-red-300/70 mt-1 font-mono break-all">{message}</p>
    </div>
  )
}
