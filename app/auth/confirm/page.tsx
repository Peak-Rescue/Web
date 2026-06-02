'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { linkInstructorProfile } from './actions'

function ConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (!access_token || !refresh_token) {
      setFailed(true)
      return
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    supabase.auth.setSession({ access_token, refresh_token }).then(async ({ error }) => {
      if (error) { setFailed(true); return }

      const firstName = searchParams.get('first_name') ?? undefined
      const lastName = searchParams.get('last_name') ?? undefined
      await linkInstructorProfile(firstName, lastName)

      router.replace('/dashboard')
    })
  }, [router, searchParams])

  if (failed) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">This sign-in link has expired or already been used.</p>
          <a href="/login" className="text-zinc-300 underline text-sm">Request a new one</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-400">Signing you in…</p>
    </main>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-400">Signing you in…</p>
      </main>
    }>
      <ConfirmInner />
    </Suspense>
  )
}
