'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinAsCurrentUser } from '../actions'
import JoinForm from './JoinForm'

// Already signed in: the invite link is the whole flow. One button, no form,
// no email — but still a button, so a shared laptop can't enroll the wrong
// person just by opening a link.
export default function JoinAsSelf({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useForm, setUseForm] = useState(false)

  if (useForm) return <JoinForm token={token} />

  async function handleJoin() {
    setLoading(true)
    setError('')

    let result
    try {
      result = await joinAsCurrentUser(token)
    } catch {
      result = { ok: false as const, error: 'Something went wrong. Please try again.' }
    }

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.replace('/dashboard')
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-zinc-400">
        Signed in as <span className="text-white">{email}</span>
      </p>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        className="w-full py-2.5 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Joining…' : 'Join course'}
      </button>

      <button
        type="button"
        onClick={() => setUseForm(true)}
        className="w-full text-sm text-zinc-400 hover:text-zinc-200 underline"
      >
        Not you? Join with a different email
      </button>
    </div>
  )
}
