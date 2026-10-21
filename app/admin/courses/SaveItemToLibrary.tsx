'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { errorFrom, type ActionResult } from '@/lib/action-result'

// One click, and only ever on a click. A curriculum item typed onto one course
// is often exactly what the library was missing, but whether it belongs on the
// shelves is a judgement, so nothing files it automatically.
//
// A client island in the server-rendered editor because the action can say no
// (already filed, admin-only paperwork) and a <form action> would swallow it.
export default function SaveItemToLibrary({ onSave }: { onSave: () => Promise<ActionResult> }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const r = await onSave()
            if (r?.error) setError(r.error)
            else router.refresh()
          } catch (err) {
            setError(errorFrom(err, 'That didn’t save'))
          } finally {
            setBusy(false)
          }
        }}
        title="File in the content library so another course can pull it in"
        className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save to library'}
      </button>
      {error && <span className="text-[10px] text-pr-red">{error}</span>}
    </span>
  )
}
