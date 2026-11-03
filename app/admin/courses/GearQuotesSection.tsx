'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { unwrap } from '@/lib/gear'
import { fmtMoney } from '@/lib/expenses'
import { GEAR_ORDER_STATUS_LABEL, GEAR_ORDER_STATUS_STYLE, type GearOrderStatus } from '@/lib/gear-orders'
import { createCourseGearQuote } from '@/app/admin/gear/orders/actions'
import InfoHint from '@/components/InfoHint'
import { btn, card } from '@/lib/ui'

export type GearQuoteRow = {
  id: string
  title: string | null
  status: GearOrderStatus
  lines: number
  total: number
  unpriced: number
  anyPriced: boolean
}

// Gear the client asked us to price, as opposed to the gear they are told to
// bring. Each one is an ordinary priced order, edited on its own page; the
// course only lists them and starts new ones with its client filled in.
export default function GearQuotesSection({ instanceId, quotes }: { instanceId: string; quotes: GearQuoteRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true); setError(null)
    try {
      const { id } = unwrap(await createCourseGearQuote(instanceId))
      router.push(`/admin/gear/orders/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {quotes.map((q) => (
        <Link
          key={q.id}
          href={`/admin/gear/orders/${q.id}`}
          className={`${card} flex items-center gap-3 flex-wrap px-4 py-3 hover:border-zinc-600 transition-colors`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{q.title}</span>
            <span className="block text-xs text-zinc-500 mt-0.5">{q.lines} {q.lines === 1 ? 'line' : 'lines'}</span>
          </span>
          {q.anyPriced && (
            <span className="text-sm text-zinc-300">
              {fmtMoney(q.total)}{q.unpriced > 0 && <span className="text-xs text-amber-300/80"> + {q.unpriced} unpriced</span>}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded ${GEAR_ORDER_STATUS_STYLE[q.status]}`}>
            {GEAR_ORDER_STATUS_LABEL[q.status]}
          </span>
        </Link>
      ))}
      <div className="flex items-center gap-2">
        <button type="button" onClick={start} disabled={busy} className={btn.secondary}>
          {busy ? 'Starting…' : 'Price gear for this client'}
        </button>
        <InfoHint text="For gear the client wants to buy from us, priced from the catalog. Separate from the course's gear list, which says what to bring and never shows prices." />
        {error && <span className="text-xs text-pr-red">{error}</span>}
      </div>
    </div>
  )
}
