'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { linkInstructorProfile } from './actions'

function ConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // The tokens arrive in the URL fragment, which the server never sees, so
    // this can only be worked out once the page is in a browser. Every exit
    // goes through the same async path, including the one where the fragment
    // carries no tokens at all: a setState run straight down the body of an
    // effect re-renders on top of the render that just finished, which is what
    // React now flags. `live` is the ordinary guard for a page whose whole job
    // is to navigate away — nothing should be set, or redirected, after it is
    // already gone.
    let live = true

    void (async () => {
      const params = new URLSearchParams(window.location.hash.substring(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')

      if (!access_token || !refresh_token) {
        if (live) setFailed(true)
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) {
        if (live) setFailed(true)
        return
      }

      const firstName = searchParams.get('first_name') ?? undefined
      const lastName = searchParams.get('last_name') ?? undefined
      await linkInstructorProfile(firstName, lastName)

      if (live) router.replace('/dashboard')
    })()

    return () => {
      live = false
    }
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
