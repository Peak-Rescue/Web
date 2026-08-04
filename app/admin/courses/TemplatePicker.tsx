'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyCourseTemplate } from './actions'

export type TemplateOption = {
  id: string
  name: string
  description: string | null
  sections: number
  items: number
  isDefault: boolean
}

// Sets a course up the way that kind of course is normally run: its usual
// sections, filled with references to the same library material. Re-running it
// is safe and is how a course picks up anything added since.
export default function TemplatePicker({
  instanceId,
  templates,
}: {
  instanceId: string
  templates: TemplateOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (templates.length === 0) return null

  async function apply(t: TemplateOption) {
    setBusy(t.id)
    setError(null)
    try {
      const res = await applyCourseTemplate(instanceId, t.id)
      setMsg(
        res.items === 0 && res.sections === 0
          ? `“${t.name}” is already applied.`
          : `Added ${res.items} item${res.items === 1 ? '' : 's'} across ${res.sections} new section${res.sections === 1 ? '' : 's'}.`
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the template.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <p className="text-xs text-zinc-500 mb-2">
        <span className="text-zinc-300 font-medium">Start with a standard setup.</span> Adds the sections and
        material this kind of course normally uses — change anything afterwards.
      </p>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => apply(t)}
            disabled={busy !== null}
            title={`Add ${t.sections} section${t.sections === 1 ? '' : 's'} and ${t.items} item${t.items === 1 ? '' : 's'} from ${t.name}`}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            {busy === t.id ? 'Applying…' : t.name}
            <span className="text-zinc-600 ml-1.5">
              {t.sections} section{t.sections === 1 ? '' : 's'} · {t.items}
            </span>
            {t.isDefault && <span className="text-teal-500/80 ml-1.5">suggested</span>}
          </button>
        ))}
      </div>
      {msg && <p className="text-xs text-teal-400 mt-2">{msg}</p>}
      {error && <p className="text-xs text-pr-red mt-2">{error}</p>}
    </div>
  )
}
