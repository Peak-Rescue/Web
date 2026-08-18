'use client'

import { useState } from 'react'
import { joinCourse } from '../actions'
import { verifyLoginCode } from '@/app/login/actions'

export default function JoinForm({ token }: { token: string }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await joinCourse(token, firstName, lastName, email)

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    // The action already set the session cookies — no mailbox round-trip. Go
    // with a full load, not router.replace: the cached layout was rendered for
    // a signed-out visitor, so a client navigation lands them in the portal
    // under a header still offering "Sign in".
    if (result.signedIn) {
      window.location.assign('/dashboard')
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  // The address already had an account, so the seat is theirs but the session
  // is not: they prove the mailbox with a typed code. No link is emailed —
  // scanners open those before the recipient can.
  async function handleVerify(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    let result
    try {
      result = await verifyLoginCode(email, code)
    } catch {
      result = { ok: false as const, error: 'Something went wrong. Please try again.' }
    }

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    window.location.assign('/dashboard')
  }

  if (submitted) {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">You&rsquo;re enrolled</h2>
          <p className="text-sm text-zinc-400">
            This address already has a Peak Rescue account. We emailed a code to{' '}
            <span className="text-white">{email}</span> — enter it to open your portal.
          </p>
        </div>

        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="12345678"
          className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red text-center text-2xl tracking-[0.3em] font-mono"
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-zinc-300 mb-1">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            required
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Jane"
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-zinc-300 mb-1">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            required
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Smith"
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
          />
        </div>
      </div>

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
        {loading ? 'Joining…' : 'Join course'}
      </button>
    </form>
  )
}
