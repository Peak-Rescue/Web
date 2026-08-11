'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AudienceToggle from '@/components/AudienceToggle'
import { type LibraryAudience } from '@/lib/library'

// One client wrapper for every audience pill in the course editor, taking the
// bound server action for whatever it's setting. Sections and items had drifted
// into different treatments once already; sharing the component is what stops
// that happening again.
export default function AudienceSetter({
  audience,
  action,
  noun,
  showInstructors,
}: {
  audience: LibraryAudience
  action: (next: LibraryAudience) => Promise<void>
  noun: string
  /** Items sit inside a section that already answers this — see the call site. */
  showInstructors?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <span title={failed ? 'That didn’t save — try again' : undefined}>
      <AudienceToggle
        audience={audience}
        disabled={busy}
        noun={noun}
        showInstructors={showInstructors}
        onChange={async (next) => {
          setBusy(true); setFailed(false)
          try {
            await action(next)
            router.refresh()
          } catch {
            setFailed(true)
          } finally {
            setBusy(false)
          }
        }}
      />
    </span>
  )
}
