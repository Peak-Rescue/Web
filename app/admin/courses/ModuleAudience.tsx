'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AudienceToggle from '@/components/AudienceToggle'
import { type LibraryAudience } from '@/lib/library'
import { setModuleAudience } from './actions'

// The pill on a curriculum section header, made the control it looked like.
// Until now a section's audience was fixed when it was created, so one added
// as instructors-only could only be opened up by deleting and rebuilding it.
export default function ModuleAudience({
  instanceId,
  moduleId,
  audience,
}: {
  instanceId: string
  moduleId: string
  audience: LibraryAudience
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  return (
    <span title={error ? 'That didn’t save — try again' : undefined}>
      <AudienceToggle
        audience={audience}
        disabled={busy}
        noun="this section"
        onChange={async (next) => {
          setBusy(true); setError(false)
          try {
            await setModuleAudience(instanceId, moduleId, next)
            router.refresh()
          } catch {
            setError(true)
          } finally {
            setBusy(false)
          }
        }}
      />
    </span>
  )
}
