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
      <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
        Share your schedule
        <InfoHint text="A calendar of the days you're working, for someone who isn't on the crew. It carries the course name, the town and the dates — no client, no contact details, no meeting point. Anyone with the link can read it, so hand it out the way you'd hand out a house key." />
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
            <InfoHint text="Google decides for itself how often to re-read a subscribed URL — usually within a day, sometimes longer, and there's no way to hurry it. If a course moves this week, tell them; don't count on the calendar to." />
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
