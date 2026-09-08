'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import InfoHint from '@/components/InfoHint'
import { setCourseWaiver, type WaiverTemplateOption } from './waiver-actions'

// Which waiver this course uses, and how far the course has got with it.
//
// The two belong together: choosing a waiver is the thing that starts asking
// people to sign, so the answer to "did that work" should be in the same
// place. A course with no waiver set says nothing, because nobody was asked.
//
// Who has signed is not here. It is on the student's card in the roster, next
// to the phone number you would call about it — one list of the people on this
// course, not two that can disagree.

export default function CourseWaiverSection({
  instanceId,
  templates,
  selectedId,
  signedCount,
  enrolledCount,
}: {
  instanceId: string
  templates: WaiverTemplateOption[]
  selectedId: string | null
  signedCount: number
  enrolledCount: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const outstanding = enrolledCount - signedCount

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>

      {error && <p className="text-xs text-pr-red mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <select
          value={selectedId ?? ''}
          disabled={busy}
          onChange={(e) => run(() => setCourseWaiver(instanceId, e.target.value || null))}
          className="w-full sm:w-auto bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        >
          <option value="">No waiver on this course</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.version ? ` (v${t.version})` : ''}
            </option>
          ))}
        </select>
        <InfoHint
          below
          text="Changing this doesn’t affect anyone who has already signed — every signature records the version of the text it was shown, and keeps rendering that one."
        />
      </div>

      {selectedId && (
        <div className="mt-4">
          {/* The reassurance about changing the waiver used to sit here as a
              line of its own. It answers a question you have once, next to the
              control that raises it, so it is the control's hint now. */}
          <div className="flex items-baseline gap-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Signed {signedCount} of {enrolledCount}
            </p>
            {outstanding > 0 && (
              <span className="text-xs text-amber-400">{outstanding} outstanding</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
