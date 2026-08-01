'use client'

import { useState } from 'react'
import { sendLoginLink } from './actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // The OTP request runs in a server action: some corporate networks block
    // *.supabase.co in the browser, which hung this form on "Sending…".
    let result
    try {
      result = await sendLoginLink(email)
    } catch {
      result = { ok: false as const, error: 'Something went wrong. Please try again.' }
    }

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 pt-16 md:pt-20">
        <div className="max-w-md w-full mx-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Check your email</h1>
          <p className="text-zinc-400">
            If an account exists for <span className="text-white">{email}</span>, a sign-in
            link is on its way. Click it to access your portal.
          </p>
          <p className="text-zinc-500 text-sm mt-4">
            Nothing arrives? Portal access is by invite — contact your course organizer.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 pt-16 md:pt-20">
      <div className="max-w-md w-full mx-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Peak Rescue Portal</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Access is by invite. Enter the email your invite was sent to.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      </div>
    </main>
  )
}
