'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setCourseWaiver, type WaiverTemplateOption } from '@/app/admin/courses/waiver-actions'

// Which waiver a course asks for, chosen where the waiver is read.
//
// Until now this lived only in the course editor, which meant a course created
// this morning could be given everything else from its own page and not the
// one document every student on it has to sign. Nobody is asked to sign
// anything until one is picked, so an unpicked waiver is a silent nothing —
// the worst kind of setting to hide on another screen.
export default function WaiverTemplatePicker({
  instanceId,
  templates,
  selectedId,
}: {
  instanceId: string
  templates: WaiverTemplateOption[]
  selectedId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-pr-red">{error}</p>}
      <select
        value={selectedId ?? ''}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value || null
          setBusy(true); setError(null)
          setCourseWaiver(instanceId, next)
            .then(() => router.refresh())
            .catch((err) => setError(err instanceof Error ? err.message : 'That didn’t save'))
            .finally(() => setBusy(false))
        }}
        className="w-full sm:w-auto bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
      >
        <option value="">No waiver on this course</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}{t.version ? ` (v${t.version})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
