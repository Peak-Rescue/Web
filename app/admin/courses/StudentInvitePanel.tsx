'use client'

import { useState, useTransition } from 'react'
import { generateInviteLink, revokeInviteLink } from './actions'

export default function StudentInvitePanel({
  instanceId,
  inviteUrl,
  expiresAt,
  expired,
}: {
  instanceId: string
  inviteUrl: string | null
  expiresAt: string | null
  expired: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState('')

  const expiresInDays = duration ? Number(duration) : undefined

  const durationSelect = (
    <select
      value={duration}
      onChange={e => setDuration(e.target.value)}
      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
    >
      <option value="">Valid until course end + 1 week</option>
      <option value="7">Valid for 7 days</option>
      <option value="14">Valid for 14 days</option>
      <option value="30">Valid for 30 days</option>
      <option value="60">Valid for 60 days</option>
      <option value="90">Valid for 90 days</option>
    </select>
  )

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

  async function copy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!inviteUrl) {
    return (
      <div className="p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
        <p className="text-sm text-zinc-400 mb-3">
          No invite link yet. Generate one and send it to the client contact — students use it to
          create their accounts and land enrolled in this course.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {durationSelect}
          <button
            onClick={() => run(() => generateInviteLink(instanceId, expiresInDays))}
            disabled={isPending}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
          >
            {isPending ? 'Generating…' : 'Generate invite link'}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="flex-1 min-w-0 truncate text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-3 py-2">
          {inviteUrl}
        </code>
        <button
          onClick={copy}
          className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={`text-xs ${expired ? 'text-red-400' : 'text-zinc-500'}`}>
          {expiresAt
            ? `${expired ? 'Expired' : 'Expires'} ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'No expiry set'}
        </p>
        <div className="flex items-center gap-3">
          {durationSelect}
          <button
            onClick={() => run(() => generateInviteLink(instanceId, expiresInDays))}
            disabled={isPending}
            className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Regenerate
          </button>
          <button
            onClick={() => run(() => revokeInviteLink(instanceId))}
            disabled={isPending}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
