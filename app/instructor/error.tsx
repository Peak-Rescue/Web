'use client'

export default function InstructorError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-zinc-400 mb-6">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-pr-red hover:bg-pr-red-light text-white rounded font-medium transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
