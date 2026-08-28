'use client'

import { useState } from 'react'
import { updateCourseLogistics } from '@/app/admin/courses/actions'

// The welcome, edited where it is read.
//
// It is the first thing a student sees on this page and it was only settable
// from the admin course editor — so like the schedule overview, an empty one
// was invisible here and unreachable from here at the same time.
//
// Saves on blur and quietly: the box is uncontrolled, so what you typed is
// already on screen, and the page behind it has a roster and a gear catalog to
// rebuild.
export default function CourseIntroFields({
  instanceId,
  intro,
}: {
  instanceId: string
  intro: string | null
}) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2 mb-2">
      {error && <p className="text-sm text-pr-red">{error}</p>}
      <textarea
        defaultValue={intro ?? ''}
        onBlur={async (e) => {
          if (e.target.value === (intro ?? '')) return
          setError(null)
          const data = new FormData()
          data.set('intro', e.target.value)
          try { await updateCourseLogistics(instanceId, data) }
          catch (err) { setError(err instanceof Error ? err.message : 'That didn’t save') }
        }}
        placeholder="Welcome"
        rows={4}
        className="w-full resize-y bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
      />
    </div>
  )
}
