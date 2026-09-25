'use client'

import { useState, useTransition } from 'react'
import { setScheduleLink, clearScheduleLink } from './actions'
import InfoHint from '@/components/InfoHint'

// A subscribable feed of your own field days, for someone outside the company.
// It sits under the Google Calendar invite switch because the two are the same
// question asked about two audiences — where do my courses show up — and the
// answer above is the reason this one exists: the crew calendars are full of
// client names and cannot be handed to anyone's partner.
export default function ScheduleSharePanel({ url }: { url: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 p-6 bg-zinc-900 rounded-lg border border-zinc-800 space-y-3">
      {/* flex, not inline-flex: the button below is inline, and an inline
          heading lets it ride up alongside the icon. */}
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        Share your schedule
        <InfoHint text="Course, town and dates for the days you're working — nothing about the client. Anyone with the link can read it." />
      </h3>

      {url ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-0 truncate text-[11px] text-zinc-500 px-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded">
              {url}
            </code>
            <button
              onClick={copy}
              className="shrink-0 px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-zinc-500 inline-flex items-center gap-1.5">
            In Google Calendar: Other calendars → From URL.
            <InfoHint text="Google names it after the link until it re-reads the file — they can rename it in its settings. It re-reads on its own schedule too, usually within a day, so if a course moves this week, tell them yourself." />
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => run(setScheduleLink)}
              disabled={isPending}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              Replace with a new link
            </button>
            <button
              onClick={() => run(clearScheduleLink)}
              disabled={isPending}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Turn off
            </button>
          </div>
          {/* Said next to the buttons that do it, because "revoke" on an
              unauthenticated URL means only this: the old address stops
              answering, and every copy of it dies at once — including the one
              already subscribed in someone else's calendar. */}
          <p className="text-[11px] text-zinc-600">
            Both stop the current link working everywhere it has been added.
          </p>
        </>
      ) : (
        <button
          onClick={() => run(setScheduleLink)}
          disabled={isPending}
          className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {isPending ? 'Creating…' : 'Create a share link'}
        </button>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
