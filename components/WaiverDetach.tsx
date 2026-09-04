'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { unlinkWaiverSignature } from '@/app/portal/[id]/waiver-actions'

// "Not them" — the only way back from a waiver attached to the wrong person.
//
// Offered only on a self-entered signature, because that is the one the
// matcher guessed at: somebody typed their own name at a tailgate and we
// decided who they were. A waiver signed from an account is not a guess.
//
// Detaching never deletes: the signature stays valid and returns to the
// unmatched queue below, where it can be attached to whoever it belongs to.

export default function WaiverDetach({
  instanceId,
  signatureId,
}: {
  instanceId: string
  signatureId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await unlinkWaiverSignature(instanceId, signatureId)
          router.refresh()
        } finally {
          setBusy(false)
        }
      }}
      title="Detach this waiver — it stays valid, just unattached"
      className="text-[11px] text-zinc-600 hover:text-pr-red-light disabled:opacity-50 transition-colors"
    >
      Not them
    </button>
  )
}
