'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { copySchedule, saveScheduleIntoTemplate } from './actions'
import type { Schedule, ScheduleTemplateOption } from './types'

// Two ways onto the schedule shelf: a new template, or over one already there.
// Overwriting keeps the template's shelf identity — name, description, tags —
// and replaces its days, so refining a running order on the course you're
// actually teaching is how the reusable one improves.
export default function SaveToShelf({
  schedule, templates, courseType,
}: {
  schedule: Pick<Schedule, 'id' | 'name'>
  templates: ScheduleTemplateOption[]
  courseType?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    fn()
      .then(() => router.refresh())
      .catch((e) => setError(e instanceof Error ? e.message : 'That didn’t work'))
      .finally(() => setBusy(false))
  }

  const [target, setTarget] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {error && <span className="text-pr-red">{error}</span>}
      <button
        onClick={() => {
          const name = prompt('Save this schedule to the library as a new template. Name it:', schedule.name)
          if (name) run(() => copySchedule(schedule.id, { isTemplate: true, name, courseType }))
        }}
        disabled={busy}
        className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        + Save as a new template
      </button>

      {templates.length > 0 && (
        <>
          <span className="text-zinc-700">or update</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={`${input} text-xs max-w-52`}
          >
            <option value="">— pick a template —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.days}d)</option>)}
          </select>
          <button
            onClick={() => {
              const t = templates.find((x) => x.id === target)
              if (!t) return
              if (!confirm(
                `Replace the days on "${t.name}" with this schedule? Its name and tags stay, and courses already using it aren't touched.`
              )) return
              run(async () => { await saveScheduleIntoTemplate(schedule.id, t.id); setTarget('') })
            }}
            disabled={busy || !target}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            Update it
          </button>
        </>
      )}
    </div>
  )
}
