'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { respondToInvite } from '@/app/staffing/[token]/actions'

export type InterestItem = {
  token: string
  title: string
  client: string | null
  meta: string
  interested: boolean | null
  note: string | null
}

// Portal-home staffing summary: every live invite with the instructor's
// current answer, changeable in place. The row links to the tokenized
// staffing page for full details and the note field; the buttons flip the
// answer directly (keeping any existing note).
export default function StaffingInterestList({ items }: { items: InterestItem[] }) {
  const router = useRouter()
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function answer(item: InterestItem, interested: boolean) {
    if (busyToken || item.interested === interested) return
    setBusyToken(item.token)
    setError(null)
    try {
      const result = await respondToInvite(item.token, { interested, note: item.note ?? '' })
      if (result.ok) router.refresh()
      else setError(result.error)
    } finally {
      setBusyToken(null)
    }
  }

  return (
    <div>
      <div className="space-y-2">
        {items.map((item) => {
          const busy = busyToken === item.token
          return (
            <div
              key={item.token}
              className={`flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 border rounded-lg ${
                item.interested === null ? 'border-yellow-900/50' : 'border-zinc-800'
              }`}
            >
              <Link href={`/staffing/${item.token}`} className="min-w-0 flex-1 group">
                <p className="text-sm font-medium truncate group-hover:text-pr-red-light transition-colors">
                  {item.title}
                  {item.client && <span className="text-zinc-400 font-normal"> · {item.client}</span>}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {item.meta}
                  {item.note ? ` · “${item.note}”` : ''}
                </p>
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => answer(item, true)}
                  disabled={busy}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                    item.interested === true
                      ? 'border-teal-700 bg-teal-900/30 text-teal-300'
                      : 'border-zinc-700 text-zinc-500 hover:border-teal-700 hover:text-teal-300'
                  }`}
                >
                  {item.interested === true ? 'interested ✓' : 'interested'}
                </button>
                <button
                  onClick={() => answer(item, false)}
                  disabled={busy}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                    item.interested === false
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-200'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {item.interested === false ? "can't make it ✓" : "can't make it"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}
      <p className="mt-2 text-xs text-zinc-600">
        You can change your answer anytime until staffing is finalized — open a course to add a note.
      </p>
    </div>
  )
}
