// What a course page looks like before it has loaded.
//
// The page is dynamic — it reads the session and then a course, a roster, a
// schedule — so nothing about it can be prerendered, and until this file
// existed a click on a course sat on the old screen with no acknowledgement
// until the whole thing was ready. This is also what makes the route
// prefetchable at all: Next only prefetches a dynamic route up to its first
// loading boundary, so without one the link had nothing to warm.
//
// Shaped like the real header — reference, title, and the two facts every
// student checks first — so what arrives replaces this rather than shoving it
// down the page.
export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-3xl mx-auto px-4 py-10 animate-pulse" aria-hidden="true">
        <div className="mb-6">
          <div className="h-3 w-40 rounded bg-zinc-800/80 mb-3" />
          <div className="h-8 w-2/3 rounded bg-zinc-800 mb-5" />
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="h-16 rounded-lg border border-zinc-800 bg-zinc-900" />
            <div className="h-16 rounded-lg border border-zinc-800 bg-zinc-900" />
          </div>
        </div>

        {/* The jump bar. */}
        <div className="flex gap-2 flex-wrap mb-8">
          {[14, 20, 16, 18, 12].map((w, i) => (
            <div key={i} className="h-7 rounded-full bg-zinc-900 border border-zinc-800" style={{ width: `${w * 4}px` }} />
          ))}
        </div>

        <div className="space-y-4">
          <div className="h-32 rounded-lg border border-zinc-800 bg-zinc-900/60" />
          <div className="h-48 rounded-lg border border-zinc-800 bg-zinc-900/60" />
          <div className="h-24 rounded-lg border border-zinc-800 bg-zinc-900/60" />
        </div>
      </div>
      <span className="sr-only">Loading course…</span>
    </main>
  )
}
