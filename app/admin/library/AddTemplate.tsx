'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGearList } from '@/app/admin/gear/actions'
import { createSchedule } from '@/app/admin/schedules/actions'
import { TEMPLATE_SHELF_META, type TemplateShelf } from '@/lib/library'

// Start a template here rather than having to run a course to get one. Both
// shelves were only ever fed by "save this course's list as a template", which
// meant a kit list you wanted to write up front had nowhere to live.
export default function AddTemplate({ shelf }: { shelf: TemplateShelf }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = TEMPLATE_SHELF_META[shelf]

  async function add() {
    const name = prompt(`Name the new ${meta.noun}:`)
    if (!name?.trim()) return
    setBusy(true); setError(null)
    try {
      if (shelf === 'gear') {
        await createGearList({ name, audience: 'student', isTemplate: true })
      } else {
        // A schedule with no days is a dead end, so it opens with one to type in.
        await createSchedule({ name, isTemplate: true, days: 1 })
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={add}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded border border-dashed border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        + Blank {meta.noun}
      </button>
      {error && <span className="text-xs text-pr-red">{error}</span>}
    </div>
  )
}
