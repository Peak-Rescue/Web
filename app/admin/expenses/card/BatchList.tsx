'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TrashIcon from '@/components/TrashIcon'
import { deleteCardBatch } from './actions'

// What has been brought in, and the way back out.
//
// An import is undoable only while none of its charges have been filed: once
// somebody has said which course a charge belongs to, that answer is theirs
// and re-importing the file would not bring it back. Before that, throwing the
// whole batch away is the right fix for a file whose columns were mapped
// wrong — every row of it is wrong the same way.

export type BatchRow = {
  id: string
  created_at: string
  source_name: string
  row_count: number
  skipped_count: number
  by: string | null
}

export default function BatchList({ batches }: { batches: BatchRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-200 mb-3">Imports</h2>
      {error && <p className="text-xs text-pr-red-light mb-2">{error}</p>}
      <div className="border border-zinc-800 rounded divide-y divide-zinc-800">
        {batches.map((b) => (
          <div key={b.id} className="px-3 py-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-zinc-200 truncate">{b.source_name}</p>
              <p className="text-xs text-zinc-500">
                {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {b.by && <> · {b.by}</>} · {b.row_count} {b.row_count === 1 ? 'charge' : 'charges'}
                {b.skipped_count > 0 && <> · {b.skipped_count} already here</>}
              </p>
            </div>
            <button
              disabled={busy === b.id}
              onClick={async () => {
                setBusy(b.id)
                setError(null)
                try {
                  await deleteCardBatch(b.id)
                  router.refresh()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not undo that import')
                } finally {
                  setBusy(null)
                }
              }}
              title="Undo this import"
              className="text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-40"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
