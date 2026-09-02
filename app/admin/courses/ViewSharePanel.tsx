'use client'

import { useState, useTransition } from 'react'
import { createViewShare, revokeViewShare } from './actions'
import InfoHint from '@/components/InfoHint'

export type ViewShare = {
  id: string
  url: string
  label: string | null
  expiresAt: string | null
  viewedAt: string | null
  viewCount: number
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// Read-only links to the student page. Sits under the invite link because the
// two answer the same question — "how does this person see the course" — and
// differ only in whether they end up on your roster.
export default function ViewSharePanel({
  instanceId,
  shares,
}: {
  instanceId: string
  shares: ViewShare[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const expiresIn = duration === 'never' ? ('never' as const) : duration ? Number(duration) : undefined

  function run(action: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="mt-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium">View-only links</h3>
          <InfoHint text="For the client contact, or an instructor you haven't staffed yet." />
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          The student page, with no account or enrolment.
        </p>
      </div>

      {shares.length > 0 && (
        <div className="space-y-2">
          {shares.map((s) => {
            const expired = !!s.expiresAt && new Date(s.expiresAt) < new Date()
            return (
              <div key={s.id} className="px-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Who it went to leads, because that is what you are looking
                      for when you come here to revoke one. */}
                  <span className="text-xs text-zinc-300">{s.label || 'Unlabelled'}</span>
                  <code className="flex-1 min-w-0 truncate text-[11px] text-zinc-500">{s.url}</code>
                  <button
                    onClick={() => copy(s.url)}
                    className="shrink-0 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] transition-colors"
                  >
                    {copied === s.url ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => run(() => revokeViewShare(s.id, instanceId))}
                    disabled={isPending}
                    className="shrink-0 text-[11px] text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
                <p className="text-[11px] text-zinc-600">
                  {/* Whether they opened it is the thing you actually want to
                      know when a course is coming up and the kit hasn't been
                      acknowledged. */}
                  {s.viewedAt
                    ? `Opened ${fmt(s.viewedAt)}${s.viewCount > 1 ? ` · ${s.viewCount} views` : ''}`
                    : 'Not opened yet'}
                  {' · '}
                  <span className={expired ? 'text-red-400' : undefined}>
                    {s.expiresAt ? `${expired ? 'expired' : 'expires'} ${fmt(s.expiresAt)}` : 'never expires'}
                  </span>
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who is it for? — e.g. Micah, client POC"
          className="flex-1 min-w-[12rem] bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          <option value="">Valid until course end + 1 week</option>
          <option value="7">Valid for 7 days</option>
          <option value="14">Valid for 14 days</option>
          <option value="30">Valid for 30 days</option>
          <option value="60">Valid for 60 days</option>
          <option value="90">Valid for 90 days</option>
          <option value="never">Never expires</option>
        </select>
        <button
          onClick={() => run(async () => { await createViewShare(instanceId, label, expiresIn); setLabel('') })}
          disabled={isPending}
          className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {isPending ? 'Creating…' : 'Create view-only link'}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
