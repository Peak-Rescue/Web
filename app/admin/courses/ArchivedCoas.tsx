'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/expenses'
import { setEstimateArchived, deleteEstimateCoa } from './finance-actions'

export type ArchivedCoa = { id: string; title: string; price: number; archivedAt: string | null }

// COAs that are no longer in play — the option the client turned down, the
// version from before the scope changed. Collapsed to a single line by
// default so the live ones read as the whole picture, and kept rather than
// deleted so what was offered is still on the record.
export default function ArchivedCoas({ instanceId, coas }: { instanceId: string; coas: ArchivedCoa[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(id: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(id)
    try {
      await fn()
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        {coas.length} set aside
        {!open && (
          <span className="text-zinc-600 min-w-0 truncate">
            {coas.map((c) => c.title).join(', ')}
          </span>
        )}
      </button>

      {open && (
        <ul className="mt-2 border-l border-zinc-800 pl-3 space-y-1.5">
          {coas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-zinc-400">{c.title}</span>
              <span className="shrink-0 flex items-center gap-3 text-xs">
                <span className="text-zinc-500 [font-variant-numeric:tabular-nums]">{fmtMoney(c.price)}</span>
                {c.archivedAt && (
                  <span className="text-zinc-600 hidden sm:inline">
                    {new Date(c.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <button
                  onClick={() => run(c.id, () => setEstimateArchived(instanceId, c.id, false))}
                  disabled={busy === c.id}
                  className="text-zinc-500 hover:text-white underline underline-offset-2 transition-colors disabled:opacity-50"
                >
                  Bring back
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`Delete estimate "${c.title}"? Its lines go with it.`)) return
                    void run(c.id, () => deleteEstimateCoa(instanceId, c.id))
                  }}
                  disabled={busy === c.id}
                  className="text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
