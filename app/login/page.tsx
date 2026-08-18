'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sendLoginCode, verifyLoginCode } from './actions'

function LoginInner() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Links we sent before Aug 2026 still land here when they fail to verify.
  const notice =
    searchParams.get('error') === 'auth_failed'
      ? 'That sign-in link had already been used or expired. Enter your email below and we will send you a code instead.'
      : ''

  async function handleSend(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    let result
    try {
      result = await sendLoginCode(email)
    } catch {
      result = { ok: false as const, error: 'Something went wrong. Please try again.' }
    }

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

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

    // Signing in changes what every server component renders, so take the
    // whole page rather than a client navigation.
    window.location.assign(searchParams.get('next') || '/dashboard')
  }

  const field =
    'w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red'
  const button =
    'w-full py-2.5 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 text-white font-semibold rounded-lg transition-colors'

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 pt-16 md:pt-20">
      <div className="max-w-md w-full mx-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Peak Rescue Portal</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {sent
              ? 'We sent a code to your email. Enter it below.'
              : 'Access is by invite. Enter the email your invite was sent to.'}
          </p>
        </div>

        {notice && !sent && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </p>
        )}

        {sent ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-zinc-300 mb-1">
                Sign-in code
              </label>
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
                className={`${field} text-center text-2xl tracking-[0.3em] font-mono`}
              />
              <p className="mt-2 text-xs text-zinc-500">
                Sent to {email}. The email has no link in it — type the code here.
              </p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button type="submit" disabled={loading} className={button}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setSent(false); setCode(''); setError('') }}
              className="w-full text-sm text-zinc-400 hover:text-zinc-200 underline"
            >
              Use a different email, or send a new code
            </button>
          </form>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
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
                className={field}
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button type="submit" disabled={loading} className={button}>
              {loading ? 'Sending…' : 'Email me a sign-in code'}
            </button>

            <p className="text-zinc-500 text-xs text-center">
              Nothing arrives? Portal access is by invite — contact your course organizer.
            </p>
          </form>
        )}
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 pt-16 md:pt-20">
        <p className="text-zinc-400">Loading…</p>
      </main>
    }>
      <LoginInner />
    </Suspense>
  )
}
